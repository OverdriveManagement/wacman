import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db, T, HttpError, Bridge } from "@wacman/core";
import { env } from "../env.js";

/**
 * Sessions WiBridge, distinctes de celles de WacMan : cookie propre (wib_session), type de jeton propre (bridge),
 * accès vérifié à chaque requête (compte actif, accès WiBridge ou super-administrateur).
 */

export const BRIDGE_SESSION_COOKIE = "wib_session";
export const BRIDGE_DEVICE_COOKIE = "wib_device";
const SESSION_DAYS = 14;
const key = new TextEncoder().encode(env.sessionSecret);

type Typ = "bridge" | "bridge-upload" | "bridge-file";

async function sign(user: { id: string; sessionVersion: number }, typ: Typ, ttl: string, extra: Record<string, unknown> = {}) {
  return new SignJWT({ v: user.sessionVersion, typ, ...extra }).setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setIssuedAt().setExpirationTime(ttl).sign(key);
}

export const signBridgeSession = (u: { id: string; sessionVersion: number }) => sign(u, "bridge", `${SESSION_DAYS}d`);
/** Jeton court pour déposer un fichier directement sur l'API (sans passer par le relais Vercel). */
export const signBridgeUpload = (u: { id: string; sessionVersion: number }) => sign(u, "bridge-upload", "15m");
/** Lien de téléchargement d'une pièce jointe, valable 5 minutes. */
export const signBridgeFile = (u: { id: string; sessionVersion: number }, fileId: string, clientId: string) => sign(u, "bridge-file", "5m", { fid: fileId, cid: clientId });

export async function readBridgeToken(token: string, typ: Typ) {
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (payload.typ !== typ || !payload.sub) return null;
    const [u] = await db.select().from(T.users).where(eq(T.users.id, payload.sub));
    if (!u || !Bridge.canUseBridge(u) || u.sessionVersion !== payload.v) return null;
    return { user: u, payload };
  } catch {
    return null;
  }
}

declare module "fastify" {
  interface FastifyRequest {
    bridgeUser?: Bridge.BridgeUser;
  }
}

const UPLOAD_PATH = /^\/api\/bridge\/c\/[^/]+\/files$/;

/** Utilisateur WiBridge de la requête : cookie de session, ou jeton court de dépôt de fichier. */
export async function resolveBridgeUser(req: FastifyRequest): Promise<Bridge.BridgeUser | null> {
  const cookie = req.cookies?.[BRIDGE_SESSION_COOKIE];
  if (cookie) {
    const r = await readBridgeToken(cookie, "bridge");
    if (r) return Bridge.toBridgeUser(r.user);
  }
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ") && req.method === "POST" && UPLOAD_PATH.test(req.url.split("?")[0])) {
    const r = await readBridgeToken(auth.slice(7).trim(), "bridge-upload");
    if (r) return Bridge.toBridgeUser(r.user);
  }
  return null;
}

export function requireBridgeUser(req: FastifyRequest): Bridge.BridgeUser {
  if (!req.bridgeUser) throw new HttpError(401, "Session expirée : reconnectez-vous.");
  return req.bridgeUser;
}

export function setBridgeSession(reply: FastifyReply, token: string) {
  reply.setCookie(BRIDGE_SESSION_COOKIE, token, { path: "/", httpOnly: true, sameSite: "lax", secure: env.isProd, maxAge: SESSION_DAYS * 24 * 3600 });
}

export function clearBridgeSession(reply: FastifyReply) {
  reply.clearCookie(BRIDGE_SESSION_COOKIE, { path: "/" });
}

/** Cookie d'appareil de confiance : limité aux routes de connexion, 180 jours. */
export function setBridgeDevice(reply: FastifyReply, token: string) {
  reply.setCookie(BRIDGE_DEVICE_COOKIE, token, { path: "/api/bridge/auth", httpOnly: true, sameSite: "lax", secure: env.isProd, maxAge: Bridge.BRIDGE_DEVICE_DAYS * 24 * 3600 });
}

export function clearBridgeDevice(reply: FastifyReply) {
  reply.clearCookie(BRIDGE_DEVICE_COOKIE, { path: "/api/bridge/auth" });
}

/** Libellé lisible de l'appareil, tiré du navigateur (« Chrome sur macOS »). */
export function deviceLabel(ua: string | undefined) {
  const s = ua ?? "";
  const browser = /Edg\//.test(s) ? "Edge" : /OPR\//.test(s) ? "Opera" : /Firefox\//.test(s) ? "Firefox" : /Chrome\//.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : "Navigateur";
  const os = /iPhone|iPad/.test(s) ? "iOS" : /Android/.test(s) ? "Android" : /Mac OS X/.test(s) ? "macOS" : /Windows/.test(s) ? "Windows" : /Linux/.test(s) ? "Linux" : "système inconnu";
  return `${browser} sur ${os}`;
}
