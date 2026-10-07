import { z } from "zod";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db.js";
import * as T from "../schema.js";
import { HttpError, badRequest, isUuid, notFound } from "../context.js";
import { hashPassword, passwordSchema } from "../services/users.js";
import { accessMap, buildBridgeCtx, creatableStreams, parse, type BridgeUser } from "./common.js";

/**
 * Connexion à WiBridge : e-mail et mot de passe, puis code à 6 chiffres envoyé par e-mail
 * à la première connexion depuis un appareil (appareil de confiance ensuite, 180 jours après sa dernière utilisation).
 * Les comptes sont créés par invitation du super-administrateur (lien à usage unique, 7 jours).
 */

const OTP_TTL_MIN = 10;
const OTP_MAX_ATTEMPTS = 5;
export const BRIDGE_DEVICE_DAYS = 180;
export const BRIDGE_INVITE_DAYS = 7;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
let DUMMY_HASH: string | undefined;

type UserRow = typeof T.users.$inferSelect;

export const toBridgeUser = (u: Pick<UserRow, "id" | "email" | "name" | "isSuperAdmin">): BridgeUser => ({ id: u.id, email: u.email, name: u.name, isSuperAdmin: u.isSuperAdmin });

/** Un compte peut se connecter à WiBridge s'il est actif, a choisi son mot de passe et a l'accès WiBridge (ou est super-administrateur). */
export const canUseBridge = (u: Pick<UserRow, "active" | "passwordSet" | "bridgeAccess" | "isSuperAdmin">) => u.active && u.passwordSet && (u.bridgeAccess || u.isSuperAdmin);

/** Étape 1 : mot de passe. Même message et même temps de réponse quel que soit le motif du refus. */
export async function bridgeCheckPassword(email: string, password: string) {
  const [user] = await db.select().from(T.users).where(eq(T.users.email, email.trim().toLowerCase()));
  const invalid = new HttpError(401, "E-mail ou mot de passe incorrect.");
  if (!user) {
    DUMMY_HASH ??= bcrypt.hashSync("wibridge-dummy-password", 11);
    await bcrypt.compare(password, DUMMY_HASH);
    throw invalid;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok || !canUseBridge(user)) throw invalid;
  return user;
}

/** Appareil de confiance : jeton valable pour cet utilisateur, non révoqué, utilisé depuis moins de 180 jours. */
export async function bridgeTrustedDevice(userId: string, token: string | undefined) {
  if (!token || token.length < 30 || token.length > 120) return false;
  const now = new Date();
  const [d] = await db
    .update(T.bridgeDevices)
    .set({ lastUsedAt: now, expiresAt: new Date(now.getTime() + BRIDGE_DEVICE_DAYS * 86_400_000) })
    .where(and(eq(T.bridgeDevices.tokenHash, sha(token)), eq(T.bridgeDevices.userId, userId), isNull(T.bridgeDevices.revokedAt), gt(T.bridgeDevices.expiresAt, now)))
    .returning({ id: T.bridgeDevices.id });
  return !!d;
}

export async function bridgeRegisterDevice(userId: string, label: string) {
  const token = randomBytes(32).toString("base64url");
  await db.insert(T.bridgeDevices).values({ userId, tokenHash: sha(token), label: label.slice(0, 120), expiresAt: new Date(Date.now() + BRIDGE_DEVICE_DAYS * 86_400_000) });
  return token;
}

/** Code à 6 chiffres pour un nouvel appareil (les codes de connexion WiBridge précédents sont annulés). */
export async function bridgeStartChallenge(user: Pick<UserRow, "id">) {
  await db
    .update(T.loginChallenges)
    .set({ consumedAt: new Date() })
    .where(and(eq(T.loginChallenges.userId, user.id), eq(T.loginChallenges.purpose, "BRIDGE_LOGIN"), isNull(T.loginChallenges.consumedAt)));
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const [ch] = await db
    .insert(T.loginChallenges)
    .values({ userId: user.id, purpose: "BRIDGE_LOGIN", codeHash: sha(`bridge:${user.id}:${code}`), expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60_000) })
    .returning();
  return { challengeId: ch.id, code };
}

export async function bridgeVerifyChallenge(challengeId: string, code: string) {
  const invalid = new HttpError(401, "Code invalide ou expiré. Recommencez la connexion.");
  if (!isUuid(challengeId)) throw invalid;
  // l'essai est compté avant la comparaison : des essais simultanés ne contournent pas la limite
  const [ch] = await db
    .update(T.loginChallenges)
    .set({ attempts: sql`${T.loginChallenges.attempts} + 1` })
    .where(and(eq(T.loginChallenges.id, challengeId), isNull(T.loginChallenges.consumedAt), lt(T.loginChallenges.attempts, OTP_MAX_ATTEMPTS)))
    .returning();
  if (!ch || ch.purpose !== "BRIDGE_LOGIN" || ch.expiresAt < new Date()) throw invalid;
  const [u] = await db.select().from(T.users).where(eq(T.users.id, ch.userId));
  if (!u || !canUseBridge(u)) throw invalid;
  if (sha(`bridge:${ch.userId}:${code.trim()}`) !== ch.codeHash) {
    throw new HttpError(401, ch.attempts >= OTP_MAX_ATTEMPTS ? "Trop d'essais. Recommencez la connexion." : "Code incorrect.");
  }
  await db.update(T.loginChallenges).set({ consumedAt: new Date() }).where(eq(T.loginChallenges.id, ch.id));
  return u;
}

export async function bridgeTouchLogin(userId: string) {
  const [u] = await db.update(T.users).set({ bridgeLastLoginAt: new Date() }).where(eq(T.users.id, userId)).returning();
  return u;
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

/** Crée un lien d'invitation (les liens précédents de l'utilisateur sont annulés). Renvoie le jeton en clair, à envoyer par e-mail. */
export async function bridgeCreateInvitation(userId: string, invitedById: string) {
  await db.update(T.bridgeInvitations).set({ revokedAt: new Date() }).where(and(eq(T.bridgeInvitations.userId, userId), isNull(T.bridgeInvitations.acceptedAt), isNull(T.bridgeInvitations.revokedAt)));
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + BRIDGE_INVITE_DAYS * 86_400_000);
  await db.insert(T.bridgeInvitations).values({ userId, tokenHash: sha(token), invitedById, expiresAt });
  return { token, expiresAt };
}

async function findInvitation(token: string) {
  const invalid = new HttpError(400, "Ce lien d'invitation n'est plus valable. Demandez une nouvelle invitation.");
  if (!token || token.length < 30 || token.length > 120) throw invalid;
  const [row] = await db
    .select({ i: T.bridgeInvitations, u: T.users })
    .from(T.bridgeInvitations)
    .innerJoin(T.users, eq(T.users.id, T.bridgeInvitations.userId))
    .where(eq(T.bridgeInvitations.tokenHash, sha(token)));
  if (!row || row.i.acceptedAt || row.i.revokedAt || row.i.expiresAt < new Date() || !row.u.active || !(row.u.bridgeAccess || row.u.isSuperAdmin)) throw invalid;
  return row;
}

export async function bridgeGetInvitation(token: string) {
  const { u, i } = await findInvitation(token);
  const clients = await db
    .select({ name: T.bridgeClients.name })
    .from(T.bridgeMembers)
    .innerJoin(T.bridgeClients, eq(T.bridgeClients.id, T.bridgeMembers.clientId))
    .where(eq(T.bridgeMembers.userId, u.id));
  return { email: u.email, name: u.name, hasPassword: u.passwordSet, expiresAt: i.expiresAt, clients: clients.map((c) => c.name) };
}

/** Le lien reçu par e-mail vaut vérification : le compte est activé et l'appareil devient de confiance. */
export async function bridgeAcceptInvitation(token: string, input: unknown) {
  const d = parse(z.object({ name: z.string().trim().min(1, "Le nom est obligatoire.").max(120), password: z.string() }), input);
  const pw = passwordSchema.safeParse(d.password);
  if (!pw.success) throw badRequest(`Mot de passe trop faible : ${pw.error.issues.map((x) => x.message).join(", ")}`);
  const { u, i } = await findInvitation(token);
  if (u.passwordSet) throw new HttpError(400, "Votre compte existe déjà : connectez-vous avec votre mot de passe habituel.");
  const [claimed] = await db
    .update(T.bridgeInvitations)
    .set({ acceptedAt: new Date() })
    .where(and(eq(T.bridgeInvitations.id, i.id), isNull(T.bridgeInvitations.acceptedAt)))
    .returning();
  if (!claimed) throw new HttpError(400, "Ce lien d'invitation a déjà servi.");
  const [user] = await db
    .update(T.users)
    .set({ name: d.name, passwordHash: await hashPassword(pw.data), passwordSet: true, sessionVersion: u.sessionVersion + 1, bridgeLastLoginAt: new Date() })
    .where(eq(T.users.id, u.id))
    .returning();
  return user;
}

// ---------------------------------------------------------------------------
// Mot de passe oublié, changement de mot de passe, appareils
// ---------------------------------------------------------------------------

/**
 * Mot de passe oublié. Sans compte WiBridge actif pour l'adresse (personne pas encore invitée, compte WacMan seul, accès
 * retiré), aucun code n'est créé : `noAccess` porte l'adresse, à qui l'API envoie un e-mail d'explication. La réponse
 * faite au demandeur reste la même dans tous les cas.
 */
export async function bridgeStartReset(email: string) {
  const address = email.trim().toLowerCase();
  const [user] = await db.select().from(T.users).where(eq(T.users.email, address));
  // un compte invité qui n'a pas encore choisi son mot de passe peut aussi passer par là (le code e-mail fait foi)
  if (!user || !user.active || !(user.bridgeAccess || user.isSuperAdmin)) return { challengeId: randomUUID(), code: null, user: null, noAccess: address };
  await db
    .update(T.loginChallenges)
    .set({ consumedAt: new Date() })
    .where(and(eq(T.loginChallenges.userId, user.id), eq(T.loginChallenges.purpose, "BRIDGE_RESET"), isNull(T.loginChallenges.consumedAt)));
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const [ch] = await db
    .insert(T.loginChallenges)
    .values({ userId: user.id, purpose: "BRIDGE_RESET", codeHash: sha(`bridge-reset:${user.id}:${code}`), expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60_000) })
    .returning();
  return { challengeId: ch.id, code, user, noAccess: null };
}

export async function bridgeCompleteReset(challengeId: string, code: string, password: string) {
  const invalid = new HttpError(400, "Code invalide ou expiré. Refaites une demande.");
  if (!isUuid(challengeId)) throw invalid;
  const pw = passwordSchema.safeParse(password);
  if (!pw.success) throw badRequest(`Mot de passe trop faible : ${pw.error.issues.map((i) => i.message).join(", ")}`);
  const [ch] = await db
    .update(T.loginChallenges)
    .set({ attempts: sql`${T.loginChallenges.attempts} + 1` })
    .where(and(eq(T.loginChallenges.id, challengeId), isNull(T.loginChallenges.consumedAt), lt(T.loginChallenges.attempts, OTP_MAX_ATTEMPTS)))
    .returning();
  if (!ch || ch.purpose !== "BRIDGE_RESET" || ch.expiresAt < new Date()) throw invalid;
  if (sha(`bridge-reset:${ch.userId}:${code.trim()}`) !== ch.codeHash) throw new HttpError(400, ch.attempts >= OTP_MAX_ATTEMPTS ? "Trop d'essais. Refaites une demande." : "Code incorrect.");
  const [u] = await db.select().from(T.users).where(eq(T.users.id, ch.userId));
  if (!u || !u.active || !(u.bridgeAccess || u.isSuperAdmin)) throw invalid;
  await db.update(T.loginChallenges).set({ consumedAt: new Date() }).where(eq(T.loginChallenges.id, ch.id));
  await db.update(T.users).set({ passwordHash: await hashPassword(pw.data), passwordSet: true, sessionVersion: u.sessionVersion + 1 }).where(eq(T.users.id, u.id));
  // un mot de passe réinitialisé ferme les sessions et retire la confiance accordée aux appareils
  await bridgeRevokeAllDevices(u.id);
  await db.update(T.bridgeInvitations).set({ acceptedAt: new Date() }).where(and(eq(T.bridgeInvitations.userId, u.id), isNull(T.bridgeInvitations.acceptedAt), isNull(T.bridgeInvitations.revokedAt)));
  return { ok: true };
}

export async function bridgeChangePassword(user: BridgeUser, current: string, next: string, keepDeviceToken?: string) {
  const [u] = await db.select().from(T.users).where(eq(T.users.id, user.id));
  if (!u || !(await bcrypt.compare(current, u.passwordHash))) throw badRequest("Mot de passe actuel incorrect.");
  const p = passwordSchema.safeParse(next);
  if (!p.success) throw badRequest(`Nouveau mot de passe trop faible : ${p.error.issues.map((i) => i.message).join(", ")}`);
  await db.update(T.users).set({ passwordHash: await hashPassword(p.data), sessionVersion: u.sessionVersion + 1 }).where(eq(T.users.id, u.id));
  // les autres appareils devront de nouveau recevoir un code ; celui-ci reste de confiance
  const devices = await db.select().from(T.bridgeDevices).where(and(eq(T.bridgeDevices.userId, u.id), isNull(T.bridgeDevices.revokedAt)));
  const keep = keepDeviceToken ? sha(keepDeviceToken) : null;
  for (const d of devices) if (d.tokenHash !== keep) await db.update(T.bridgeDevices).set({ revokedAt: new Date() }).where(eq(T.bridgeDevices.id, d.id));
  const [fresh] = await db.select().from(T.users).where(eq(T.users.id, u.id));
  return fresh;
}

export async function bridgeListDevices(userId: string, currentToken?: string) {
  const rows = await db
    .select()
    .from(T.bridgeDevices)
    .where(and(eq(T.bridgeDevices.userId, userId), isNull(T.bridgeDevices.revokedAt), gt(T.bridgeDevices.expiresAt, new Date())))
    .orderBy(desc(T.bridgeDevices.lastUsedAt));
  const cur = currentToken ? sha(currentToken) : null;
  return rows.map((d) => ({ id: d.id, label: d.label, createdAt: d.createdAt, lastUsedAt: d.lastUsedAt, expiresAt: d.expiresAt, current: d.tokenHash === cur }));
}

export async function bridgeRevokeDevice(userId: string, id: string) {
  if (!isUuid(id)) throw notFound("Appareil introuvable.");
  const [d] = await db
    .update(T.bridgeDevices)
    .set({ revokedAt: new Date() })
    .where(and(eq(T.bridgeDevices.id, id), eq(T.bridgeDevices.userId, userId), isNull(T.bridgeDevices.revokedAt)))
    .returning();
  if (!d) throw notFound("Appareil introuvable.");
  return { ok: true };
}

export async function bridgeRevokeAllDevices(userId: string) {
  await db.update(T.bridgeDevices).set({ revokedAt: new Date() }).where(and(eq(T.bridgeDevices.userId, userId), isNull(T.bridgeDevices.revokedAt)));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Profil et clients ouverts
// ---------------------------------------------------------------------------

export async function bridgeMe(user: BridgeUser) {
  const all = await db.select().from(T.bridgeClients).orderBy(asc(T.bridgeClients.archived), asc(T.bridgeClients.name));
  const mine = await db.select().from(T.bridgeMembers).where(eq(T.bridgeMembers.userId, user.id));
  const byClient = new Map(mine.map((m) => [m.clientId, m]));
  const clients = all
    .filter((c) => user.isSuperAdmin || (byClient.has(c.id) && !c.archived))
    .map((c) => {
      const m = byClient.get(c.id);
      return { id: c.id, slug: c.slug, name: c.name, clientName: c.clientName, providerName: c.providerName, emoji: c.emoji, archived: c.archived, side: m?.side ?? "PROVIDER", notify: m?.notify ?? null, member: !!m };
    });
  return { user, clients };
}

export async function bridgeUpdateProfile(user: BridgeUser, input: unknown) {
  const d = parse(z.object({ name: z.string().trim().min(1, "Le nom est obligatoire.").max(120) }), input);
  const [u] = await db.update(T.users).set({ name: d.name }).where(eq(T.users.id, user.id)).returning();
  return toBridgeUser(u);
}

export async function bridgeSetNotify(user: BridgeUser, clientIdOrSlug: string, input: unknown) {
  const d = parse(z.object({ notify: z.enum(["IMMEDIATE", "DAILY", "NONE"]) }), input, "Préférence attendue.");
  const ctx = await buildBridgeCtx(user, clientIdOrSlug);
  if (!ctx.member) throw badRequest("Vous n'êtes pas membre de ce client : demandez au super-administrateur de vous y ajouter.");
  await db.update(T.bridgeMembers).set({ notify: d.notify }).where(eq(T.bridgeMembers.id, ctx.member.id));
  return { ok: true };
}

/** Tout ce dont l'écran a besoin pour un client : libellés, streams, règles et droits de l'utilisateur. */
export async function bridgeClientBootstrap(user: BridgeUser, clientIdOrSlug: string) {
  const ctx = await buildBridgeCtx(user, clientIdOrSlug);
  const c = ctx.client;
  return {
    client: { id: c.id, slug: c.slug, name: c.name, clientName: c.clientName, providerName: c.providerName, shortName: c.shortName, emoji: c.emoji, description: c.description, archived: c.archived },
    settings: ctx.settings,
    streams: ctx.streams.map((s) => ({ id: s.id, name: s.name, emoji: s.emoji, order: s.order, active: s.active })),
    me: {
      side: ctx.side,
      isSuperAdmin: user.isSuperAdmin,
      member: !!ctx.member,
      notify: ctx.member?.notify ?? null,
      access: accessMap(ctx),
      canCreate: creatableStreams(ctx),
    },
  };
}
