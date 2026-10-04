import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { assertRole, badRequest, db, HttpError, isUuid, meetingChanges, meetingWithType, T, type Ctx } from "@wacman/core";
import { env } from "./env.js";

/**
 * Appels ponctuels à Claude, hors de l'assistant conversationnel :
 * - extraction des actions, livrables et décisions d'un compte rendu d'atelier (transcription) ;
 * - brouillon de faits marquants à partir de ce qui a changé depuis la séance précédente.
 * Claude répond par un outil au format imposé ; rien n'est enregistré sans validation de l'utilisateur.
 */

const STYLE =
  "Rédaction en français, sobre et factuelle : pas de tiret cadratin, pas de flèche, phrases simples, vocabulaire du programme (build, stream, sprint, livrable, lot). N'invente rien : ne reprends que ce que dit le texte fourni.";

function client() {
  if (!env.anthropicApiKey) throw new HttpError(503, "Claude n'est pas configuré : la clé ANTHROPIC_API_KEY est absente côté serveur.");
  return new Anthropic({ apiKey: env.anthropicApiKey });
}

async function callTool<T>(system: string, user: string, tool: Anthropic.Tool): Promise<T> {
  const msg = await client().messages.create({
    model: env.anthropicModel,
    max_tokens: 8000,
    system,
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [{ role: "user", content: user }],
  });
  const use = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === tool.name);
  if (!use) throw new HttpError(502, "Claude n'a pas renvoyé de proposition exploitable. Réessayez.");
  return use.input as T;
}

async function context(ctx: Ctx) {
  const [account] = await db.select().from(T.accounts).where(eq(T.accounts.id, ctx.accountId));
  const [streams, contacts, statuses, sprints, levels, types] = await Promise.all([
    db.select().from(T.streams).where(and(eq(T.streams.accountId, ctx.accountId), eq(T.streams.active, true))),
    db.select().from(T.contacts).where(eq(T.contacts.accountId, ctx.accountId)),
    db.select().from(T.options).where(and(eq(T.options.accountId, ctx.accountId), eq(T.options.kind, "CARD_STATUS"))),
    db.select().from(T.sprints).where(eq(T.sprints.accountId, ctx.accountId)),
    db.select().from(T.options).where(and(eq(T.options.accountId, ctx.accountId), eq(T.options.kind, "HIGHLIGHT_TYPE"))),
    db.select().from(T.meetingTypes).where(eq(T.meetingTypes.accountId, ctx.accountId)),
  ]);
  return { account, streams, contacts, statuses, sprints, levels, types };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Rapproche un nom proposé par Claude d'un élément existant (stream, contact, type…). */
function pick<X extends { id: string }>(list: X[], label: (x: X) => string, value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const v = norm(value);
  const exact = list.find((x) => norm(label(x)) === v);
  if (exact) return exact.id;
  const partial = list.find((x) => norm(label(x)).includes(v) || v.includes(norm(label(x))));
  return partial?.id ?? null;
}

const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);

// ---------------------------------------------------------------------------
// Compte rendu d'atelier : texte extrait d'un fichier ou collé
// ---------------------------------------------------------------------------

/** Texte d'un fichier déposé : .txt, .md, .vtt, .srt, .docx. */
export async function fileToText(name: string, base64: string): Promise<string> {
  const buf = Buffer.from(base64, "base64");
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return value;
  }
  if (["txt", "md", "vtt", "srt", "csv"].includes(ext)) {
    let t = buf.toString("utf8").replace(/^﻿/, "");
    // sous-titres : numéros de séquence et horodatages retirés
    if (ext === "vtt" || ext === "srt") t = t.replace(/^WEBVTT.*$/m, "").replace(/^\d+\s*$/gm, "").replace(/^[\d:.,]+\s*-->\s*[\d:.,]+.*$/gm, "").replace(/\n{2,}/g, "\n");
    return t;
  }
  throw badRequest("Format non pris en charge : déposez un fichier .docx, .txt, .md, .vtt ou .srt, ou collez le texte.");
}

const extractInput = z.object({
  text: z.string().max(400_000).optional(),
  file: z.object({ name: z.string().max(200), base64: z.string().max(20_000_000) }).optional(),
  streamId: z.string().nullable().optional(),
  meetingTypeId: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  title: z.string().max(300).optional(),
});

export async function extractFromTranscript(ctx: Ctx, input: unknown) {
  assertRole(ctx, "EDITOR");
  const p = extractInput.safeParse(input);
  if (!p.success) throw badRequest("Données invalides.");
  let text = p.data.text ?? "";
  if (p.data.file) text = await fileToText(p.data.file.name, p.data.file.base64);
  text = text.trim();
  if (text.length < 40) throw badRequest("Le compte rendu est vide ou trop court.");
  if (text.length > 250_000) text = text.slice(0, 250_000);
  const c = await context(ctx);
  const focus = p.data.streamId && isUuid(p.data.streamId) ? c.streams.find((s) => s.id === p.data.streamId)?.name : null;
  const clientName = c.account?.clientName ?? "le client";
  const system = `Tu analyses le compte rendu ou la transcription d'un atelier du programme de build mené par Wifirst pour ${clientName}.
Tu proposes ce qu'il faut tracer dans l'outil de pilotage : les actions décidées (qui fait quoi, pour quand), les livrables nouveaux à suivre comme cartes du kanban, et les décisions prises ou attendues.
${STYLE}
Une action commence par un verbe à l'infinitif. Le porteur est « WIFIRST », « CLIENT » (${clientName}) ou « JOINT ». Le nom du porteur et le stream ne sont renseignés que s'ils sont dits ou évidents ; une échéance n'est donnée que si le texte la précise (format AAAA-MM-JJ, année ${new Date().getFullYear()} si elle est implicite).
Streams existants : ${c.streams.map((s) => s.name).join(", ")}.
Contacts connus : ${c.contacts.map((x) => x.name).join(", ") || "aucun"}.
Pas de doublon : une même chose n'est proposée qu'une fois, dans la rubrique la plus juste. Une phrase de justification courte (« source ») cite le passage concerné.`;
  const user = `${p.data.title ? `Atelier : ${p.data.title}\n` : ""}${p.data.date ? `Date : ${p.data.date}\n` : ""}${focus ? `Stream principal : ${focus}\n` : ""}\nCompte rendu :\n"""\n${text}\n"""`;
  const tool: Anthropic.Tool = {
    name: "proposer_suivi",
    description: "Propositions d'actions, de livrables (cartes) et de décisions tirées du compte rendu.",
    input_schema: {
      type: "object",
      properties: {
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              party: { type: "string", enum: ["WIFIRST", "CLIENT", "JOINT"] },
              owner: { type: "string" },
              stream: { type: "string" },
              dueDate: { type: "string" },
              source: { type: "string" },
            },
            required: ["title", "party"],
          },
        },
        cards: {
          type: "array",
          items: {
            type: "object",
            properties: { title: { type: "string" }, description: { type: "string" }, stream: { type: "string" }, owner: { type: "string" }, dueDate: { type: "string" }, source: { type: "string" } },
            required: ["title"],
          },
        },
        decisions: {
          type: "array",
          items: {
            type: "object",
            properties: { title: { type: "string" }, detail: { type: "string" }, status: { type: "string", enum: ["TAKEN", "PENDING"] }, stream: { type: "string" }, source: { type: "string" } },
            required: ["title", "status"],
          },
        },
      },
      required: ["actions", "cards", "decisions"],
    },
  };
  type Raw = {
    actions?: { title: string; party?: string; owner?: string; stream?: string; dueDate?: string; source?: string }[];
    cards?: { title: string; description?: string; stream?: string; owner?: string; dueDate?: string; source?: string }[];
    decisions?: { title: string; detail?: string; status?: string; stream?: string; source?: string }[];
  };
  const raw = await callTool<Raw>(system, user, tool);
  const streamOf = (v: unknown) => pick(c.streams, (s) => s.name, v) ?? (focus ? (p.data.streamId as string) : null);
  const ownerOf = (v: unknown) => pick(c.contacts, (x) => x.name, v);
  return {
    chars: text.length,
    actions: (raw.actions ?? []).filter((a) => a?.title?.trim()).map((a) => ({
      title: a.title.trim(),
      party: (["WIFIRST", "CLIENT", "JOINT"].includes(a.party ?? "") ? a.party : "WIFIRST") as "WIFIRST" | "CLIENT" | "JOINT",
      ownerId: ownerOf(a.owner),
      ownerName: a.owner ?? "",
      streamId: streamOf(a.stream),
      dueDate: isoDate(a.dueDate),
      source: a.source ?? "",
    })),
    cards: (raw.cards ?? []).filter((x) => x?.title?.trim()).map((x) => ({
      title: x.title.trim(),
      description: x.description ?? "",
      streamId: streamOf(x.stream),
      ownerId: ownerOf(x.owner),
      dueDate: isoDate(x.dueDate),
      source: x.source ?? "",
    })),
    decisions: (raw.decisions ?? []).filter((x) => x?.title?.trim()).map((x) => ({
      title: x.title.trim(),
      detail: x.detail ?? "",
      status: (x.status === "PENDING" ? "PENDING" : "TAKEN") as "PENDING" | "TAKEN",
      streamId: streamOf(x.stream),
      source: x.source ?? "",
    })),
  };
}

// ---------------------------------------------------------------------------
// Brouillon de faits marquants d'une séance
// ---------------------------------------------------------------------------

export async function suggestHighlights(ctx: Ctx, meetingId: string) {
  assertRole(ctx, "EDITOR");
  const { m } = await meetingWithType(ctx, meetingId);
  const changes = await meetingChanges(ctx, meetingId);
  const c = await context(ctx);
  const sname = (id: string | null) => c.streams.find((s) => s.id === id)?.name ?? "Transverse";
  const alerts = await db
    .select()
    .from(T.cards)
    .where(and(eq(T.cards.accountId, ctx.accountId), eq(T.cards.archived, false)));
  const open = alerts.filter((x) => x.alertLevelId);
  const lines: string[] = [];
  const push = (title: string, list: { ref: number; title: string; streamId: string | null; alertsNote?: string; progressNote?: string }[]) => {
    if (!list.length) return;
    lines.push(`${title} :`);
    for (const x of list) lines.push(`- #${x.ref} ${x.title} (${sname(x.streamId)})${x.progressNote ? ` ; avancement : ${x.progressNote.slice(0, 300)}` : ""}${x.alertsNote ? ` ; alertes : ${x.alertsNote.slice(0, 300)}` : ""}`);
  };
  push("Livrables terminés", changes.cards.done);
  push("Livrables créés", changes.cards.created);
  push("Passés en vigilance ou en alerte", changes.cards.alertUp);
  push("Sortis d'alerte", changes.cards.alertDown);
  push("Changement de statut", changes.cards.moved);
  if (changes.decisions.length) lines.push("Décisions :", ...changes.decisions.map((d) => `- ${d.status === "TAKEN" ? "prise" : "attendue"} : ${d.title}`));
  if (changes.actions.closed.length) lines.push("Actions closes :", ...changes.actions.closed.map((a) => `- ${a.title}`));
  push("Cartes en vigilance ou en alerte à date", open.map((x) => ({ ...x, progressNote: "" })));
  if (!lines.length) throw badRequest("Rien n'a changé depuis la séance précédente : pas de proposition possible.");
  const system = `Tu prépares les faits marquants d'une séance de pilotage du programme de build mené par Wifirst pour ${c.account?.clientName ?? "le client"}.
Un fait marquant est un intitulé court (quelques mots) et deux ou trois lignes de détail factuelles, une idée par ligne, sans formule d'introduction.
${STYLE}
Propose 3 à 6 faits marquants, du plus important au moins important, à partir de la liste des changements. Regroupe ce qui va ensemble. Type parmi : ${c.levels.map((l) => l.label).join(", ") || "aucun"}. Stream parmi : ${c.streams.map((s) => s.name).join(", ")} ou Transverse.`;
  const user = `Séance du ${m.date}, changements depuis le ${changes.since} :\n${lines.join("\n")}`;
  const tool: Anthropic.Tool = {
    name: "proposer_faits_marquants",
    description: "Faits marquants proposés pour la séance.",
    input_schema: {
      type: "object",
      properties: {
        highlights: {
          type: "array",
          items: {
            type: "object",
            properties: { title: { type: "string" }, detail: { type: "string" }, stream: { type: "string" }, type: { type: "string" } },
            required: ["title", "detail"],
          },
        },
      },
      required: ["highlights"],
    },
  };
  const raw = await callTool<{ highlights?: { title: string; detail: string; stream?: string; type?: string }[] }>(system, user, tool);
  return {
    highlights: (raw.highlights ?? [])
      .filter((h) => h?.title?.trim())
      .map((h) => ({
        title: h.title.trim(),
        detail: (h.detail ?? "").trim(),
        streamId: pick(c.streams, (s) => s.name, h.stream),
        typeId: pick(c.levels, (l) => l.label.replace(/^\p{Extended_Pictographic}\s*/u, ""), h.type),
      })),
  };
}
