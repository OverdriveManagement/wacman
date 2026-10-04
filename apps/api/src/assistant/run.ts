import Anthropic from "@anthropic-ai/sdk";
import type { FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { db, T, HttpError, type Ctx } from "@wacman/core";
import { env } from "../env.js";
import { toolsFor } from "./tools.js";

const MAX_TURNS = 14;

function systemPrompt(ctx: Ctx, accountName: string, clientName: string) {
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
  return `Tu es l'assistant intégré à WacMan (Wifirst Account Management), l'application de pilotage des comptes clients de Wifirst.
Compte client ouvert : « ${accountName} » (client : ${clientName}). Nous sommes le ${today}.
Utilisateur : ${ctx.user.name}, rôle ${ctx.role} sur ce compte${ctx.user.isSuperAdmin ? " (super-administrateur)" : ""}.

Ce que tu peux faire : lire et modifier le contenu du compte (cartes du kanban, séances et leurs faits marquants, statuts de streams et sujets, risques, contacts, configuration) avec les outils fournis.
Règles :
- Commence par get_overview pour connaître les identifiants (streams, sprints, statuts, types de séance), puis agis.
- N'invente rien : ne reprends que ce que dit l'utilisateur ou ce qui est déjà dans WacMan. S'il manque une information indispensable, demande-la.
- Pour modifier, n'envoie que les champs qui changent. Ne supprime rien sans demande explicite.
- Pour « nouvelle séance à partir de la précédente », utilise create_meeting avec mode previous.
- Les décisions d'un sujet se saisissent dans decisionRequest sur une ligne « Décision : … ».
- Une carte en vigilance ou en alerte a un alertLevelId et ses alertes vont dans alertsNote ; sinon les actions vont dans nextSteps.
- Rédaction en français, sobre : pas de tiret cadratin, pas de flèches, phrases simples, vocabulaire du programme (build, stream, sprint, livrable).
- Mise en forme possible dans les textes saisis : **gras**, *italique*, listes « - » ou « 1. », cases « [ ] » ; rester sobre.
- Une carte peut porter un début prévu (startDate) et une échéance (dueDate) : ils alimentent le planning du Program weekly.
- À la fin, résume en quelques lignes ce que tu as fait (éléments créés ou modifiés), sans recopier tout le contenu.`;
}

function sse(reply: FastifyReply, event: Record<string, unknown>) {
  if (reply.raw.destroyed || reply.raw.writableEnded) return;
  reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

export async function runAssistant(ctx: Ctx, prompt: string, history: { role: "user" | "assistant"; content: string }[], reply: FastifyReply, req: FastifyRequest) {
  if (!env.anthropicApiKey) throw new HttpError(503, "Assistant non configuré : la clé ANTHROPIC_API_KEY est absente côté serveur.");
  const [account] = await db.select().from(T.accounts).where(eq(T.accounts.id, ctx.accountId));
  const client = new Anthropic({ apiKey: env.anthropicApiKey });
  const tools = toolsFor(ctx);

  const origin = req.headers.origin;
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    ...(origin && env.webOrigins.includes(origin) ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true", Vary: "Origin" } : {}),
  });

  const messages: Anthropic.MessageParam[] = [...history.map((h) => ({ role: h.role, content: h.content })), { role: "user", content: prompt }];
  const actions: { tool: string; input: unknown; ok: boolean; error?: string }[] = [];
  let finalText = "";
  let inTok = 0;
  let outTok = 0;
  let aborted = false;
  // la fermeture de la requête entrante survient dès la lecture du corps : on surveille la réponse
  reply.raw.on("close", () => {
    if (!reply.raw.writableEnded) aborted = true;
  });
  reply.raw.on("error", () => (aborted = true));
  // commentaire SSE périodique pour que les relais ne coupent pas un traitement long
  const keepAlive = setInterval(() => {
    if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.write(": ping\n\n");
  }, 15000);

  try {
    for (let turn = 0; turn < MAX_TURNS && !aborted; turn++) {
      const stream = client.messages.stream({
        model: env.anthropicModel,
        max_tokens: 4096,
        system: systemPrompt(ctx, account.name, account.clientName),
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema as Anthropic.Tool.InputSchema })),
        messages,
      });
      stream.on("text", (delta) => {
        finalText += delta;
        sse(reply, { type: "text", delta });
      });
      const msg = await stream.finalMessage();
      inTok += msg.usage.input_tokens;
      outTok += msg.usage.output_tokens;
      messages.push({ role: "assistant", content: msg.content });
      const uses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (msg.stop_reason !== "tool_use" || !uses.length) break;

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const u of uses) {
        const tool = tools.find((t) => t.name === u.name);
        sse(reply, { type: "tool", name: u.name, input: u.input });
        try {
          if (!tool) throw new Error(`Outil inconnu ou non autorisé pour votre rôle : ${u.name}`);
          const out = await tool.run(ctx, (u.input ?? {}) as Record<string, unknown>);
          if (tool.write) {
            actions.push({ tool: u.name, input: u.input, ok: true });
            sse(reply, { type: "action", name: u.name, input: u.input });
          }
          results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out).slice(0, 60000) });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          const details = e instanceof HttpError && e.details ? ` ${JSON.stringify(e.details)}` : "";
          if (tool?.write) actions.push({ tool: u.name, input: u.input, ok: false, error: message });
          results.push({ type: "tool_result", tool_use_id: u.id, content: `Erreur : ${message}${details}`, is_error: true });
        }
      }
      messages.push({ role: "user", content: results });
      if (finalText && !finalText.endsWith("\n")) {
        finalText += "\n\n";
        sse(reply, { type: "text", delta: "\n\n" });
      }
    }
    sse(reply, { type: "done", actions: actions.length, usage: { input: inTok, output: outTok } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    req.log.error({ err: e }, "assistant");
    sse(reply, { type: "error", message: `L'assistant n'a pas pu terminer : ${message}` });
  } finally {
    clearInterval(keepAlive);
    if (!reply.raw.writableEnded) reply.raw.end();
    await db
      .insert(T.assistantRuns)
      .values({ accountId: ctx.accountId, userId: ctx.user.id, prompt, response: finalText, actions, inputTokens: inTok, outputTokens: outTok })
      .catch(() => undefined);
  }
}

export async function listAssistantRuns(ctx: Ctx) {
  return db
    .select({
      id: T.assistantRuns.id,
      prompt: T.assistantRuns.prompt,
      response: T.assistantRuns.response,
      actions: T.assistantRuns.actions,
      createdAt: T.assistantRuns.createdAt,
      userName: T.users.name,
    })
    .from(T.assistantRuns)
    .leftJoin(T.users, eq(T.users.id, T.assistantRuns.userId))
    .where(and(eq(T.assistantRuns.accountId, ctx.accountId), ctx.role === "ADMIN" ? undefined : eq(T.assistantRuns.userId, ctx.user.id)))
    .orderBy(desc(T.assistantRuns.createdAt))
    .limit(30);
}
