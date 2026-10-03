import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  HttpError,
  badRequest,
  buildCtx,
  listAccountsForUser,
  getAccountBootstrap,
  createAccount,
  updateAccount,
  listEntities,
  createEntity,
  updateEntity,
  deleteEntity,
  reorderEntities,
  getEntityRow,
  listCards,
  moveCard,
  switchSprint,
  listMeetings,
  getMeeting,
  createMeeting,
  listComments,
  addComment,
  deleteComment,
  listAudit,
  listMembers,
  addMember,
  updateMember,
  removeMember,
  listAllUsers,
  adminCreateUser,
  adminUpdateUser,
  importAccount,
  exportAccount,
  accountCounts,
  startLogin,
  verifyLogin,
  changeOwnPassword,
  toSessionUser,
} from "@wacman/core";
import { env } from "./env.js";
import { clearSessionCookie, requireUser, setSessionCookie, signAssistantToken, signSession, throttle } from "./auth.js";
import { sendLoginCode } from "./mail.js";
import { buildCardsWorkbook, buildMeetingsWorkbook } from "./exports/xlsx.js";
import { buildDeck } from "./exports/pptx.js";
import { runAssistant, listAssistantRuns } from "./assistant/run.js";

type P = { acc: string; entity: string; id: string; type: string; commentId: string };

async function ctxOf(req: FastifyRequest) {
  const user = requireUser(req);
  const { acc } = req.params as P;
  return buildCtx(user, acc);
}

export async function registerRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => ({ ok: true, service: "wacman-api", time: new Date().toISOString() }));

  // -------------------------------------------------------------------------
  // Authentification (mot de passe + code par e-mail)
  // -------------------------------------------------------------------------
  app.post("/api/auth/login", async (req) => {
    const b = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
    if (!b.success) throw badRequest("E-mail et mot de passe requis.");
    throttle(`login:${req.ip}:${b.data.email.toLowerCase()}`);
    const { challengeId, code, user } = await startLogin(b.data.email, b.data.password);
    await sendLoginCode(user.email, user.name, code, (m) => req.log.info(m));
    return { challengeId, email: user.email.replace(/^(.).*(@.*)$/, "$1•••$2"), ...(env.devShowOtp ? { devCode: code } : {}) };
  });

  app.post("/api/auth/verify", async (req, reply) => {
    const b = z.object({ challengeId: z.string(), code: z.string().min(4).max(10) }).safeParse(req.body);
    if (!b.success) throw badRequest("Code requis.");
    throttle(`verify:${req.ip}`, 20);
    const user = await verifyLogin(b.data.challengeId, b.data.code);
    setSessionCookie(reply, await signSession(user));
    return { user: toSessionUser(user) };
  });

  app.post("/api/auth/logout", async (_req, reply) => {
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/api/auth/me", async (req) => {
    const user = requireUser(req);
    return { user, accounts: await listAccountsForUser(user) };
  });

  app.post("/api/auth/password", async (req) => {
    const user = requireUser(req);
    const b = z.object({ current: z.string(), next: z.string() }).safeParse(req.body);
    if (!b.success) throw badRequest("Données invalides.");
    return changeOwnPassword(user, b.data.current, b.data.next);
  });

  app.get("/api/auth/assistant-token", async (req) => {
    const user = requireUser(req);
    const { db, T } = await import("@wacman/core");
    const { eq } = await import("drizzle-orm");
    const [u] = await db.select().from(T.users).where(eq(T.users.id, user.id));
    return { token: await signAssistantToken(u) };
  });

  // -------------------------------------------------------------------------
  // Comptes clients
  // -------------------------------------------------------------------------
  app.get("/api/accounts", async (req) => listAccountsForUser(requireUser(req)));
  app.post("/api/accounts", async (req) => createAccount(requireUser(req), req.body));
  app.get("/api/accounts/:acc", async (req) => getAccountBootstrap(await ctxOf(req)));
  app.patch("/api/accounts/:acc", async (req) => updateAccount(await ctxOf(req), req.body));

  app.get("/api/accounts/:acc/members", async (req) => listMembers(await ctxOf(req)));
  app.post("/api/accounts/:acc/members", async (req) => addMember(await ctxOf(req), req.body));
  app.patch("/api/accounts/:acc/members/:id", async (req) =>
    updateMember(await ctxOf(req), (req.params as P).id, (req.body as { role: string })?.role),
  );
  app.delete("/api/accounts/:acc/members/:id", async (req) => removeMember(await ctxOf(req), (req.params as P).id));

  // -------------------------------------------------------------------------
  // Entités génériques (configuration et contenu)
  // -------------------------------------------------------------------------
  app.get("/api/accounts/:acc/e/:entity", async (req) => {
    const ctx = await ctxOf(req);
    const q = req.query as Record<string, string>;
    const filters: Record<string, string | boolean> = {};
    for (const [k, v] of Object.entries(q)) filters[k] = v === "true" ? true : v === "false" ? false : v;
    return listEntities(ctx, (req.params as P).entity, filters);
  });
  app.get("/api/accounts/:acc/e/:entity/:id", async (req) => getEntityRow(await ctxOf(req), (req.params as P).entity, (req.params as P).id));
  app.post("/api/accounts/:acc/e/:entity", async (req) => createEntity(await ctxOf(req), (req.params as P).entity, req.body));
  app.post("/api/accounts/:acc/e/:entity/reorder", async (req) => {
    const b = z.object({ ids: z.array(z.string()) }).safeParse(req.body);
    if (!b.success) throw badRequest("Liste d'identifiants attendue.");
    return reorderEntities(await ctxOf(req), (req.params as P).entity, b.data.ids);
  });
  app.patch("/api/accounts/:acc/e/:entity/:id", async (req) =>
    updateEntity(await ctxOf(req), (req.params as P).entity, (req.params as P).id, req.body),
  );
  app.delete("/api/accounts/:acc/e/:entity/:id", async (req) => deleteEntity(await ctxOf(req), (req.params as P).entity, (req.params as P).id));

  // -------------------------------------------------------------------------
  // Program Management
  // -------------------------------------------------------------------------
  app.get("/api/accounts/:acc/cards", async (req) => {
    const q = req.query as { sprintId?: string; includeArchived?: string };
    return listCards(await ctxOf(req), { sprintId: q.sprintId, includeArchived: q.includeArchived === "true" });
  });
  app.post("/api/accounts/:acc/cards/:id/move", async (req) => moveCard(await ctxOf(req), (req.params as P).id, req.body));
  app.post("/api/accounts/:acc/sprints/switch", async (req) => switchSprint(await ctxOf(req), req.body));

  app.get("/api/accounts/:acc/meetings", async (req) => {
    const q = req.query as { typeId?: string };
    if (!q.typeId) throw badRequest("typeId requis.");
    return listMeetings(await ctxOf(req), q.typeId);
  });
  app.get("/api/accounts/:acc/meetings/:id", async (req) => getMeeting(await ctxOf(req), (req.params as P).id));
  app.post("/api/accounts/:acc/meetings", async (req) => createMeeting(await ctxOf(req), req.body));

  app.get("/api/accounts/:acc/comments/:type/:id", async (req) => listComments(await ctxOf(req), (req.params as P).type, (req.params as P).id));
  app.post("/api/accounts/:acc/comments/:type/:id", async (req) =>
    addComment(await ctxOf(req), (req.params as P).type, (req.params as P).id, (req.body as { body: string })?.body),
  );
  app.delete("/api/accounts/:acc/comments/:commentId", async (req) => deleteComment(await ctxOf(req), (req.params as P).commentId));

  app.get("/api/accounts/:acc/audit", async (req) => {
    const q = req.query as { entityType?: string; entityId?: string; limit?: string };
    return listAudit(await ctxOf(req), { entityType: q.entityType, entityId: q.entityId, limit: q.limit ? Number(q.limit) : undefined });
  });

  // -------------------------------------------------------------------------
  // Exports
  // -------------------------------------------------------------------------
  app.get("/api/accounts/:acc/export/cards.xlsx", async (req, reply) => {
    const ctx = await ctxOf(req);
    const { sprintId } = req.query as { sprintId?: string };
    const { buffer, filename } = await buildCardsWorkbook(ctx, sprintId);
    return sendFile(reply, buffer, filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });
  app.get("/api/accounts/:acc/export/meetings.xlsx", async (req, reply) => {
    const ctx = await ctxOf(req);
    const { typeId } = req.query as { typeId?: string };
    if (!typeId) throw badRequest("typeId requis.");
    const { buffer, filename } = await buildMeetingsWorkbook(ctx, typeId);
    return sendFile(reply, buffer, filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });
  app.get("/api/accounts/:acc/export/deck.pptx", async (req, reply) => {
    const ctx = await ctxOf(req);
    const q = req.query as Record<string, string | undefined>;
    const { buffer, filename } = await buildDeck(ctx, {
      sprintId: q.sprintId,
      meetingIds: q.meetings === undefined ? undefined : q.meetings.split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x)),
      sections: (q.sections ?? "cover,alerts,kanban,meetings").split(",").filter(Boolean),
    });
    return sendFile(reply, buffer, filename, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  });
  app.get("/api/accounts/:acc/export/account.json", async (req, reply) => {
    const ctx = await ctxOf(req);
    const data = await exportAccount(ctx.user, ctx.accountId);
    const filename = `wacman_${data.account.slug}_${new Date().toISOString().slice(0, 10)}.json`;
    return sendFile(reply, Buffer.from(JSON.stringify(data, null, 1)), filename, "application/json");
  });

  // -------------------------------------------------------------------------
  // Super-administration
  // -------------------------------------------------------------------------
  app.get("/api/admin/users", async (req) => listAllUsers(requireUser(req)));
  app.post("/api/admin/users", async (req) => adminCreateUser(requireUser(req), req.body));
  app.patch("/api/admin/users/:id", async (req) => adminUpdateUser(requireUser(req), (req.params as P).id, req.body));
  app.post("/api/admin/import", { bodyLimit: 20 * 1024 * 1024 }, async (req) => importAccount(requireUser(req), req.body));
  app.get("/api/accounts/:acc/counts", async (req) => {
    const ctx = await ctxOf(req);
    return accountCounts(ctx.accountId);
  });

  // -------------------------------------------------------------------------
  // Assistant Claude
  // -------------------------------------------------------------------------
  app.post("/api/accounts/:acc/assistant", async (req, reply) => {
    const user = requireUser(req);
    const ctx = await buildCtx(user, (req.params as P).acc, true);
    const b = z
      .object({ prompt: z.string().min(1).max(8000), history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).max(20).optional() })
      .safeParse(req.body);
    if (!b.success) throw badRequest("Message requis.");
    await runAssistant(ctx, b.data.prompt, b.data.history ?? [], reply, req);
    return reply;
  });
  app.get("/api/accounts/:acc/assistant/runs", async (req) => listAssistantRuns(await ctxOf(req)));
}

function sendFile(reply: import("fastify").FastifyReply, buffer: Buffer, filename: string, type: string) {
  return reply
    .header("Content-Type", type)
    .header("Content-Disposition", `attachment; filename="${filename.replace(/[^\w.-]+/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`)
    .header("Cache-Control", "no-store")
    .send(buffer);
}

export { HttpError };
