import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db, T, HttpError, toSessionUser, resolveApiToken, TOKEN_PREFIX, type SessionUser } from "@wacman/core";
import { env } from "./env.js";

export const SESSION_COOKIE = "wacman_session";
const SESSION_DAYS = 14;
const key = new TextEncoder().encode(env.sessionSecret);

export async function signSession(user: { id: string; sessionVersion: number }) {
  return new SignJWT({ v: user.sessionVersion, typ: "session" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key);
}

/** Jeton court (10 min) utilisé par le navigateur pour appeler l'assistant directement sur l'API. */
export async function signAssistantToken(user: { id: string; sessionVersion: number }) {
  return new SignJWT({ v: user.sessionVersion, typ: "assistant" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key);
}

export function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProd,
    maxAge: SESSION_DAYS * 24 * 3600,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

async function userFromToken(token: string, typ: "session" | "assistant"): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (payload.typ !== typ || !payload.sub) return null;
    const [u] = await db.select().from(T.users).where(eq(T.users.id, payload.sub));
    if (!u || !u.active || u.sessionVersion !== payload.v) return null;
    return toSessionUser(u);
  } catch {
    return null;
  }
}

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionUser;
    /** vrai si la requête est authentifiée par un jeton d'accès en lecture seule */
    readOnlyToken?: boolean;
    /** vrai si la requête est authentifiée par un jeton d'accès personnel */
    viaToken?: boolean;
  }
}

/**
 * Identifie l'utilisateur : cookie de session, jeton assistant (Bearer, 10 min)
 * ou jeton d'accès personnel (Bearer wac_…).
 */
export async function resolveUser(req: FastifyRequest): Promise<SessionUser | null> {
  const cookie = req.cookies?.[SESSION_COOKIE];
  if (cookie) {
    const u = await userFromToken(cookie, "session");
    if (u) return u;
  }
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token.startsWith(TOKEN_PREFIX)) return userFromApiToken(req, token);
    // le jeton court de l'assistant ne vaut que pour l'appel de l'assistant (pas de session complète)
    const path = req.url.split("?")[0];
    if (req.method !== "POST" || !/^\/api\/accounts\/[^/]+\/assistant$/.test(path)) return null;
    return userFromToken(token, "assistant");
  }
  return null;
}

export async function userFromApiToken(req: FastifyRequest, token: string): Promise<SessionUser | null> {
  const r = await resolveApiToken(token);
  if (!r) return null;
  req.viaToken = true;
  req.readOnlyToken = r.readOnly;
  return r.readOnly ? { ...r.user, isSuperAdmin: false } : r.user;
}

export function requireUser(req: FastifyRequest): SessionUser {
  if (!req.user) throw new HttpError(401, "Session expirée : reconnectez-vous.");
  return req.user;
}

// ---------------------------------------------------------------------------
// Limitation simple des tentatives de connexion (mémoire du processus)
// ---------------------------------------------------------------------------
const attempts = new Map<string, { n: number; until: number }>();

export function throttle(key: string, max = 8, windowMs = 10 * 60_000) {
  const now = Date.now();
  if (attempts.size > 5000) for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
  const cur = attempts.get(key);
  if (!cur || cur.until < now) {
    attempts.set(key, { n: 1, until: now + windowMs });
    return;
  }
  cur.n++;
  if (cur.n > max) throw new HttpError(429, "Trop de tentatives. Réessayez dans quelques minutes.");
}
