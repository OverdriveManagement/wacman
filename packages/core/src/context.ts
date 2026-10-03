import { and, eq, or } from "drizzle-orm";
import { db } from "./db.js";
import { accounts, memberships } from "./schema.js";

export type Role = "ADMIN" | "EDITOR" | "VIEWER";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
}

/** Contexte d'exécution d'une opération métier sur un compte client. */
export interface Ctx {
  user: SessionUser;
  accountId: string;
  role: Role; // rôle effectif (ADMIN pour un super-admin)
  viaAssistant?: boolean;
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export const forbidden = (msg = "Action non autorisée pour votre rôle.") => new HttpError(403, msg);
export const notFound = (msg = "Élément introuvable.") => new HttpError(404, msg);
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);

const rank: Record<Role, number> = { VIEWER: 1, EDITOR: 2, ADMIN: 3 };

export function can(ctx: Ctx, min: Role): boolean {
  return ctx.user.isSuperAdmin || rank[ctx.role] >= rank[min];
}

export function assertRole(ctx: Ctx, min: Role) {
  if (!can(ctx, min)) throw forbidden();
}

/** Construit le contexte d'un utilisateur sur un compte (par id ou slug). */
export async function buildCtx(user: SessionUser, accountIdOrSlug: string, viaAssistant = false, readOnly = false): Promise<Ctx> {
  const isUuid = /^[0-9a-f-]{36}$/i.test(accountIdOrSlug);
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(isUuid ? or(eq(accounts.id, accountIdOrSlug), eq(accounts.slug, accountIdOrSlug)) : eq(accounts.slug, accountIdOrSlug))
    .limit(1);
  if (!account) throw notFound("Compte client introuvable.");
  if (readOnly) {
    // jeton en lecture seule : droits de lecteur, même pour un administrateur
    if (!user.isSuperAdmin) {
      const [m0] = await db
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.userId, user.id), eq(memberships.accountId, account.id)))
        .limit(1);
      if (!m0) throw forbidden("Vous n'avez pas accès à ce compte client.");
    }
    return { user: { ...user, isSuperAdmin: false }, accountId: account.id, role: "VIEWER", viaAssistant };
  }
  if (user.isSuperAdmin) return { user, accountId: account.id, role: "ADMIN", viaAssistant };
  const [m] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, user.id), eq(memberships.accountId, account.id)))
    .limit(1);
  if (!m) throw forbidden("Vous n'avez pas accès à ce compte client.");
  return { user, accountId: account.id, role: m.role as Role, viaAssistant };
}
