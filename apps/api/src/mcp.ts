import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { buildCtx, listAccountsForUser, HttpError, type SessionUser } from "@wacman/core";
import { TOOLS } from "./assistant/tools.js";
import { userFromApiToken } from "./auth.js";

/**
 * Serveur MCP (Model Context Protocol, transport HTTP « streamable », sans état) :
 * expose à Claude (claude.ai, Claude Desktop, Claude Code) les mêmes outils que l'assistant intégré,
 * avec les droits du porteur du jeton d'accès personnel. Chaque modification est tracée dans le journal.
 *
 * Authentification : en-tête « Authorization: Bearer wac_… » sur /api/mcp,
 * ou jeton dans l'adresse (/api/mcp/wac_…) pour les clients qui ne savent pas envoyer d'en-tête.
 */

const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "wacman", title: "WacMan (Wifirst Account Management)", version: "1.1.0" };
const INSTRUCTIONS = `WacMan est l'application de pilotage des comptes clients de Wifirst (kanban des livrables par sprint et par stream, séances avec faits marquants, statuts de streams et sujets, risques et arbitrages, gouvernance).
Commencer par list_accounts pour connaître les comptes accessibles, puis get_overview avec l'identifiant du compte pour connaître les identifiants (streams, sprints, statuts, types de séance).
Chaque outil prend le paramètre account (identifiant du compte). Rédaction en français, sobre, sans tiret cadratin ni flèche. Ne rien supprimer sans demande explicite.`;

type JsonRpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const accountProp = { account: { type: "string", description: "Identifiant (slug) du compte client, renvoyé par list_accounts." } };

function toolList(readOnly: boolean) {
  const list = [
    {
      name: "list_accounts",
      title: "Comptes clients accessibles",
      description: "Liste les comptes clients WacMan accessibles avec ce jeton, avec votre rôle sur chacun.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
    },
    ...TOOLS.filter((t) => !readOnly || !t.write).map((t) => {
      const schema = t.input_schema as { properties?: Record<string, unknown>; required?: string[] };
      return {
        name: t.name,
        description: t.description,
        inputSchema: { type: "object", properties: { ...accountProp, ...(schema.properties ?? {}) }, required: ["account", ...(schema.required ?? [])] },
        annotations: { readOnlyHint: !t.write, destructiveHint: t.name === "delete_item" },
      };
    }),
  ];
  return list;
}

async function callTool(user: SessionUser, readOnly: boolean, name: string, args: Record<string, unknown>) {
  if (name === "list_accounts") {
    const accounts = await listAccountsForUser(user);
    return accounts.filter((a) => !a.archived).map((a) => ({ account: a.slug, name: a.name, client: a.clientName, role: readOnly ? "VIEWER" : a.role }));
  }
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new HttpError(400, `Outil inconnu : ${name}`);
  if (readOnly && tool.write) throw new HttpError(403, "Ce jeton est en lecture seule.");
  const { account, ...rest } = args;
  if (typeof account !== "string" || !account) throw new HttpError(400, "Paramètre account requis (voir list_accounts).");
  const ctx = await buildCtx(user, account, true, readOnly);
  return tool.run(ctx, rest);
}

async function handleOne(msg: JsonRpc, user: SessionUser, readOnly: boolean): Promise<Record<string, unknown> | null> {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Requête JSON-RPC invalide." } };
  const id = msg.id ?? null;
  const isNotification = msg.id === undefined;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return isNotification ? null : fail(-32600, "Requête JSON-RPC invalide.");
  if (msg.method.startsWith("notifications/")) return null;
  switch (msg.method) {
    case "initialize": {
      const asked = String(msg.params?.protocolVersion ?? "");
      return ok({
        protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: toolList(readOnly) });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const out = await callTool(user, readOnly, name, args);
        const text = JSON.stringify(out ?? { ok: true }, null, 1);
        return ok({ content: [{ type: "text", text: text.length > 100_000 ? `${text.slice(0, 100_000)}\n[contenu tronqué]` : text }] });
      } catch (e) {
        // erreurs métier détaillées ; erreurs techniques masquées (pas de requête SQL dans la réponse)
        const message = e instanceof HttpError ? e.message : "erreur technique, réessayez ou contactez l'administrateur";
        const details = e instanceof HttpError && e.details ? ` ${JSON.stringify(e.details)}` : "";
        return ok({ content: [{ type: "text", text: `Erreur : ${message}${details}` }], isError: true });
      }
    }
    case "resources/list":
      return ok({ resources: [] });
    case "prompts/list":
      return ok({ prompts: [] });
    default:
      return isNotification ? null : fail(-32601, `Méthode non prise en charge : ${msg.method}`);
  }
}

async function handle(req: FastifyRequest, reply: FastifyReply) {
  const pathToken = (req.params as { token?: string }).token;
  let user = req.user ?? null;
  if (pathToken) user = await userFromApiToken(req, pathToken);
  if (!user || !req.viaToken) {
    return reply.code(401).header("WWW-Authenticate", 'Bearer realm="wacman"').send({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Jeton d'accès WacMan manquant, invalide ou révoqué." } });
  }
  const readOnly = !!req.readOnlyToken;
  const body = req.body as JsonRpc | JsonRpc[] | null | undefined;
  if (body === null || body === undefined || typeof body !== "object") {
    return reply.code(400).send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Corps JSON-RPC attendu." } });
  }
  const batch = Array.isArray(body);
  if (batch && !body.length) return reply.code(400).send({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Lot JSON-RPC vide." } });
  const msgs = batch ? body : [body];
  const out: Record<string, unknown>[] = [];
  for (const m of msgs) {
    const r = await handleOne(m, user, readOnly);
    if (r) out.push(r);
  }
  if (!out.length) return reply.code(202).send();
  return reply.header("Content-Type", "application/json").send(batch ? out : out[0]);
}

export async function registerMcp(app: FastifyInstance) {
  const notStreaming = async (_req: FastifyRequest, reply: FastifyReply) =>
    reply.code(405).header("Allow", "POST").send({ error: "Flux serveur non proposé : utilisez POST." });
  app.post("/api/mcp", handle);
  app.post("/api/mcp/:token", handle);
  app.get("/api/mcp", notStreaming);
  app.get("/api/mcp/:token", notStreaming);
  app.delete("/api/mcp", async (_req, reply) => reply.code(204).send());
  app.delete("/api/mcp/:token", async (_req, reply) => reply.code(204).send());
}
