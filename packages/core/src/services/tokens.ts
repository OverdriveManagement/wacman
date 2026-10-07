import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db.js";
import * as T from "../schema.js";
import { badRequest, isUuid, notFound, type SessionUser } from "../context.js";
import { audit } from "../audit.js";
import { toSessionUser } from "./users.js";

/**
 * Jetons d'accès personnels : ils permettent à un outil (Claude via MCP, script, intégration)
 * d'agir avec les droits de l'utilisateur. Le jeton n'est affiché qu'une fois ; seul son hachage est stocké.
 */

export const TOKEN_PREFIX = "wac_";
const MAX_TOKENS = 20;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export const tokenCreateSchema = z.object({
  name: z.string().trim().min(1, "nom requis").max(80),
  expiresInDays: z.number().int().min(1).max(730).nullable().optional(),
  readOnly: z.boolean().optional(),
});

export async function listApiTokens(user: SessionUser) {
  return db
    .select({
      id: T.apiTokens.id,
      name: T.apiTokens.name,
      prefix: T.apiTokens.prefix,
      readOnly: T.apiTokens.readOnly,
      lastUsedAt: T.apiTokens.lastUsedAt,
      expiresAt: T.apiTokens.expiresAt,
      createdAt: T.apiTokens.createdAt,
    })
    .from(T.apiTokens)
    .where(and(eq(T.apiTokens.userId, user.id), isNull(T.apiTokens.revokedAt)))
    .orderBy(desc(T.apiTokens.createdAt));
}

export async function createApiToken(user: SessionUser, input: unknown) {
  const p = tokenCreateSchema.safeParse(input);
  if (!p.success) throw badRequest("Données invalides.", p.error.flatten());
  const active = await listApiTokens(user);
  if (active.length >= MAX_TOKENS) throw badRequest(`Vous avez déjà ${MAX_TOKENS} jetons actifs : révoquez-en un d'abord.`);
  const token = `${TOKEN_PREFIX}${randomBytes(30).toString("base64url")}`;
  const days = p.data.expiresInDays ?? null;
  const [row] = await db
    .insert(T.apiTokens)
    .values({
      userId: user.id,
      name: p.data.name,
      tokenHash: sha(token),
      prefix: token.slice(0, 10),
      readOnly: !!p.data.readOnly,
      expiresAt: days ? new Date(Date.now() + days * 86_400_000) : null,
    })
    .returning();
  await audit({ user, accountId: null }, "apiToken", row.id, "create", `Jeton d'accès créé : ${row.name}`);
  return { id: row.id, name: row.name, prefix: row.prefix, readOnly: row.readOnly, expiresAt: row.expiresAt, token };
}

export async function revokeApiToken(user: SessionUser, id: string) {
  if (!isUuid(id)) throw notFound();
  const [row] = await db
    .update(T.apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(T.apiTokens.id, id), eq(T.apiTokens.userId, user.id), isNull(T.apiTokens.revokedAt)))
    .returning();
  if (!row) throw notFound("Jeton introuvable.");
  await audit({ user, accountId: null }, "apiToken", row.id, "delete", `Jeton d'accès révoqué : ${row.name}`);
  return { ok: true };
}

const lastTouch = new Map<string, number>();

/** Identifie l'utilisateur porteur d'un jeton (null si inconnu, révoqué, expiré ou utilisateur inactif). */
export async function resolveApiToken(token: string): Promise<{ user: SessionUser; readOnly: boolean; tokenId: string } | null> {
  if (!token.startsWith(TOKEN_PREFIX) || token.length < 30 || token.length > 120) return null;
  const [row] = await db
    .select({ t: T.apiTokens, u: T.users })
    .from(T.apiTokens)
    .innerJoin(T.users, eq(T.users.id, T.apiTokens.userId))
    .where(eq(T.apiTokens.tokenHash, sha(token)));
  // un jeton n'est valable que pour un compte qui a toujours accès à WacMan
  if (!row || row.t.revokedAt || !row.u.active || !(row.u.wacmanAccess || row.u.isSuperAdmin)) return null;
  if (row.t.expiresAt && row.t.expiresAt < new Date()) return null;
  // date de dernière utilisation, mise à jour au plus une fois par minute
  const now = Date.now();
  if ((lastTouch.get(row.t.id) ?? 0) < now - 60_000) {
    lastTouch.set(row.t.id, now);
    await db.update(T.apiTokens).set({ lastUsedAt: new Date() }).where(eq(T.apiTokens.id, row.t.id));
  }
  return { user: toSessionUser(row.u), readOnly: row.t.readOnly, tokenId: row.t.id };
}
