import { z } from "zod";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, notInArray, or, sql, gt } from "drizzle-orm";
import { db } from "../db.js";
import * as T from "../schema.js";
import { badRequest, forbidden, isUuid, notFound } from "../context.js";
import { audit } from "../audit.js";
import { hashPassword } from "../services/users.js";
import { slugify } from "../services/accounts.js";
import { bridgeCreateInvitation, bridgeRevokeAllDevices } from "./auth.js";
import { bridgeEvent, bridgeSettingsSchema, mergeBridgeSettings, parse, zAccess, zParty, type BridgeUser } from "./common.js";

/** Administration de WiBridge (super-administrateur) : clients, streams, règles, utilisateurs et droits. */

function su(actor: BridgeUser) {
  if (!actor.isSuperAdmin) throw forbidden("Réservé au super-administrateur.");
}

export function defaultBridgeGuide(clientName: string, providerName = "Wifirst") {
  return [
    `**À quoi sert WiBridge** : ${providerName} et ${clientName} y posent leurs questions et leurs demandes d'éléments, et chacun voit à qui revient la suite.`,
    "**Poser une question** : bouton « Nouvelle question », avec un sujet, le texte de la question, un ou plusieurs streams et l'organisation qui doit répondre.",
    "**Répondre** : ouvrir les échanges d'une question, écrire la réponse puis choisir l'issue : attribuer à l'autre organisation, conserver l'attribution (premiers éléments, réponse à compléter) ou clôturer.",
    "**Rouvrir** : une question clôturée peut être rouverte à tout moment.",
    "**Historique** : le bouton horloge de chaque question montre toutes les modifications.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Clients et streams
// ---------------------------------------------------------------------------

export async function adminListBridgeClients(actor: BridgeUser) {
  su(actor);
  const clients = await db.select().from(T.bridgeClients).orderBy(asc(T.bridgeClients.archived), asc(T.bridgeClients.name));
  const streams = await db.select().from(T.bridgeStreams).orderBy(asc(T.bridgeStreams.order), asc(T.bridgeStreams.name));
  const used = await db
    .select({ s: T.bridgeQuestionStreams.streamId, n: sql<number>`count(*)::int` })
    .from(T.bridgeQuestionStreams)
    .groupBy(T.bridgeQuestionStreams.streamId);
  const nUsed = new Map(used.map((u) => [u.s, u.n]));
  const members = await db.select({ c: T.bridgeMembers.clientId, n: sql<number>`count(*)::int` }).from(T.bridgeMembers).groupBy(T.bridgeMembers.clientId);
  const nMembers = new Map(members.map((m) => [m.c, m.n]));
  const questions = await db
    .select({ c: T.bridgeQuestions.clientId, open: sql<number>`count(*) filter (where ${T.bridgeQuestions.status} <> 'CLOSED')::int`, n: sql<number>`count(*)::int` })
    .from(T.bridgeQuestions)
    .where(isNull(T.bridgeQuestions.deletedAt))
    .groupBy(T.bridgeQuestions.clientId);
  const nQ = new Map(questions.map((q) => [q.c, q]));
  return clients.map((c) => ({
    ...c,
    settings: mergeBridgeSettings(c.settings),
    streams: streams.filter((s) => s.clientId === c.id).map((s) => ({ ...s, questions: nUsed.get(s.id) ?? 0 })),
    members: nMembers.get(c.id) ?? 0,
    questions: nQ.get(c.id)?.n ?? 0,
    openQuestions: nQ.get(c.id)?.open ?? 0,
  }));
}

const clientCreateSchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire.").max(120),
  clientName: z.string().trim().min(1, "Le nom de l'organisation cliente est obligatoire.").max(80),
  providerName: z.string().trim().min(1).max(80).default("Wifirst"),
  shortName: z.string().trim().max(20).default(""),
  emoji: z.string().max(8).default("🤝"),
  description: z.string().max(5000).optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9-]{2,40}$/, "Identifiant : lettres minuscules, chiffres et tirets.")
    .optional(),
  streams: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
});

export async function adminCreateBridgeClient(actor: BridgeUser, input: unknown) {
  su(actor);
  const d = parse(clientCreateSchema, input);
  let slug = d.slug ?? (slugify(d.name) || "client");
  const base = slug;
  for (let i = 2; ; i++) {
    const [exists] = await db.select({ id: T.bridgeClients.id }).from(T.bridgeClients).where(eq(T.bridgeClients.slug, slug));
    if (!exists) break;
    slug = `${base}-${i}`;
  }
  const c = await db.transaction(async (tx) => {
    const [client] = await tx
      .insert(T.bridgeClients)
      .values({ slug, name: d.name, clientName: d.clientName, providerName: d.providerName, shortName: d.shortName, emoji: d.emoji || "🤝", description: d.description ?? defaultBridgeGuide(d.clientName, d.providerName) })
      .returning();
    const names = [...new Set(d.streams)];
    if (names.length) await tx.insert(T.bridgeStreams).values(names.map((name, i) => ({ clientId: client.id, name, order: i + 1 })));
    await bridgeEvent({ user: actor, client }, null, "config", `Client créé : ${client.name}`, { streams: names }, null, tx);
    return client;
  });
  return c;
}

const clientUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  clientName: z.string().trim().min(1).max(80).optional(),
  providerName: z.string().trim().min(1).max(80).optional(),
  shortName: z.string().trim().max(20).optional(),
  emoji: z.string().max(8).optional(),
  description: z.string().max(5000).optional(),
  archived: z.boolean().optional(),
  settings: bridgeSettingsSchema.partial().optional(),
});

async function clientRow(id: string) {
  if (!isUuid(id)) throw notFound("Client introuvable.");
  const [c] = await db.select().from(T.bridgeClients).where(eq(T.bridgeClients.id, id));
  if (!c) throw notFound("Client introuvable.");
  return c;
}

const SETTING_LABELS: Record<string, string> = {
  providerAnswersForClient: "réponse de Wifirst à la place du client",
  providerEditsAll: "modification de tout par Wifirst",
  clientCloseScope: "clôture par le client",
  clientCanReopen: "réouverture par le client",
  notifications: "e-mails",
};

export async function adminUpdateBridgeClient(actor: BridgeUser, clientId: string, input: unknown) {
  su(actor);
  const d = parse(clientUpdateSchema, input);
  const cur = await clientRow(clientId);
  const set: Partial<typeof T.bridgeClients.$inferInsert> = {};
  const changes: Record<string, [unknown, unknown]> = {};
  for (const k of ["name", "clientName", "providerName", "shortName", "emoji", "description", "archived"] as const) {
    if (d[k] !== undefined && d[k] !== cur[k]) {
      (set as Record<string, unknown>)[k] = d[k];
      changes[k] = [cur[k], d[k]];
    }
  }
  if (d.settings) {
    const before = mergeBridgeSettings(cur.settings);
    const next = { ...before, ...d.settings };
    for (const k of Object.keys(d.settings) as (keyof typeof before)[]) if (before[k] !== next[k]) changes[`settings.${k}`] = [before[k], next[k]];
    set.settings = next as unknown as Record<string, unknown>;
  }
  if (!Object.keys(changes).length) return cur;
  const [c] = await db.update(T.bridgeClients).set(set).where(eq(T.bridgeClients.id, cur.id)).returning();
  const what = Object.keys(changes).map((k) => (k.startsWith("settings.") ? SETTING_LABELS[k.slice(9)] ?? k : ({ name: "nom", clientName: "organisation cliente", providerName: "organisation Wifirst", shortName: "sigle", emoji: "picto", description: "mode d'emploi", archived: "archivage" } as Record<string, string>)[k] ?? k));
  await bridgeEvent({ user: actor, client: c }, null, "config", `Configuration du client modifiée : ${what.join(", ")}`, changes);
  return c;
}

const streamSchema = z.object({ name: z.string().trim().min(1, "Le nom du stream est obligatoire.").max(80), emoji: z.string().max(8).default("") });

export async function adminCreateBridgeStream(actor: BridgeUser, clientId: string, input: unknown) {
  su(actor);
  const d = parse(streamSchema, input);
  const c = await clientRow(clientId);
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${T.bridgeStreams.order}), 0)::int` }).from(T.bridgeStreams).where(eq(T.bridgeStreams.clientId, c.id));
  const [s] = await db.insert(T.bridgeStreams).values({ clientId: c.id, name: d.name, emoji: d.emoji, order: max + 1 }).returning();
  await bridgeEvent({ user: actor, client: c }, null, "config", `Stream ajouté : ${s.name}`);
  return s;
}

async function streamRow(id: string) {
  if (!isUuid(id)) throw notFound("Stream introuvable.");
  const [s] = await db.select().from(T.bridgeStreams).where(eq(T.bridgeStreams.id, id));
  if (!s) throw notFound("Stream introuvable.");
  return s;
}

export async function adminUpdateBridgeStream(actor: BridgeUser, streamId: string, input: unknown) {
  su(actor);
  const d = parse(z.object({ name: z.string().trim().min(1).max(80).optional(), emoji: z.string().max(8).optional(), active: z.boolean().optional() }), input);
  const s = await streamRow(streamId);
  const [n] = await db.update(T.bridgeStreams).set(d).where(eq(T.bridgeStreams.id, s.id)).returning();
  const changes: Record<string, [unknown, unknown]> = {};
  for (const k of Object.keys(d) as (keyof typeof d)[]) if (d[k] !== undefined && d[k] !== s[k]) changes[k] = [s[k], d[k]];
  if (Object.keys(changes).length) await bridgeEvent({ user: actor, client: { id: s.clientId } }, null, "config", `Stream modifié : ${n.name}${d.active === false && s.active ? " (désactivé)" : d.active && !s.active ? " (réactivé)" : ""}`, changes);
  return n;
}

export async function adminDeleteBridgeStream(actor: BridgeUser, streamId: string) {
  su(actor);
  const s = await streamRow(streamId);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(T.bridgeQuestionStreams).where(eq(T.bridgeQuestionStreams.streamId, s.id));
  if (n > 0) throw badRequest(`Ce stream est utilisé par ${n} question${n > 1 ? "s" : ""} : désactivez-le plutôt (il reste alors visible sur ces questions).`);
  await db.transaction(async (tx) => {
    await tx.delete(T.bridgeStreams).where(eq(T.bridgeStreams.id, s.id));
    // droits propres à ce stream retirés des adhésions
    await tx.execute(sql`update bridge_members set stream_access = stream_access - ${s.id} where client_id = ${s.clientId} and stream_access ? ${s.id}`);
    await bridgeEvent({ user: actor, client: { id: s.clientId } }, null, "config", `Stream supprimé : ${s.name}`, {}, null, tx);
  });
  return { ok: true };
}

export async function adminReorderBridgeStreams(actor: BridgeUser, clientId: string, input: unknown) {
  su(actor);
  const { ids } = parse(z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }), input, "Liste d'identifiants attendue.");
  const c = await clientRow(clientId);
  const rows = await db.select({ id: T.bridgeStreams.id }).from(T.bridgeStreams).where(eq(T.bridgeStreams.clientId, c.id));
  const known = new Set(rows.map((r) => r.id));
  if (ids.some((id) => !known.has(id))) throw badRequest("Stream inconnu pour ce client.");
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) await tx.update(T.bridgeStreams).set({ order: i + 1 }).where(eq(T.bridgeStreams.id, id));
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Utilisateurs, invitations et droits
// ---------------------------------------------------------------------------

const membershipSchema = z.object({
  clientId: z.string().uuid("Client inconnu."),
  side: zParty,
  defaultAccess: zAccess,
  streamAccess: z.record(zAccess).default({}),
  notify: z.enum(["IMMEDIATE", "DAILY", "NONE"]).optional(),
});
type MembershipInput = z.infer<typeof membershipSchema>;

async function checkMemberships(list: MembershipInput[]) {
  const ids = [...new Set(list.map((m) => m.clientId))];
  if (ids.length !== list.length) throw badRequest("Un client figure deux fois dans les accès.");
  if (!ids.length) return list;
  const streams = await db.select({ id: T.bridgeStreams.id, clientId: T.bridgeStreams.clientId }).from(T.bridgeStreams).where(inArray(T.bridgeStreams.clientId, ids));
  const clients = await db.select({ id: T.bridgeClients.id }).from(T.bridgeClients).where(inArray(T.bridgeClients.id, ids));
  if (clients.length !== ids.length) throw badRequest("Client inconnu.");
  return list.map((m) => {
    const own = new Set(streams.filter((s) => s.clientId === m.clientId).map((s) => s.id));
    const streamAccess: Record<string, z.infer<typeof zAccess>> = {};
    for (const [sid, a] of Object.entries(m.streamAccess)) {
      if (!own.has(sid)) throw badRequest("Stream inconnu pour ce client.");
      if (a !== m.defaultAccess) streamAccess[sid] = a; // un droit identique au droit par défaut n'est pas conservé à part
    }
    return { ...m, streamAccess };
  });
}

async function upsertMemberships(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], userId: string, list: MembershipInput[]) {
  for (const m of list) {
    await tx
      .insert(T.bridgeMembers)
      .values({ userId, clientId: m.clientId, side: m.side, defaultAccess: m.defaultAccess, streamAccess: m.streamAccess, notify: m.notify ?? "NONE" })
      .onConflictDoUpdate({
        target: [T.bridgeMembers.userId, T.bridgeMembers.clientId],
        set: { side: m.side, defaultAccess: m.defaultAccess, streamAccess: m.streamAccess, ...(m.notify ? { notify: m.notify } : {}) },
      });
  }
}

export async function adminListBridgeUsers(actor: BridgeUser) {
  su(actor);
  const memberRows = await db
    .select({ m: T.bridgeMembers, c: { id: T.bridgeClients.id, name: T.bridgeClients.name, slug: T.bridgeClients.slug } })
    .from(T.bridgeMembers)
    .innerJoin(T.bridgeClients, eq(T.bridgeClients.id, T.bridgeMembers.clientId));
  const memberIds = [...new Set(memberRows.map((r) => r.m.userId))];
  const users = await db
    .select()
    .from(T.users)
    .where(or(eq(T.users.bridgeAccess, true), eq(T.users.isSuperAdmin, true), memberIds.length ? inArray(T.users.id, memberIds) : sql`false`))
    .orderBy(asc(T.users.name));
  const invitations = await db
    .selectDistinctOn([T.bridgeInvitations.userId])
    .from(T.bridgeInvitations)
    .orderBy(T.bridgeInvitations.userId, desc(T.bridgeInvitations.createdAt));
  const inv = new Map(invitations.map((i) => [i.userId, i]));
  const devices = await db
    .select({ u: T.bridgeDevices.userId, n: sql<number>`count(*)::int` })
    .from(T.bridgeDevices)
    .where(and(isNull(T.bridgeDevices.revokedAt), gt(T.bridgeDevices.expiresAt, new Date())))
    .groupBy(T.bridgeDevices.userId);
  const nDev = new Map(devices.map((d) => [d.u, d.n]));
  return users.map((u) => {
    const i = inv.get(u.id);
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      active: u.active,
      isSuperAdmin: u.isSuperAdmin,
      wacmanAccess: u.wacmanAccess || u.isSuperAdmin,
      bridgeAccess: u.bridgeAccess || u.isSuperAdmin,
      passwordSet: u.passwordSet,
      lastLoginAt: u.bridgeLastLoginAt,
      invitation: i ? { createdAt: i.createdAt, expiresAt: i.expiresAt, acceptedAt: i.acceptedAt, revokedAt: i.revokedAt } : null,
      devices: nDev.get(u.id) ?? 0,
      memberships: memberRows
        .filter((r) => r.m.userId === u.id)
        .map((r) => ({ clientId: r.c.id, clientName: r.c.name, clientSlug: r.c.slug, side: r.m.side, defaultAccess: r.m.defaultAccess, streamAccess: r.m.streamAccess, notify: r.m.notify })),
    };
  });
}

const inviteSchema = z.object({
  email: z.string().trim().email("E-mail invalide."),
  name: z.string().trim().min(1, "Le nom est obligatoire.").max(120),
  memberships: z.array(membershipSchema).max(50).default([]),
  wacmanAccess: z.boolean().optional(),
});

/**
 * Invite une adresse e-mail : crée le compte (sans mot de passe, sans accès WacMan) et ses droits, puis renvoie le jeton
 * d'invitation à envoyer par e-mail. Pour un compte existant (WacMan par exemple), l'accès WiBridge est ouvert
 * et la personne se connecte avec son mot de passe habituel.
 */
export async function adminInviteBridgeUser(actor: BridgeUser, input: unknown) {
  su(actor);
  const d = parse(inviteSchema, input);
  const email = d.email.toLowerCase();
  const memberships = await checkMemberships(d.memberships);
  const r = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(T.users).where(eq(T.users.email, email));
    let user = existing;
    if (existing) {
      const set: Partial<typeof T.users.$inferInsert> = { bridgeAccess: true };
      if (!existing.passwordSet) set.name = d.name;
      if (d.wacmanAccess) set.wacmanAccess = true;
      [user] = await tx.update(T.users).set(set).where(eq(T.users.id, existing.id)).returning();
    } else {
      [user] = await tx
        .insert(T.users)
        .values({ email, name: d.name, passwordHash: await hashPassword(randomBytes(24).toString("base64url")), passwordSet: false, wacmanAccess: !!d.wacmanAccess, bridgeAccess: true })
        .returning();
    }
    await upsertMemberships(tx, user.id, memberships);
    return { user, created: !existing };
  });
  await audit({ user: actor, accountId: null }, "bridgeUser", r.user.id, r.created ? "create" : "update", r.created ? `WiBridge : invitation de ${r.user.name}` : `WiBridge : accès ouvert à ${r.user.name}`, { clients: memberships.map((m) => m.clientId) });
  return invitationFor(actor, r.user.id);
}

/** Jeton d'invitation (compte sans mot de passe) ou simple avis d'accès (compte existant). */
export async function invitationFor(actor: BridgeUser, userId: string) {
  su(actor);
  if (!isUuid(userId)) throw notFound("Utilisateur introuvable.");
  const [u] = await db.select().from(T.users).where(eq(T.users.id, userId));
  if (!u) throw notFound("Utilisateur introuvable.");
  if (!u.active) throw badRequest("Ce compte est désactivé.");
  if (!u.bridgeAccess && !u.isSuperAdmin) throw badRequest("Ce compte n'a pas accès à WiBridge.");
  const clients = await db
    .select({ name: T.bridgeClients.name, clientName: T.bridgeClients.clientName })
    .from(T.bridgeMembers)
    .innerJoin(T.bridgeClients, eq(T.bridgeClients.id, T.bridgeMembers.clientId))
    .where(eq(T.bridgeMembers.userId, u.id));
  if (u.passwordSet) return { mode: "access" as const, user: { id: u.id, email: u.email, name: u.name }, clients, token: null, expiresAt: null };
  const { token, expiresAt } = await bridgeCreateInvitation(u.id, actor.id);
  return { mode: "invite" as const, user: { id: u.id, email: u.email, name: u.name }, clients, token, expiresAt };
}

const userUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  bridgeAccess: z.boolean().optional(),
  wacmanAccess: z.boolean().optional(),
});

export async function adminUpdateBridgeUser(actor: BridgeUser, userId: string, input: unknown) {
  su(actor);
  const d = parse(userUpdateSchema, input);
  if (!isUuid(userId)) throw notFound("Utilisateur introuvable.");
  const [cur] = await db.select().from(T.users).where(eq(T.users.id, userId));
  if (!cur) throw notFound("Utilisateur introuvable.");
  if (cur.isSuperAdmin && (d.bridgeAccess === false || d.wacmanAccess === false)) throw badRequest("Le super-administrateur garde l'accès aux deux applications.");
  const [u] = await db.update(T.users).set(d).where(eq(T.users.id, cur.id)).returning();
  if (d.bridgeAccess === false && cur.bridgeAccess) {
    // plus d'accès : appareils de confiance et invitations en cours annulés (les sessions sont refusées dès la requête suivante)
    await bridgeRevokeAllDevices(u.id);
    await db.update(T.bridgeInvitations).set({ revokedAt: new Date() }).where(and(eq(T.bridgeInvitations.userId, u.id), isNull(T.bridgeInvitations.acceptedAt), isNull(T.bridgeInvitations.revokedAt)));
  }
  const what = [
    d.name !== undefined && d.name !== cur.name ? "nom" : "",
    d.bridgeAccess !== undefined && d.bridgeAccess !== cur.bridgeAccess ? (d.bridgeAccess ? "accès WiBridge ouvert" : "accès WiBridge retiré") : "",
    d.wacmanAccess !== undefined && d.wacmanAccess !== cur.wacmanAccess ? (d.wacmanAccess ? "accès WacMan ouvert" : "accès WacMan retiré") : "",
  ].filter(Boolean);
  if (what.length) await audit({ user: actor, accountId: null }, "bridgeUser", u.id, "update", `WiBridge : ${u.name}, ${what.join(", ")}`);
  return { ok: true };
}

/** Remplace l'ensemble des accès de l'utilisateur aux clients WiBridge. */
export async function adminSetBridgeMemberships(actor: BridgeUser, userId: string, input: unknown) {
  su(actor);
  const { memberships } = parse(z.object({ memberships: z.array(membershipSchema).max(50) }), input);
  if (!isUuid(userId)) throw notFound("Utilisateur introuvable.");
  const [u] = await db.select().from(T.users).where(eq(T.users.id, userId));
  if (!u) throw notFound("Utilisateur introuvable.");
  const list = await checkMemberships(memberships);
  await db.transaction(async (tx) => {
    const keep = list.map((m) => m.clientId);
    await tx.delete(T.bridgeMembers).where(and(eq(T.bridgeMembers.userId, u.id), keep.length ? notInArray(T.bridgeMembers.clientId, keep) : sql`true`));
    await upsertMemberships(tx, u.id, list);
  });
  await audit({ user: actor, accountId: null }, "bridgeUser", u.id, "update", `WiBridge : droits de ${u.name} modifiés`, { memberships: list.map((m) => ({ clientId: m.clientId, side: m.side, defaultAccess: m.defaultAccess, streams: Object.keys(m.streamAccess).length })) });
  return { ok: true };
}

export async function adminRevokeBridgeDevices(actor: BridgeUser, userId: string) {
  su(actor);
  if (!isUuid(userId)) throw notFound("Utilisateur introuvable.");
  await bridgeRevokeAllDevices(userId);
  return { ok: true };
}

/** Journal de WiBridge : toutes les modifications, du plus récent au plus ancien. */
export async function adminBridgeJournal(actor: BridgeUser, opts: { clientId?: string; limit?: number }) {
  su(actor);
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 1000);
  const rows = await db
    .select({ e: T.bridgeEvents, ref: T.bridgeQuestions.ref, subject: T.bridgeQuestions.subject, client: T.bridgeClients.name, slug: T.bridgeClients.slug })
    .from(T.bridgeEvents)
    .innerJoin(T.bridgeClients, eq(T.bridgeClients.id, T.bridgeEvents.clientId))
    .leftJoin(T.bridgeQuestions, eq(T.bridgeQuestions.id, T.bridgeEvents.questionId))
    .where(opts.clientId && isUuid(opts.clientId) ? eq(T.bridgeEvents.clientId, opts.clientId) : undefined)
    .orderBy(desc(T.bridgeEvents.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r.e, ref: r.ref, subject: r.subject, clientName: r.client, clientSlug: r.slug }));
}
