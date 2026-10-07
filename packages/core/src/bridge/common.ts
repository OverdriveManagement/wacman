import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db, type Tx } from "../db.js";
import * as T from "../schema.js";
import { HttpError, forbidden, isUuid, notFound } from "../context.js";
import type { BridgeAccess, BridgeParty } from "../schema.js";

/**
 * WiBridge : règles communes (droits par client et par stream, réglages du client, journal).
 * Les droits sont calculés ici une seule fois et renvoyés à l'interface avec chaque question,
 * pour que l'écran n'affiche que ce que l'API acceptera.
 */

export type Party = BridgeParty;
export type Access = BridgeAccess;
export const PARTIES: Party[] = ["PROVIDER", "CLIENT"];
export const ACCESS_LEVELS: Access[] = ["NONE", "READ", "CLIENT", "PROVIDER", "BOTH"];

export interface BridgeUser {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
}

/** Organisations au nom desquelles un droit permet d'agir. */
export function partiesOf(a: Access): Party[] {
  if (a === "BOTH") return ["PROVIDER", "CLIENT"];
  if (a === "PROVIDER") return ["PROVIDER"];
  if (a === "CLIENT") return ["CLIENT"];
  return [];
}
export const canSee = (a: Access) => a !== "NONE";
export const other = (p: Party): Party => (p === "PROVIDER" ? "CLIENT" : "PROVIDER");

/** Règles du client, réglables par le super-administrateur (valeurs par défaut : la demande de cadrage). */
export interface BridgeSettings {
  /** Wifirst peut répondre aux questions attribuées au client (et les compléter à sa place). */
  providerAnswersForClient: boolean;
  /** Wifirst peut tout modifier : sujet, texte, streams, échéance, attribution et messages des autres. */
  providerEditsAll: boolean;
  /** Le client peut clôturer toute question (ANY) ou seulement celles qu'il a posées ou qui lui sont attribuées. */
  clientCloseScope: "ANY" | "OWN_OR_ASSIGNED";
  /** Le client peut rouvrir une question clôturée. */
  clientCanReopen: boolean;
  /** E-mails d'attribution et récapitulatifs quotidiens. */
  notifications: boolean;
}

export const defaultBridgeSettings: BridgeSettings = {
  providerAnswersForClient: true,
  providerEditsAll: true,
  clientCloseScope: "ANY",
  clientCanReopen: true,
  notifications: true,
};

export const bridgeSettingsSchema = z.object({
  providerAnswersForClient: z.boolean(),
  providerEditsAll: z.boolean(),
  clientCloseScope: z.enum(["ANY", "OWN_OR_ASSIGNED"]),
  clientCanReopen: z.boolean(),
  notifications: z.boolean(),
});

export function mergeBridgeSettings(stored: Record<string, unknown> | null | undefined): BridgeSettings {
  const p = bridgeSettingsSchema.partial().safeParse(stored ?? {});
  return { ...defaultBridgeSettings, ...(p.success ? p.data : {}) };
}

export type ClientRow = typeof T.bridgeClients.$inferSelect;
export type StreamRow = typeof T.bridgeStreams.$inferSelect;
export type MemberRow = typeof T.bridgeMembers.$inferSelect;

/** Contexte d'une opération sur un client WiBridge. */
export interface BridgeCtx {
  user: BridgeUser;
  client: ClientRow;
  settings: BridgeSettings;
  member: MemberRow | null;
  streams: StreamRow[];
  /** organisation de rattachement (Wifirst pour un super-administrateur sans adhésion) */
  side: Party;
  access: (streamId: string) => Access;
}

export function effectiveAccess(member: Pick<MemberRow, "defaultAccess" | "streamAccess"> | null, streamId: string): Access {
  if (!member) return "NONE";
  const own = (member.streamAccess ?? {})[streamId];
  return own && ACCESS_LEVELS.includes(own) ? own : member.defaultAccess;
}

export function partyLabel(client: Pick<ClientRow, "providerName" | "clientName">, p: Party | null | undefined) {
  return p === "PROVIDER" ? client.providerName : p === "CLIENT" ? client.clientName : "";
}

/** Contexte de l'utilisateur sur un client (par slug ou identifiant). Refuse un client non ouvert à l'utilisateur. */
export async function buildBridgeCtx(user: BridgeUser, clientIdOrSlug: string, tx: Tx = db): Promise<BridgeCtx> {
  const [client] = await tx
    .select()
    .from(T.bridgeClients)
    .where(isUuid(clientIdOrSlug) ? eq(T.bridgeClients.id, clientIdOrSlug) : eq(T.bridgeClients.slug, clientIdOrSlug))
    .limit(1);
  if (!client) throw notFound("Client introuvable.");
  const [member] = await tx
    .select()
    .from(T.bridgeMembers)
    .where(and(eq(T.bridgeMembers.userId, user.id), eq(T.bridgeMembers.clientId, client.id)))
    .limit(1);
  if (!user.isSuperAdmin && (!member || client.archived)) throw forbidden("Vous n'avez pas accès à ce client.");
  const streams = await tx.select().from(T.bridgeStreams).where(eq(T.bridgeStreams.clientId, client.id)).orderBy(asc(T.bridgeStreams.order), asc(T.bridgeStreams.name));
  const ids = new Set(streams.map((s) => s.id));
  return {
    user,
    client,
    settings: mergeBridgeSettings(client.settings),
    member: member ?? null,
    streams,
    side: member?.side ?? "PROVIDER",
    // le super-administrateur agit pour les deux organisations sur tous les streams
    access: (streamId) => (!ids.has(streamId) ? "NONE" : user.isSuperAdmin ? "BOTH" : effectiveAccess(member ?? null, streamId)),
  };
}

/** Droits de l'utilisateur sur l'ensemble des streams (pour l'écran). */
export function accessMap(ctx: BridgeCtx) {
  return Object.fromEntries(ctx.streams.map((s) => [s.id, ctx.access(s.id)])) as Record<string, Access>;
}

/** Streams dans lesquels l'utilisateur peut créer une question au nom de chaque organisation. */
export function creatableStreams(ctx: BridgeCtx): Record<Party, string[]> {
  const active = ctx.streams.filter((s) => s.active);
  return {
    PROVIDER: active.filter((s) => partiesOf(ctx.access(s.id)).includes("PROVIDER")).map((s) => s.id),
    CLIENT: active.filter((s) => partiesOf(ctx.access(s.id)).includes("CLIENT")).map((s) => s.id),
  };
}

export async function bridgeEvent(
  ctx: { user: { id: string; name: string }; client: { id: string } },
  questionId: string | null,
  action: string,
  summary: string,
  changes: Record<string, unknown> = {},
  party: Party | null = null,
  tx: Tx = db,
) {
  await tx.insert(T.bridgeEvents).values({ clientId: ctx.client.id, questionId, action, summary, changes, userId: ctx.user.id, userName: ctx.user.name, party });
}

export const zParty = z.enum(["PROVIDER", "CLIENT"]);
export const zAccess = z.enum(["NONE", "READ", "CLIENT", "PROVIDER", "BOTH"]);
const isRealDate = (v: string) => {
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
export const zDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu AAAA-MM-JJ").refine(isRealDate, "Date inexistante");

export function parse<S extends z.ZodTypeAny>(schema: S, input: unknown, msg = "Données invalides."): z.infer<S> {
  const p = schema.safeParse(input);
  if (!p.success) {
    const first = p.error.issues[0];
    throw new HttpError(400, first?.message && first.message !== "Required" && !first.message.startsWith("Expected") ? `${msg} ${first.message}` : msg, p.error.flatten());
  }
  return p.data;
}

/** Extrait court d'un texte (balisage retiré grossièrement) pour les e-mails et le journal. */
export function excerpt(s: string, n = 160) {
  const t = s
    .replace(/[*_~=`#]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/** Date du jour à Paris (AAAA-MM-JJ). */
export const parisToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
