import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { Bridge, HttpError, badRequest, db, T } from "@wacman/core";
import { env } from "../env.js";
import { throttle } from "../auth.js";
import {
  BRIDGE_DEVICE_COOKIE,
  clearBridgeDevice,
  clearBridgeSession,
  deviceLabel,
  readBridgeToken,
  requireBridgeUser,
  setBridgeDevice,
  setBridgeSession,
  signBridgeFile,
  signBridgeSession,
  signBridgeUpload,
} from "./session.js";
import { accessMail, deliver, devOutbox, digestMail, invitationMail, loginCodeMail, noAccessMail, resetCodeMail } from "./mail.js";
import { buildBridgeWorkbook } from "./xlsx.js";

/** Routes de WiBridge : toutes sous /api/bridge, avec leur propre session (voir session.ts). */

type P = { slug: string; id: string; token: string };

const mask = (email: string) => email.replace(/^(.).*(@.*)$/, "$1•••$2");

async function ctxOf(req: FastifyRequest) {
  return Bridge.buildBridgeCtx(requireBridgeUser(req), (req.params as P).slug);
}

async function userRow(id: string) {
  const [u] = await db.select().from(T.users).where(eq(T.users.id, id));
  if (!u) throw new HttpError(401, "Session expirée : reconnectez-vous.");
  return u;
}

/** Un e-mail indispensable (code de connexion) qui ne part pas donne un message clair, pas une erreur interne. */
async function mustDeliver(req: FastifyRequest, mail: Parameters<typeof deliver>[0][number]) {
  try {
    await deliver([mail], (m) => req.log.info(m));
  } catch (e) {
    req.log.error(e);
    throw new HttpError(502, "L'e-mail n'a pas pu être envoyé. Réessayez dans quelques instants.");
  }
}

async function sendInvitation(req: FastifyRequest, actor: Bridge.BridgeUser, r: Awaited<ReturnType<typeof Bridge.invitationFor>>) {
  const link = r.mode === "invite" ? `${env.bridgeWebUrl}/invitation#${r.token}` : `${env.bridgeWebUrl}/login`;
  const mail = r.mode === "invite" ? invitationMail(r.user.email, r.user.name, actor.name, r.clients, link, r.expiresAt!) : accessMail(r.user.email, r.user.name, actor.name, r.clients, link);
  let sent = true;
  try {
    await deliver([mail], (m) => req.log.info(m));
  } catch (e) {
    req.log.error(e);
    sent = false;
  }
  return {
    userId: r.user.id,
    mode: r.mode,
    sent,
    ...(sent ? {} : { error: "Le compte est enregistré mais l'e-mail n'a pas pu être envoyé : utilisez « Renvoyer l'invitation »." }),
    ...(env.isProd ? {} : { devLink: link }),
  };
}

function sendFile(reply: FastifyReply, buffer: Buffer, filename: string, type: string, inline = false) {
  const ascii = filename.replace(/[^\w.-]+/g, "_");
  return reply
    .header("Content-Type", type)
    .header("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`)
    .header("Cache-Control", "private, no-store")
    .header("X-Content-Type-Options", "nosniff")
    .send(buffer);
}

const INLINE = /^(image\/(png|jpeg|gif|webp)|application\/pdf)$/;
const RISKY = /^(text\/html|application\/xhtml|image\/svg|text\/xml|application\/xml|text\/javascript|application\/javascript)/i;

export async function registerBridgeRoutes(app: FastifyInstance) {
  // -------------------------------------------------------------------------
  // Connexion : mot de passe, puis code e-mail sur un nouvel appareil
  // -------------------------------------------------------------------------
  app.post("/api/bridge/auth/login", async (req, reply) => {
    const b = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
    if (!b.success) throw badRequest("E-mail et mot de passe requis.");
    const email = b.data.email.trim().toLowerCase();
    throttle(`bridge-login:${req.ip}:${email}`);
    throttle(`bridge-login:${email}`, 20, 30 * 60_000);
    const user = await Bridge.bridgeCheckPassword(email, b.data.password);
    if (await Bridge.bridgeTrustedDevice(user.id, req.cookies?.[BRIDGE_DEVICE_COOKIE])) {
      const u = await Bridge.bridgeTouchLogin(user.id);
      setBridgeSession(reply, await signBridgeSession(u));
      return { user: Bridge.toBridgeUser(u), trusted: true };
    }
    const { challengeId, code } = await Bridge.bridgeStartChallenge(user);
    await mustDeliver(req, loginCodeMail(user.email, user.name, code));
    return { challengeId, email: mask(user.email), ...(env.devShowOtp ? { devCode: code } : {}) };
  });

  app.post("/api/bridge/auth/verify", async (req, reply) => {
    const b = z.object({ challengeId: z.string(), code: z.string().min(4).max(10), trust: z.boolean().optional() }).safeParse(req.body);
    if (!b.success) throw badRequest("Code requis.");
    throttle(`bridge-verify:${req.ip}`, 20);
    const user = await Bridge.bridgeVerifyChallenge(b.data.challengeId, b.data.code);
    if (b.data.trust !== false) setBridgeDevice(reply, await Bridge.bridgeRegisterDevice(user.id, deviceLabel(req.headers["user-agent"])));
    const u = await Bridge.bridgeTouchLogin(user.id);
    setBridgeSession(reply, await signBridgeSession(u));
    return { user: Bridge.toBridgeUser(u) };
  });

  app.post("/api/bridge/auth/logout", async (_req, reply) => {
    clearBridgeSession(reply);
    return { ok: true };
  });

  app.get("/api/bridge/auth/me", async (req) => Bridge.bridgeMe(requireBridgeUser(req)));
  app.patch("/api/bridge/auth/me", async (req) => Bridge.bridgeUpdateProfile(requireBridgeUser(req), req.body));

  app.post("/api/bridge/auth/password", async (req, reply) => {
    const user = requireBridgeUser(req);
    const b = z.object({ current: z.string(), next: z.string() }).safeParse(req.body);
    if (!b.success) throw badRequest("Données invalides.");
    throttle(`bridge-password:${user.id}`, 10);
    const u = await Bridge.bridgeChangePassword(user, b.data.current, b.data.next, req.cookies?.[BRIDGE_DEVICE_COOKIE]);
    // les autres sessions sont fermées ; celle-ci reste ouverte
    setBridgeSession(reply, await signBridgeSession(u));
    return { ok: true };
  });

  app.post("/api/bridge/auth/forgot", async (req) => {
    const b = z.object({ email: z.string().email() }).safeParse(req.body);
    if (!b.success) throw badRequest("E-mail requis.");
    throttle(`bridge-forgot:${req.ip}`, 6);
    throttle(`bridge-forgot:${b.data.email.toLowerCase()}`, 4);
    const r = await Bridge.bridgeStartReset(b.data.email);
    if (r.user && r.code) await mustDeliver(req, resetCodeMail(r.user.email, r.user.name, r.code));
    // pas de compte WiBridge actif : un e-mail l'explique au titulaire de l'adresse (la réponse au demandeur ne change pas)
    else if (r.noAccess) await deliver([noAccessMail(r.noAccess)], (m) => req.log.info(m)).catch((e) => req.log.error(e));
    return { challengeId: r.challengeId, ...(env.devShowOtp && r.code ? { devCode: r.code } : {}) };
  });

  app.post("/api/bridge/auth/reset", async (req, reply) => {
    const b = z.object({ challengeId: z.string(), code: z.string().min(4).max(10), password: z.string() }).safeParse(req.body);
    if (!b.success) throw badRequest("Données invalides.");
    throttle(`bridge-reset:${req.ip}`, 20);
    const r = await Bridge.bridgeCompleteReset(b.data.challengeId, b.data.code, b.data.password);
    clearBridgeDevice(reply);
    return r;
  });

  // Invitation : le jeton voyage dans le corps de la requête (jamais dans une adresse journalisée)
  app.post("/api/bridge/auth/invitation/info", async (req) => {
    throttle(`bridge-invite:${req.ip}`, 30);
    const b = z.object({ token: z.string().max(200) }).safeParse(req.body ?? {});
    if (!b.success) throw badRequest("Lien d'invitation incomplet.");
    return Bridge.bridgeGetInvitation(b.data.token);
  });
  app.post("/api/bridge/auth/invitation/accept", async (req, reply) => {
    throttle(`bridge-invite:${req.ip}`, 30);
    const b = z.object({ token: z.string().max(200) }).passthrough().safeParse(req.body ?? {});
    if (!b.success) throw badRequest("Lien d'invitation incomplet.");
    const u = await Bridge.bridgeAcceptInvitation(b.data.token, req.body);
    // le lien reçu par e-mail vaut double authentification : cet appareil devient de confiance
    setBridgeDevice(reply, await Bridge.bridgeRegisterDevice(u.id, deviceLabel(req.headers["user-agent"])));
    setBridgeSession(reply, await signBridgeSession(u));
    return { user: Bridge.toBridgeUser(u) };
  });

  app.get("/api/bridge/auth/devices", async (req) => Bridge.bridgeListDevices(requireBridgeUser(req).id, req.cookies?.[BRIDGE_DEVICE_COOKIE]));
  app.delete("/api/bridge/auth/devices/:id", async (req) => Bridge.bridgeRevokeDevice(requireBridgeUser(req).id, (req.params as P).id));
  app.post("/api/bridge/auth/devices/revoke-all", async (req, reply) => {
    await Bridge.bridgeRevokeAllDevices(requireBridgeUser(req).id);
    clearBridgeDevice(reply);
    return { ok: true };
  });

  // jeton court pour déposer un fichier directement sur l'API (gros fichiers, sans le relais Vercel)
  app.get("/api/bridge/auth/upload-token", async (req) => {
    const u = await userRow(requireBridgeUser(req).id);
    return { token: await signBridgeUpload(u), maxBytes: Bridge.BRIDGE_MAX_FILE };
  });

  // -------------------------------------------------------------------------
  // Questions d'un client
  // -------------------------------------------------------------------------
  app.get("/api/bridge/c/:slug", async (req) => Bridge.bridgeClientBootstrap(requireBridgeUser(req), (req.params as P).slug));
  app.post("/api/bridge/c/:slug/notify", async (req) => Bridge.bridgeSetNotify(requireBridgeUser(req), (req.params as P).slug, req.body));
  app.get("/api/bridge/c/:slug/questions", async (req) => Bridge.listQuestions(await ctxOf(req), { deleted: (req.query as { deleted?: string }).deleted === "1" }));
  app.get("/api/bridge/c/:slug/search", async (req) => ({ ids: await Bridge.searchQuestions(await ctxOf(req), String((req.query as { q?: string }).q ?? "").slice(0, 200)) }));
  app.post("/api/bridge/c/:slug/questions", async (req) => Bridge.createQuestion(await ctxOf(req), req.body));
  app.get("/api/bridge/c/:slug/questions/:id", async (req) => Bridge.getQuestion(await ctxOf(req), (req.params as P).id));
  app.patch("/api/bridge/c/:slug/questions/:id", async (req) => Bridge.updateQuestion(await ctxOf(req), (req.params as P).id, req.body));
  app.post("/api/bridge/c/:slug/questions/:id/assign", async (req) => Bridge.assignQuestion(await ctxOf(req), (req.params as P).id, req.body));
  app.post("/api/bridge/c/:slug/questions/:id/close", async (req) => Bridge.closeQuestion(await ctxOf(req), (req.params as P).id));
  app.post("/api/bridge/c/:slug/questions/:id/reopen", async (req) => Bridge.reopenQuestion(await ctxOf(req), (req.params as P).id, req.body));
  app.post("/api/bridge/c/:slug/questions/:id/messages", async (req) => Bridge.respondQuestion(await ctxOf(req), (req.params as P).id, req.body));
  app.post("/api/bridge/c/:slug/questions/:id/restore", async (req) => Bridge.restoreQuestion(await ctxOf(req), (req.params as P).id));
  app.delete("/api/bridge/c/:slug/questions/:id", async (req) => Bridge.deleteQuestion(await ctxOf(req), (req.params as P).id));
  app.get("/api/bridge/c/:slug/questions/:id/history", async (req) => Bridge.questionHistory(await ctxOf(req), (req.params as P).id));
  app.patch("/api/bridge/c/:slug/messages/:id", async (req) => Bridge.editMessage(await ctxOf(req), (req.params as P).id, req.body));
  app.delete("/api/bridge/c/:slug/messages/:id", async (req) => Bridge.deleteMessage(await ctxOf(req), (req.params as P).id));

  // Pièces jointes : dépôt direct (corps binaire), lien de téléchargement signé de 5 minutes
  app.post("/api/bridge/c/:slug/files", { bodyLimit: Bridge.BRIDGE_MAX_FILE + 1024 * 1024 }, async (req) => {
    const ctx = await ctxOf(req);
    throttle(`bridge-upload:${ctx.user.id}`, 200, 60 * 60_000);
    if (!Buffer.isBuffer(req.body)) throw badRequest("Fichier attendu (corps binaire).");
    let name = "fichier";
    try {
      name = decodeURIComponent(String(req.headers["x-file-name"] ?? "fichier"));
    } catch {
      /* nom illisible : nom générique */
    }
    const q = req.query as { questionId?: string; messageId?: string };
    return Bridge.uploadBridgeFile(ctx, { name, mime: String(req.headers["x-file-type"] ?? ""), questionId: q.questionId || null, messageId: q.messageId || null }, req.body);
  });
  app.get("/api/bridge/c/:slug/files/:id/link", async (req) => {
    const ctx = await ctxOf(req);
    const f = await Bridge.checkBridgeFileAccess(ctx, (req.params as P).id);
    const u = await userRow(ctx.user.id);
    return { path: `/api/bridge/dl/${await signBridgeFile(u, f.id, ctx.client.id)}`, name: f.name, mime: f.mime, size: f.size };
  });
  app.get("/api/bridge/dl/:token", async (req, reply) => {
    const r = await readBridgeToken((req.params as P).token, "bridge-file");
    if (!r) throw new HttpError(403, "Lien expiré : rouvrez la pièce jointe depuis WiBridge.");
    const ctx = await Bridge.buildBridgeCtx(Bridge.toBridgeUser(r.user), String(r.payload.cid));
    const f = await Bridge.readBridgeFile(ctx, String(r.payload.fid));
    const inline = (req.query as { inline?: string }).inline === "1" && INLINE.test(f.mime);
    if (f.mime !== "application/pdf") reply.header("Content-Security-Policy", "default-src 'none'; sandbox");
    return sendFile(reply, f.data, f.name, RISKY.test(f.mime) ? "application/octet-stream" : f.mime, inline);
  });
  app.delete("/api/bridge/c/:slug/files/:id", async (req) => Bridge.deleteBridgeFile(await ctxOf(req), (req.params as P).id));

  app.get("/api/bridge/c/:slug/export.xlsx", async (req, reply) => {
    const ctx = await ctxOf(req);
    const s = (req.query as { status?: string }).status;
    const { buffer, filename } = await buildBridgeWorkbook(ctx, s === "closed" || s === "all" ? s : "open");
    return sendFile(reply, buffer, filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });

  // -------------------------------------------------------------------------
  // Super-administration
  // -------------------------------------------------------------------------
  app.get("/api/bridge/admin/clients", async (req) => Bridge.adminListBridgeClients(requireBridgeUser(req)));
  app.post("/api/bridge/admin/clients", async (req) => Bridge.adminCreateBridgeClient(requireBridgeUser(req), req.body));
  app.patch("/api/bridge/admin/clients/:id", async (req) => Bridge.adminUpdateBridgeClient(requireBridgeUser(req), (req.params as P).id, req.body));
  app.post("/api/bridge/admin/clients/:id/streams", async (req) => Bridge.adminCreateBridgeStream(requireBridgeUser(req), (req.params as P).id, req.body));
  app.post("/api/bridge/admin/clients/:id/streams/reorder", async (req) => Bridge.adminReorderBridgeStreams(requireBridgeUser(req), (req.params as P).id, req.body));
  app.patch("/api/bridge/admin/streams/:id", async (req) => Bridge.adminUpdateBridgeStream(requireBridgeUser(req), (req.params as P).id, req.body));
  app.delete("/api/bridge/admin/streams/:id", async (req) => Bridge.adminDeleteBridgeStream(requireBridgeUser(req), (req.params as P).id));
  app.get("/api/bridge/admin/users", async (req) => Bridge.adminListBridgeUsers(requireBridgeUser(req)));
  app.post("/api/bridge/admin/users", async (req) => {
    const actor = requireBridgeUser(req);
    return sendInvitation(req, actor, await Bridge.adminInviteBridgeUser(actor, req.body));
  });
  app.patch("/api/bridge/admin/users/:id", async (req) => Bridge.adminUpdateBridgeUser(requireBridgeUser(req), (req.params as P).id, req.body));
  app.put("/api/bridge/admin/users/:id/memberships", async (req) => Bridge.adminSetBridgeMemberships(requireBridgeUser(req), (req.params as P).id, req.body));
  app.post("/api/bridge/admin/users/:id/invite", async (req) => {
    const actor = requireBridgeUser(req);
    return sendInvitation(req, actor, await Bridge.invitationFor(actor, (req.params as P).id));
  });
  app.post("/api/bridge/admin/users/:id/revoke-devices", async (req) => Bridge.adminRevokeBridgeDevices(requireBridgeUser(req), (req.params as P).id));
  app.get("/api/bridge/admin/journal", async (req) => {
    const q = req.query as { clientId?: string; limit?: string };
    return Bridge.adminBridgeJournal(requireBridgeUser(req), { clientId: q.clientId, limit: q.limit ? Number(q.limit) : undefined });
  });

  // -------------------------------------------------------------------------
  // Développement uniquement : boîte d'envoi des e-mails et récapitulatif à la demande (tests)
  // -------------------------------------------------------------------------
  if (!env.isProd) {
    app.get("/api/bridge/dev/outbox", async (req) => {
      const after = Number((req.query as { after?: string }).after ?? 0) || 0;
      return devOutbox.filter((m) => m.n > after);
    });
    app.post("/api/bridge/dev/digest", async () => {
      const batches = await Bridge.digestBatches();
      await deliver(batches.map(digestMail));
      return { sent: batches.length };
    });
  }
}
