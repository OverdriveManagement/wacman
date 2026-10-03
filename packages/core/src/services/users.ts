import { z } from "zod";
import bcrypt from "bcryptjs";
import { createHash, randomInt } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../db.js";
import * as T from "../schema.js";
import { assertRole, badRequest, forbidden, notFound, HttpError, type Ctx, type SessionUser } from "../context.js";
import { audit } from "../audit.js";

const OTP_TTL_MIN = 10;
const OTP_MAX_ATTEMPTS = 5;

export const passwordSchema = z
  .string()
  .min(10, "10 caractères minimum")
  .max(200)
  .regex(/[A-Za-z]/, "au moins une lettre")
  .regex(/[0-9]/, "au moins un chiffre");

export const hashPassword = (pwd: string) => bcrypt.hash(pwd, 11);
let DUMMY_HASH: string | undefined;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export function toSessionUser(u: { id: string; email: string; name: string; isSuperAdmin: boolean }): SessionUser {
  return { id: u.id, email: u.email, name: u.name, isSuperAdmin: u.isSuperAdmin };
}

/** Étape 1 de la connexion : mot de passe, puis génération d'un code e-mail à 6 chiffres. */
export async function startLogin(email: string, password: string) {
  const [user] = await db.select().from(T.users).where(eq(T.users.email, email.trim().toLowerCase()));
  // même message dans tous les cas pour ne pas révéler l'existence d'un compte
  const invalid = new HttpError(401, "E-mail ou mot de passe incorrect.");
  if (!user || !user.active) {
    DUMMY_HASH ??= bcrypt.hashSync("wacman-dummy-password", 11);
    await bcrypt.compare(password, DUMMY_HASH); // temps de réponse constant
    throw invalid;
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) throw invalid;
  // invalide les codes précédents
  await db
    .update(T.loginChallenges)
    .set({ consumedAt: new Date() })
    .where(and(eq(T.loginChallenges.userId, user.id), isNull(T.loginChallenges.consumedAt)));
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const [challenge] = await db
    .insert(T.loginChallenges)
    .values({ userId: user.id, codeHash: sha(`${user.id}:${code}`), expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60_000) })
    .returning();
  return { challengeId: challenge.id, code, user };
}

/** Étape 2 : vérification du code reçu par e-mail. */
export async function verifyLogin(challengeId: string, code: string) {
  const invalid = new HttpError(401, "Code invalide ou expiré. Recommencez la connexion.");
  if (!/^[0-9a-f-]{36}$/i.test(challengeId)) throw invalid;
  const [ch] = await db.select().from(T.loginChallenges).where(eq(T.loginChallenges.id, challengeId));
  if (!ch || ch.consumedAt || ch.expiresAt < new Date()) throw invalid;
  const [u] = await db.select().from(T.users).where(eq(T.users.id, ch.userId));
  if (!u || !u.active || ch.attempts >= OTP_MAX_ATTEMPTS) throw invalid;
  if (sha(`${ch.userId}:${code.trim()}`) !== ch.codeHash) {
    await db.update(T.loginChallenges).set({ attempts: ch.attempts + 1 }).where(eq(T.loginChallenges.id, ch.id));
    throw new HttpError(401, ch.attempts + 1 >= OTP_MAX_ATTEMPTS ? "Trop d'essais. Recommencez la connexion." : "Code incorrect.");
  }
  await db.update(T.loginChallenges).set({ consumedAt: new Date() }).where(eq(T.loginChallenges.id, ch.id));
  const [user] = await db.update(T.users).set({ lastLoginAt: new Date() }).where(eq(T.users.id, ch.userId)).returning();
  return user;
}

export async function changeOwnPassword(user: SessionUser, current: string, next: string) {
  const [u] = await db.select().from(T.users).where(eq(T.users.id, user.id));
  if (!(await bcrypt.compare(current, u.passwordHash))) throw badRequest("Mot de passe actuel incorrect.");
  const p = passwordSchema.safeParse(next);
  if (!p.success) throw badRequest(`Nouveau mot de passe trop faible : ${p.error.issues.map((i) => i.message).join(", ")}`);
  await db
    .update(T.users)
    .set({ passwordHash: await hashPassword(next), sessionVersion: u.sessionVersion + 1 })
    .where(eq(T.users.id, user.id));
  return { ok: true };
}

/** Crée le super-administrateur initial si la base ne contient aucun utilisateur. */
export async function ensureBootstrapAdmin(email?: string, password?: string, name = "Administrateur") {
  if (!email || !password) return null;
  const existing = await db.select({ id: T.users.id }).from(T.users).limit(1);
  if (existing.length) return null;
  const [u] = await db
    .insert(T.users)
    .values({ email: email.toLowerCase(), name, passwordHash: await hashPassword(password), isSuperAdmin: true })
    .returning();
  return u;
}

// ---------------------------------------------------------------------------
// Gestion des membres d'un compte (admin du compte) et des utilisateurs (super-admin)
// ---------------------------------------------------------------------------

export async function listMembers(ctx: Ctx) {
  assertRole(ctx, "ADMIN");
  const ms = await db
    .select({ m: T.memberships, u: T.users })
    .from(T.memberships)
    .innerJoin(T.users, eq(T.users.id, T.memberships.userId))
    .where(eq(T.memberships.accountId, ctx.accountId))
    .orderBy(asc(T.users.name));
  return ms.map(({ m, u }) => ({
    membershipId: m.id,
    role: m.role,
    user: { id: u.id, email: u.email, name: u.name, active: u.active, isSuperAdmin: u.isSuperAdmin, lastLoginAt: u.lastLoginAt },
  }));
}

export const memberCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  role: z.enum(["ADMIN", "EDITOR", "VIEWER"]),
  password: z.string().optional(), // obligatoire si l'utilisateur n'existe pas encore
});

/** Ajoute un membre au compte ; crée l'utilisateur s'il n'existe pas. */
export async function addMember(ctx: Ctx, input: unknown) {
  assertRole(ctx, "ADMIN");
  const p = memberCreateSchema.safeParse(input);
  if (!p.success) throw badRequest("Données invalides.", p.error.flatten());
  const email = p.data.email.trim().toLowerCase();
  let [user] = await db.select().from(T.users).where(eq(T.users.email, email));
  if (!user) {
    const pw = passwordSchema.safeParse(p.data.password ?? "");
    if (!pw.success) throw badRequest(`Mot de passe initial requis : ${pw.error.issues.map((i) => i.message).join(", ")}`);
    [user] = await db.insert(T.users).values({ email, name: p.data.name, passwordHash: await hashPassword(pw.data) }).returning();
    await audit(ctx, "user", user.id, "create", `Utilisateur créé : ${user.name}`);
  }
  const [m] = await db
    .insert(T.memberships)
    .values({ userId: user.id, accountId: ctx.accountId, role: p.data.role })
    .onConflictDoUpdate({ target: [T.memberships.userId, T.memberships.accountId], set: { role: p.data.role } })
    .returning();
  await audit(ctx, "membership", m.id, "create", `Accès ${p.data.role} donné à ${user.name}`);
  return { ok: true };
}

async function findMembership(ctx: Ctx, membershipId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(membershipId)) throw notFound();
  const [row] = await db
    .select({ m: T.memberships, u: T.users })
    .from(T.memberships)
    .innerJoin(T.users, eq(T.users.id, T.memberships.userId))
    .where(and(eq(T.memberships.id, membershipId), eq(T.memberships.accountId, ctx.accountId)));
  if (!row) throw notFound();
  return { ...row.m, user: row.u };
}

export async function updateMember(ctx: Ctx, membershipId: string, role: string) {
  assertRole(ctx, "ADMIN");
  const r = z.enum(["ADMIN", "EDITOR", "VIEWER"]).safeParse(role);
  if (!r.success) throw badRequest("Rôle invalide.");
  const m = await findMembership(ctx, membershipId);
  await db.update(T.memberships).set({ role: r.data }).where(eq(T.memberships.id, m.id));
  await audit(ctx, "membership", m.id, "update", `Rôle de ${m.user.name} : ${m.role} vers ${r.data}`);
  return { ok: true };
}

export async function removeMember(ctx: Ctx, membershipId: string) {
  assertRole(ctx, "ADMIN");
  const m = await findMembership(ctx, membershipId);
  if (m.userId === ctx.user.id && !ctx.user.isSuperAdmin) throw badRequest("Vous ne pouvez pas retirer votre propre accès.");
  await db.delete(T.memberships).where(eq(T.memberships.id, m.id));
  await audit(ctx, "membership", m.id, "delete", `Accès retiré à ${m.user.name}`);
  return { ok: true };
}

export async function listAllUsers(user: SessionUser) {
  if (!user.isSuperAdmin) throw forbidden();
  const users = await db.select().from(T.users).orderBy(asc(T.users.name));
  const ms = await db
    .select({ id: T.memberships.id, userId: T.memberships.userId, role: T.memberships.role, name: T.accounts.name, slug: T.accounts.slug })
    .from(T.memberships)
    .innerJoin(T.accounts, eq(T.accounts.id, T.memberships.accountId));
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    active: u.active,
    isSuperAdmin: u.isSuperAdmin,
    lastLoginAt: u.lastLoginAt,
    memberships: ms.filter((m) => m.userId === u.id).map((m) => ({ id: m.id, role: m.role, account: { name: m.name, slug: m.slug } })),
  }));
}

export const userAdminUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  active: z.boolean().optional(),
  isSuperAdmin: z.boolean().optional(),
  password: z.string().optional(),
});

export async function adminUpdateUser(actor: SessionUser, userId: string, input: unknown) {
  if (!actor.isSuperAdmin) throw forbidden();
  const p = userAdminUpdateSchema.safeParse(input);
  if (!p.success) throw badRequest("Données invalides.", p.error.flatten());
  if (userId === actor.id && (p.data.active === false || p.data.isSuperAdmin === false)) {
    throw badRequest("Vous ne pouvez pas désactiver ou rétrograder votre propre compte.");
  }
  const [cur] = await db.select().from(T.users).where(eq(T.users.id, userId));
  if (!cur) throw notFound();
  const data: Partial<typeof T.users.$inferInsert> = {};
  if (p.data.name !== undefined) data.name = p.data.name;
  if (p.data.active !== undefined) data.active = p.data.active;
  if (p.data.isSuperAdmin !== undefined) data.isSuperAdmin = p.data.isSuperAdmin;
  if (p.data.password) {
    const pw = passwordSchema.safeParse(p.data.password);
    if (!pw.success) throw badRequest(`Mot de passe trop faible : ${pw.error.issues.map((i) => i.message).join(", ")}`);
    data.passwordHash = await hashPassword(pw.data);
  }
  if (data.passwordHash || data.active === false) data.sessionVersion = cur.sessionVersion + 1;
  const [u] = await db.update(T.users).set(data).where(eq(T.users.id, userId)).returning();
  await audit({ user: actor, accountId: null }, "user", userId, "update", `Utilisateur modifié : ${u.name}`, { fields: Object.keys(p.data) });
  return { ok: true };
}

export async function adminCreateUser(actor: SessionUser, input: unknown) {
  if (!actor.isSuperAdmin) throw forbidden();
  const p = z
    .object({ email: z.string().email(), name: z.string().min(1), password: z.string(), isSuperAdmin: z.boolean().optional() })
    .safeParse(input);
  if (!p.success) throw badRequest("Données invalides.", p.error.flatten());
  const pw = passwordSchema.safeParse(p.data.password);
  if (!pw.success) throw badRequest(`Mot de passe trop faible : ${pw.error.issues.map((i) => i.message).join(", ")}`);
  const email = p.data.email.trim().toLowerCase();
  const [exists] = await db.select({ id: T.users.id }).from(T.users).where(eq(T.users.email, email));
  if (exists) throw badRequest("Un utilisateur existe déjà avec cet e-mail.");
  const [u] = await db
    .insert(T.users)
    .values({ email, name: p.data.name, passwordHash: await hashPassword(pw.data), isSuperAdmin: !!p.data.isSuperAdmin })
    .returning();
  await audit({ user: actor, accountId: null }, "user", u.id, "create", `Utilisateur créé : ${u.name}`);
  return { id: u.id };
}
