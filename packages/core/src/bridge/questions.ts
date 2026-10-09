import { z } from "zod";
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db, type Tx } from "../db.js";
import * as T from "../schema.js";
import { UUID_RE, badRequest, forbidden, isUuid, notFound } from "../context.js";
import { fold } from "../services/insights.js";
import {
  PARTIES,
  bridgeEvent,
  canSee,
  creatableStreams,
  excerpt,
  other,
  parse,
  partiesOf,
  partyLabel,
  zDay,
  zParty,
  type BridgeCtx,
  type Party,
} from "./common.js";
import { emitBridgeNotice, type NoticeActor } from "./notify.js";

type QuestionRow = typeof T.bridgeQuestions.$inferSelect;
type MessageRow = typeof T.bridgeMessages.$inferSelect;

/** Ce que l'utilisateur peut faire sur une question (calculé côté serveur, affiché tel quel par l'écran). */
export interface QuestionPerms {
  /** sujet, texte, échéance et pièces jointes de la question */
  edit: boolean;
  /** streams que l'utilisateur peut ajouter ou retirer */
  streams: string[];
  /** organisations au nom desquelles il peut répondre */
  respondAs: Party[];
  close: boolean;
  /** organisations au nom desquelles il peut rouvrir la question (si elle est clôturée) */
  reopenAs: Party[];
  /** changer l'attribution sans écrire de message */
  reassign: boolean;
  delete: boolean;
  restore: boolean;
}

interface Role {
  su: boolean;
  parties: Set<Party>;
  asProvider: boolean;
  asClient: boolean;
  isCreator: boolean;
  providerAll: boolean;
}

function roleOn(ctx: BridgeCtx, q: Pick<QuestionRow, "askedById" | "askedByParty">, streamIds: string[]): Role {
  const su = ctx.user.isSuperAdmin;
  const parties = new Set<Party>(su ? PARTIES : streamIds.flatMap((s) => partiesOf(ctx.access(s))));
  const asProvider = parties.has("PROVIDER");
  const asClient = parties.has("CLIENT");
  return {
    su,
    parties,
    asProvider,
    asClient,
    isCreator: q.askedById === ctx.user.id && parties.has(q.askedByParty),
    providerAll: asProvider && ctx.settings.providerEditsAll,
  };
}

export function canSeeQuestion(ctx: BridgeCtx, streamIds: string[]) {
  return ctx.user.isSuperAdmin || streamIds.some((s) => canSee(ctx.access(s)));
}

export function questionPerms(ctx: BridgeCtx, q: Pick<QuestionRow, "askedById" | "askedByParty" | "assignedParty" | "status" | "deletedAt">, streamIds: string[], messageCount: number): QuestionPerms {
  const r = roleOn(ctx, q, streamIds);
  const none: QuestionPerms = { edit: false, streams: [], respondAs: [], close: false, reopenAs: [], reassign: false, delete: false, restore: false };
  if (q.deletedAt) return { ...none, restore: r.su };
  const s = ctx.settings;
  const closed = q.status === "CLOSED";
  const edit = r.su || r.isCreator || r.providerAll;
  // un stream se modifie au titre qui permet de modifier la question : Wifirst (tout modifier) ou l'organisation du créateur
  const editParties: Party[] = r.su ? PARTIES : [...(r.providerAll ? (["PROVIDER"] as Party[]) : []), ...(r.isCreator ? [q.askedByParty] : [])];
  const streams = edit
    ? ctx.streams.filter((st) => (r.su || partiesOf(ctx.access(st.id)).some((p) => editParties.includes(p))) && (st.active || streamIds.includes(st.id))).map((st) => st.id)
    : [];
  const respondAs: Party[] = [];
  if (!closed) {
    if (r.asProvider && (q.assignedParty === "PROVIDER" || s.providerAnswersForClient)) respondAs.push("PROVIDER");
    if (r.asClient && q.assignedParty === "CLIENT") respondAs.push("CLIENT");
  }
  const clientMayClose = r.asClient && (s.clientCloseScope === "ANY" || q.assignedParty === "CLIENT" || q.askedByParty === "CLIENT");
  const reopenAs: Party[] = closed ? [...(r.asProvider ? (["PROVIDER"] as Party[]) : []), ...(r.asClient && s.clientCanReopen ? (["CLIENT"] as Party[]) : [])] : [];
  return {
    edit,
    streams,
    respondAs,
    close: !closed && (r.asProvider || clientMayClose),
    reopenAs,
    reassign: !closed && ((r.asProvider && (s.providerEditsAll || q.assignedParty === "PROVIDER")) || (r.asClient && q.assignedParty === "CLIENT")),
    delete: r.su || (r.isCreator && messageCount === 0),
    restore: false,
  };
}

/** Modifier ou supprimer un message : son auteur (avec ses droits sur l'organisation du message), Wifirst avec la règle « tout modifier », le super-administrateur. */
function canEditMessage(ctx: BridgeCtx, role: Role, m: Pick<MessageRow, "authorId" | "party" | "deletedAt">) {
  if (m.deletedAt) return false;
  return role.su || role.providerAll || (m.authorId === ctx.user.id && role.parties.has(m.party));
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

interface Loaded {
  q: QuestionRow;
  streamIds: string[];
  messageCount: number;
}

/** Charge une question visible (par identifiant ou par numéro), éventuellement verrouillée pour une modification. */
async function loadQuestion(ctx: BridgeCtx, idOrRef: string, tx: Tx = db, opts: { forUpdate?: boolean; allowDeleted?: boolean } = {}): Promise<Loaded> {
  const key = String(idOrRef);
  const where = UUID_RE.test(key)
    ? and(eq(T.bridgeQuestions.id, key), eq(T.bridgeQuestions.clientId, ctx.client.id))
    : /^#?\d{1,7}$/.test(key)
      ? and(eq(T.bridgeQuestions.ref, Number(key.replace("#", ""))), eq(T.bridgeQuestions.clientId, ctx.client.id))
      : null;
  if (!where) throw notFound("Question introuvable.");
  const base = tx.select().from(T.bridgeQuestions).where(where);
  const [q] = opts.forUpdate ? await base.for("update") : await base;
  if (!q || (q.deletedAt && !(opts.allowDeleted && ctx.user.isSuperAdmin))) throw notFound("Question introuvable.");
  const streamIds = (await tx.select({ s: T.bridgeQuestionStreams.streamId }).from(T.bridgeQuestionStreams).where(eq(T.bridgeQuestionStreams.questionId, q.id))).map((r) => r.s);
  // une question hors de ses streams n'existe pas pour l'utilisateur (404 plutôt que 403 : rien n'est révélé)
  if (!canSeeQuestion(ctx, streamIds)) throw notFound("Question introuvable.");
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(T.bridgeMessages).where(and(eq(T.bridgeMessages.questionId, q.id), isNull(T.bridgeMessages.deletedAt)));
  return { q, streamIds: sortStreams(ctx, streamIds), messageCount: n };
}

const sortStreams = (ctx: BridgeCtx, ids: string[]) => {
  const order = new Map(ctx.streams.map((s, i) => [s.id, i]));
  return [...ids].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
};

function listItem(ctx: BridgeCtx, l: Loaded, extra: { fileCount: number; lastMessage: LastMessage | null }) {
  const q = l.q;
  return {
    id: q.id,
    ref: q.ref,
    subject: q.subject,
    body: q.body,
    streamIds: l.streamIds,
    askedBy: { id: q.askedById, name: q.askedByName },
    askedByParty: q.askedByParty,
    assignedParty: q.assignedParty,
    status: q.status,
    dueDate: q.dueDate,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    lastActivityAt: q.lastActivityAt,
    closedAt: q.closedAt,
    closedByName: q.closedByName,
    deletedAt: q.deletedAt,
    messageCount: l.messageCount,
    fileCount: extra.fileCount,
    lastMessage: extra.lastMessage,
    perms: questionPerms(ctx, q, l.streamIds, l.messageCount),
  };
}

export type QuestionListItem = ReturnType<typeof listItem>;

interface LastMessage {
  party: Party;
  authorName: string;
  createdAt: Date;
  excerpt: string;
  outcome: string;
  assignedAfter: Party | null;
}

/** Toutes les questions visibles du client (non supprimées, ou la corbeille pour un super-administrateur). */
export async function listQuestions(ctx: BridgeCtx, opts: { deleted?: boolean } = {}) {
  const cid = ctx.client.id;
  const deleted = !!opts.deleted && ctx.user.isSuperAdmin;
  const rows = await db
    .select()
    .from(T.bridgeQuestions)
    .where(and(eq(T.bridgeQuestions.clientId, cid), deleted ? isNotNull(T.bridgeQuestions.deletedAt) : isNull(T.bridgeQuestions.deletedAt)))
    .orderBy(desc(T.bridgeQuestions.ref));
  if (!rows.length) return [];
  const links = await db
    .select({ q: T.bridgeQuestionStreams.questionId, s: T.bridgeQuestionStreams.streamId })
    .from(T.bridgeQuestionStreams)
    .innerJoin(T.bridgeQuestions, eq(T.bridgeQuestions.id, T.bridgeQuestionStreams.questionId))
    .where(eq(T.bridgeQuestions.clientId, cid));
  const streamsOf = new Map<string, string[]>();
  for (const l of links) streamsOf.set(l.q, [...(streamsOf.get(l.q) ?? []), l.s]);
  const visible = rows.filter((q) => canSeeQuestion(ctx, streamsOf.get(q.id) ?? []));
  if (!visible.length) return [];
  const [counts, lasts, files] = await Promise.all([
    db
      .select({ q: T.bridgeMessages.questionId, n: sql<number>`count(*)::int` })
      .from(T.bridgeMessages)
      .where(and(eq(T.bridgeMessages.clientId, cid), isNull(T.bridgeMessages.deletedAt)))
      .groupBy(T.bridgeMessages.questionId),
    db
      .selectDistinctOn([T.bridgeMessages.questionId], {
        q: T.bridgeMessages.questionId,
        party: T.bridgeMessages.party,
        authorName: T.bridgeMessages.authorName,
        createdAt: T.bridgeMessages.createdAt,
        body: T.bridgeMessages.body,
        outcome: T.bridgeMessages.outcome,
        assignedAfter: T.bridgeMessages.assignedAfter,
      })
      .from(T.bridgeMessages)
      .where(and(eq(T.bridgeMessages.clientId, cid), isNull(T.bridgeMessages.deletedAt)))
      .orderBy(T.bridgeMessages.questionId, desc(T.bridgeMessages.createdAt)),
    db
      .select({ q: T.bridgeFiles.questionId, n: sql<number>`count(*)::int` })
      .from(T.bridgeFiles)
      .where(and(eq(T.bridgeFiles.clientId, cid), isNotNull(T.bridgeFiles.attachedAt)))
      .groupBy(T.bridgeFiles.questionId),
  ]);
  const count = new Map(counts.map((c) => [c.q, c.n]));
  const last = new Map(lasts.map((m) => [m.q, m]));
  const nFiles = new Map(files.map((f) => [f.q, f.n]));
  return visible.map((q) => {
    const m = last.get(q.id);
    return listItem(
      ctx,
      { q, streamIds: sortStreams(ctx, streamsOf.get(q.id) ?? []), messageCount: count.get(q.id) ?? 0 },
      {
        fileCount: nFiles.get(q.id) ?? 0,
        lastMessage: m ? { party: m.party, authorName: m.authorName, createdAt: m.createdAt, excerpt: excerpt(m.body, 220), outcome: m.outcome, assignedAfter: m.assignedAfter } : null,
      },
    );
  });
}

/** Une question avec ses échanges et ses pièces jointes. */
export async function getQuestion(ctx: BridgeCtx, idOrRef: string, tx: Tx = db) {
  const l = await loadQuestion(ctx, idOrRef, tx, { allowDeleted: true });
  const [messages, files] = await Promise.all([
    tx.select().from(T.bridgeMessages).where(eq(T.bridgeMessages.questionId, l.q.id)).orderBy(asc(T.bridgeMessages.createdAt)),
    tx
      .select({
        id: T.bridgeFiles.id,
        name: T.bridgeFiles.name,
        mime: T.bridgeFiles.mime,
        size: T.bridgeFiles.size,
        messageId: T.bridgeFiles.messageId,
        uploadedById: T.bridgeFiles.uploadedById,
        uploadedByName: T.bridgeFiles.uploadedByName,
        createdAt: T.bridgeFiles.createdAt,
      })
      .from(T.bridgeFiles)
      .where(and(eq(T.bridgeFiles.questionId, l.q.id), isNotNull(T.bridgeFiles.attachedAt)))
      .orderBy(asc(T.bridgeFiles.createdAt)),
  ]);
  const role = roleOn(ctx, l.q, l.streamIds);
  const perms = questionPerms(ctx, l.q, l.streamIds, l.messageCount);
  const live = messages.filter((m) => !m.deletedAt);
  const lastMsg = live[live.length - 1];
  const canDeleteFile = (f: (typeof files)[number]) => {
    if (l.q.deletedAt) return false;
    if (role.su || role.providerAll) return true;
    if (f.uploadedById !== ctx.user.id) return false;
    if (!f.messageId) return perms.edit;
    const m = messages.find((x) => x.id === f.messageId);
    return !!m && canEditMessage(ctx, role, m);
  };
  return {
    ...listItem(ctx, l, {
      fileCount: files.length,
      lastMessage: lastMsg ? { party: lastMsg.party, authorName: lastMsg.authorName, createdAt: lastMsg.createdAt, excerpt: excerpt(lastMsg.body, 220), outcome: lastMsg.outcome, assignedAfter: lastMsg.assignedAfter } : null,
    }),
    messages: messages.map((m) => ({
      id: m.id,
      authorId: m.authorId,
      authorName: m.authorName,
      party: m.party,
      // un message supprimé garde sa place (et son issue) dans le fil, sans son texte
      body: m.deletedAt ? "" : m.body,
      outcome: m.outcome,
      assignedBefore: m.assignedBefore,
      assignedAfter: m.assignedAfter,
      editedAt: m.editedAt,
      deletedAt: m.deletedAt,
      deletedByName: m.deletedByName,
      source: m.source,
      createdAt: m.createdAt,
      perms: (() => {
        const ok = !l.q.deletedAt && canEditMessage(ctx, role, m);
        return { edit: ok, delete: ok };
      })(),
    })),
    files: files.map((f) => ({ ...f, perms: { delete: canDeleteFile(f) } })),
  };
}

export async function questionHistory(ctx: BridgeCtx, idOrRef: string) {
  const l = await loadQuestion(ctx, idOrRef, db, { allowDeleted: true });
  return db.select().from(T.bridgeEvents).where(eq(T.bridgeEvents.questionId, l.q.id)).orderBy(asc(T.bridgeEvents.createdAt));
}

/** Recherche insensible à la casse et aux accents dans les sujets, textes, échanges et noms de pièces jointes. */
export async function searchQuestions(ctx: BridgeCtx, q: string) {
  const text = q.trim();
  if (text.length < 2) return [];
  const pattern = `%${fold(text).replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const like = (c: AnyPgColumn): SQL => sql`translate(lower(${c}), 'àâäáãéèêëîïíìôöóòõùûüúçñœæ', 'aaaaaeeeeiiiiooooouuuucnoa') like ${pattern}`;
  const cid = ctx.client.id;
  const [a, b, c] = await Promise.all([
    db
      .select({ id: T.bridgeQuestions.id })
      .from(T.bridgeQuestions)
      .where(and(eq(T.bridgeQuestions.clientId, cid), or(like(T.bridgeQuestions.subject), like(T.bridgeQuestions.body), like(T.bridgeQuestions.askedByName)))),
    db
      .select({ id: T.bridgeMessages.questionId })
      .from(T.bridgeMessages)
      .where(and(eq(T.bridgeMessages.clientId, cid), isNull(T.bridgeMessages.deletedAt), or(like(T.bridgeMessages.body), like(T.bridgeMessages.authorName)))),
    db
      .select({ id: T.bridgeFiles.questionId })
      .from(T.bridgeFiles)
      .where(and(eq(T.bridgeFiles.clientId, cid), isNotNull(T.bridgeFiles.attachedAt), like(T.bridgeFiles.name))),
  ]);
  const ids = [...new Set([...a, ...b, ...c].map((r) => r.id).filter((x): x is string => !!x))];
  if (!ids.length) return [];
  // seules les questions visibles sont renvoyées
  const links = await db.select({ q: T.bridgeQuestionStreams.questionId, s: T.bridgeQuestionStreams.streamId }).from(T.bridgeQuestionStreams).where(inArray(T.bridgeQuestionStreams.questionId, ids));
  const streamsOf = new Map<string, string[]>();
  for (const l of links) streamsOf.set(l.q, [...(streamsOf.get(l.q) ?? []), l.s]);
  return ids.filter((id) => canSeeQuestion(ctx, streamsOf.get(id) ?? []));
}

// ---------------------------------------------------------------------------
// Écritures
// ---------------------------------------------------------------------------

const label = (ctx: BridgeCtx, p: Party | null | undefined) => partyLabel(ctx.client, p);
const streamNames = (ctx: BridgeCtx, ids: string[]) => sortStreams(ctx, ids).map((id) => ctx.streams.find((s) => s.id === id)?.name ?? "stream supprimé");
const actorOf = (ctx: BridgeCtx, party: Party): NoticeActor => ({ id: ctx.user.id, name: ctx.user.name, party });
/** Options internes d'écriture : origine de l'action (réponses importées depuis la fiche navette Excel). */
export interface WriteOpts {
  source?: "navette";
}
const via = (o: WriteOpts) => (o.source === "navette" ? " (fiche navette)" : "");

/** Texte enregistré dans le journal : au-delà de 4 000 caractères, la fin est coupée. */
const keep = (s: string | null) => (s && s.length > 4000 ? `${s.slice(0, 4000)}…` : s);

/** Rattache des pièces jointes en attente (déposées par l'utilisateur pendant la rédaction). */
async function attachPending(ctx: BridgeCtx, tx: Tx, fileIds: string[] | undefined, questionId: string, messageId: string | null) {
  const ids = [...new Set((fileIds ?? []).filter(isUuid))];
  if (!ids.length) return [];
  const rows = await tx
    .update(T.bridgeFiles)
    .set({ questionId, messageId, attachedAt: new Date() })
    .where(
      and(
        inArray(T.bridgeFiles.id, ids),
        eq(T.bridgeFiles.clientId, ctx.client.id),
        eq(T.bridgeFiles.uploadedById, ctx.user.id),
        isNull(T.bridgeFiles.attachedAt),
        or(isNull(T.bridgeFiles.questionId), eq(T.bridgeFiles.questionId, questionId)),
      ),
    )
    .returning({ id: T.bridgeFiles.id, name: T.bridgeFiles.name });
  if (rows.length !== ids.length) throw badRequest("Une pièce jointe est introuvable ou a expiré : déposez-la de nouveau.");
  return rows;
}

const createSchema = z.object({
  subject: z.string().trim().min(1, "Le sujet est obligatoire.").max(300, "Sujet trop long (300 caractères au plus)."),
  body: z.string().max(20000).default(""),
  streamIds: z.array(z.string()).min(1, "Choisissez au moins un stream.").max(30),
  askedByParty: zParty.optional(),
  assignedParty: zParty.optional(),
  dueDate: zDay.nullable().optional(),
  fileIds: z.array(z.string()).max(20).optional(),
});

export async function createQuestion(ctx: BridgeCtx, input: unknown) {
  const d = parse(createSchema, input);
  const streamIds = [...new Set(d.streamIds)];
  for (const s of streamIds) {
    const st = ctx.streams.find((x) => x.id === s);
    if (!st) throw badRequest("Stream inconnu pour ce client.");
    if (!st.active) throw badRequest(`Le stream ${st.name} n'est plus actif.`);
  }
  const creatable = creatableStreams(ctx);
  const possible = PARTIES.filter((p) => streamIds.every((s) => creatable[p].includes(s)));
  if (!possible.length) throw forbidden("Vous ne pouvez pas poser de question dans ces streams.");
  const party: Party = d.askedByParty ?? (possible.includes(ctx.side) ? ctx.side : possible[0]);
  if (!possible.includes(party)) throw forbidden(`Vous ne pouvez pas poser de question au nom de ${label(ctx, party)} dans ces streams.`);
  // le client pose ses questions à Wifirst ; Wifirst choisit à qui il attribue la sienne (au client par défaut)
  if (party === "CLIENT" && d.assignedParty === "CLIENT") throw badRequest(`Une question de ${label(ctx, "CLIENT")} est attribuée à ${label(ctx, "PROVIDER")}.`);
  const assigned: Party = party === "CLIENT" ? "PROVIDER" : (d.assignedParty ?? "CLIENT");
  const id = await db.transaction(async (tx) => {
    const [c] = await tx
      .update(T.bridgeClients)
      .set({ nextRef: sql`${T.bridgeClients.nextRef} + 1` })
      .where(eq(T.bridgeClients.id, ctx.client.id))
      .returning({ next: T.bridgeClients.nextRef });
    const [q] = await tx
      .insert(T.bridgeQuestions)
      .values({
        clientId: ctx.client.id,
        ref: c.next - 1,
        subject: d.subject,
        body: d.body,
        askedById: ctx.user.id,
        askedByName: ctx.user.name,
        askedByParty: party,
        assignedParty: assigned,
        status: "OPEN",
        dueDate: d.dueDate ?? null,
      })
      .returning();
    await tx.insert(T.bridgeQuestionStreams).values(streamIds.map((s) => ({ questionId: q.id, streamId: s })));
    const files = await attachPending(ctx, tx, d.fileIds, q.id, null);
    await bridgeEvent(
      ctx,
      q.id,
      "create",
      `Question posée par ${ctx.user.name} (${label(ctx, party)}), attribuée à ${label(ctx, assigned)}`,
      { subject: d.subject, body: keep(d.body), streams: streamNames(ctx, streamIds), assignedParty: assigned, dueDate: d.dueDate ?? null, files: files.map((f) => f.name) },
      party,
      tx,
    );
    return q.id;
  });
  emitBridgeNotice({ kind: "assigned", reason: "created", clientId: ctx.client.id, questionId: id, party: assigned, actor: actorOf(ctx, party) });
  return getQuestion(ctx, id);
}

const updateSchema = z.object({
  subject: z.string().trim().min(1, "Le sujet est obligatoire.").max(300, "Sujet trop long (300 caractères au plus).").optional(),
  body: z.string().max(20000).optional(),
  streamIds: z.array(z.string()).min(1, "Une question relève d'au moins un stream.").max(30).optional(),
  dueDate: zDay.nullable().optional(),
});

export async function updateQuestion(ctx: BridgeCtx, idOrRef: string, input: unknown) {
  const d = parse(updateSchema, input);
  const id = await db.transaction(async (tx) => {
    const l = await loadQuestion(ctx, idOrRef, tx, { forUpdate: true });
    const q = l.q;
    const perms = questionPerms(ctx, q, l.streamIds, l.messageCount);
    if (!perms.edit) throw forbidden("Vous ne pouvez pas modifier cette question.");
    const changes: Record<string, [unknown, unknown]> = {};
    const set: Partial<typeof T.bridgeQuestions.$inferInsert> = {};
    if (d.subject !== undefined && d.subject !== q.subject) {
      changes.subject = [q.subject, d.subject];
      set.subject = d.subject;
    }
    if (d.body !== undefined && d.body !== q.body) {
      changes.body = [keep(q.body), keep(d.body)];
      set.body = d.body;
    }
    if (d.dueDate !== undefined && (d.dueDate ?? null) !== q.dueDate) {
      changes.dueDate = [q.dueDate, d.dueDate ?? null];
      set.dueDate = d.dueDate ?? null;
    }
    let added: string[] = [];
    let removed: string[] = [];
    if (d.streamIds) {
      const next = [...new Set(d.streamIds)];
      added = next.filter((s) => !l.streamIds.includes(s));
      removed = l.streamIds.filter((s) => !next.includes(s));
      for (const s of [...added, ...removed]) {
        const st = ctx.streams.find((x) => x.id === s);
        if (!st) throw badRequest("Stream inconnu pour ce client.");
        if (!perms.streams.includes(s)) throw forbidden(`Vous ne pouvez pas modifier le stream ${st.name} de cette question.`);
        if (added.includes(s) && !st.active) throw badRequest(`Le stream ${st.name} n'est plus actif.`);
      }
      // l'utilisateur ne se retire pas lui-même l'accès à la question
      if (!ctx.user.isSuperAdmin && !next.some((s) => canSee(ctx.access(s)))) throw badRequest("Gardez au moins un stream auquel vous avez accès.");
      if (added.length || removed.length) changes.streams = [streamNames(ctx, l.streamIds), streamNames(ctx, next)];
    }
    if (!Object.keys(changes).length) return q.id;
    await tx
      .update(T.bridgeQuestions)
      .set({ ...set, lastActivityAt: new Date() })
      .where(eq(T.bridgeQuestions.id, q.id));
    if (removed.length) await tx.delete(T.bridgeQuestionStreams).where(and(eq(T.bridgeQuestionStreams.questionId, q.id), inArray(T.bridgeQuestionStreams.streamId, removed)));
    if (added.length) await tx.insert(T.bridgeQuestionStreams).values(added.map((s) => ({ questionId: q.id, streamId: s })));
    const what = Object.keys(changes).map((k) => ({ subject: "sujet", body: "texte de la question", dueDate: "échéance", streams: "streams" })[k] ?? k);
    await bridgeEvent(ctx, q.id, "update", `Question modifiée : ${what.join(", ")}`, changes, null, tx);
    return q.id;
  });
  return getQuestion(ctx, id);
}

export async function assignQuestion(ctx: BridgeCtx, idOrRef: string, input: unknown, opts: WriteOpts = {}) {
  const { party } = parse(z.object({ party: zParty }), input, "Organisation attendue.");
  let notice = false;
  const id = await db.transaction(async (tx) => {
    const l = await loadQuestion(ctx, idOrRef, tx, { forUpdate: true });
    const q = l.q;
    const perms = questionPerms(ctx, q, l.streamIds, l.messageCount);
    if (!perms.reassign) throw forbidden("Vous ne pouvez pas changer l'attribution de cette question.");
    if (party === q.assignedParty) return q.id;
    await tx.update(T.bridgeQuestions).set({ assignedParty: party, status: "OPEN", lastActivityAt: new Date() }).where(eq(T.bridgeQuestions.id, q.id));
    await bridgeEvent(ctx, q.id, "assign", `Attribuée à ${label(ctx, party)} (au lieu de ${label(ctx, q.assignedParty)})${via(opts)}`, { assignedParty: [q.assignedParty, party] }, null, tx);
    notice = true;
    return q.id;
  });
  if (notice) emitBridgeNotice({ kind: "assigned", reason: "reassigned", clientId: ctx.client.id, questionId: id, party, actor: actorOf(ctx, ctx.side) });
  return getQuestion(ctx, id);
}

export async function closeQuestion(ctx: BridgeCtx, idOrRef: string, opts: WriteOpts = {}) {
  let notice = false;
  const id = await db.transaction(async (tx) => {
    const l = await loadQuestion(ctx, idOrRef, tx, { forUpdate: true });
    const q = l.q;
    if (q.status === "CLOSED") return q.id;
    const perms = questionPerms(ctx, q, l.streamIds, l.messageCount);
    if (!perms.close) throw forbidden("Vous ne pouvez pas clôturer cette question.");
    const now = new Date();
    await tx
      .update(T.bridgeQuestions)
      .set({ status: "CLOSED", closedAt: now, closedById: ctx.user.id, closedByName: ctx.user.name, lastActivityAt: now })
      .where(eq(T.bridgeQuestions.id, q.id));
    await bridgeEvent(ctx, q.id, "close", `Question clôturée par ${ctx.user.name}${via(opts)}`, { status: [q.status, "CLOSED"] }, null, tx);
    notice = true;
    return q.id;
  });
  if (notice) emitBridgeNotice({ kind: "closed", clientId: ctx.client.id, questionId: id, actor: actorOf(ctx, ctx.side) });
  return getQuestion(ctx, id);
}

const reopenSchema = z.object({
  /** organisation à qui la question est attribuée après réouverture */
  party: zParty.optional(),
  /** organisation au nom de laquelle l'utilisateur rouvre */
  as: zParty.optional(),
  body: z.string().max(20000).default(""),
  fileIds: z.array(z.string()).max(20).optional(),
});

export async function reopenQuestion(ctx: BridgeCtx, idOrRef: string, input: unknown, opts: WriteOpts = {}) {
  const d = parse(reopenSchema, input ?? {});
  let target: Party = "PROVIDER";
  let acting: Party = "PROVIDER";
  const id = await db.transaction(async (tx) => {
    const l = await loadQuestion(ctx, idOrRef, tx, { forUpdate: true });
    const q = l.q;
    if (q.status !== "CLOSED") throw badRequest("Cette question n'est pas clôturée.");
    const perms = questionPerms(ctx, q, l.streamIds, l.messageCount);
    if (!perms.reopenAs.length) throw forbidden("Vous ne pouvez pas rouvrir cette question.");
    acting = d.as ?? (perms.reopenAs.includes(ctx.side) ? ctx.side : perms.reopenAs[0]);
    if (!perms.reopenAs.includes(acting)) throw forbidden(`Vous ne pouvez pas rouvrir cette question au nom de ${label(ctx, acting)}.`);
    target = d.party ?? other(acting);
    const now = new Date();
    await tx
      .update(T.bridgeQuestions)
      .set({ status: "OPEN", assignedParty: target, closedAt: null, closedById: null, closedByName: "", lastActivityAt: now })
      .where(eq(T.bridgeQuestions.id, q.id));
    let files: { name: string }[] = [];
    if (d.body.trim() || d.fileIds?.length) {
      const [m] = await tx
        .insert(T.bridgeMessages)
        .values({ clientId: ctx.client.id, questionId: q.id, authorId: ctx.user.id, authorName: ctx.user.name, party: acting, body: d.body, outcome: "REOPEN", assignedBefore: null, assignedAfter: target, source: opts.source ?? "" })
        .returning();
      files = await attachPending(ctx, tx, d.fileIds, q.id, m.id);
    }
    await bridgeEvent(
      ctx,
      q.id,
      "reopen",
      `Question rouverte par ${ctx.user.name} (${label(ctx, acting)}), attribuée à ${label(ctx, target)}${via(opts)}`,
      { status: ["CLOSED", "OPEN"], assignedParty: [q.assignedParty, target], ...(d.body.trim() ? { message: keep(d.body) } : {}), ...(files.length ? { files: files.map((f) => f.name) } : {}) },
      acting,
      tx,
    );
    return q.id;
  });
  emitBridgeNotice({ kind: "assigned", reason: "reopened", clientId: ctx.client.id, questionId: id, party: target, actor: actorOf(ctx, acting), message: d.body });
  return getQuestion(ctx, id);
}

const respondSchema = z.object({
  body: z.string().max(20000).default(""),
  /** organisation au nom de laquelle l'utilisateur répond */
  party: zParty.optional(),
  /** issue : attribuer à Wifirst, attribuer au client (l'une des deux conserve l'attribution) ou clôturer */
  outcome: z.enum(["PROVIDER", "CLIENT", "CLOSE"], { errorMap: () => ({ message: "Issue attendue : attribuer ou clôturer." }) }),
  fileIds: z.array(z.string()).max(20).optional(),
});

export async function respondQuestion(ctx: BridgeCtx, idOrRef: string, input: unknown, opts: WriteOpts = {}) {
  const d = parse(respondSchema, input);
  let party: Party = "PROVIDER";
  let notice: Parameters<typeof emitBridgeNotice>[0] | null = null;
  const id = await db.transaction(async (tx) => {
    const l = await loadQuestion(ctx, idOrRef, tx, { forUpdate: true });
    const q = l.q;
    if (q.status === "CLOSED") throw badRequest("Cette question est clôturée : rouvrez-la pour répondre.");
    const perms = questionPerms(ctx, q, l.streamIds, l.messageCount);
    if (!perms.respondAs.length) throw forbidden(`Cette question est attribuée à ${label(ctx, q.assignedParty)} : vous ne pouvez pas y répondre.`);
    party = d.party ?? (perms.respondAs.includes(ctx.side) ? ctx.side : perms.respondAs[0]);
    if (!perms.respondAs.includes(party)) throw forbidden(`Vous ne pouvez pas répondre au nom de ${label(ctx, party)} à cette question.`);
    if (!d.body.trim() && !d.fileIds?.length) throw badRequest("Écrivez une réponse ou joignez un fichier.");
    const before = q.assignedParty;
    const now = new Date();
    const closing = d.outcome === "CLOSE";
    const after: Party | null = closing ? null : (d.outcome as Party);
    const [m] = await tx
      .insert(T.bridgeMessages)
      .values({ clientId: ctx.client.id, questionId: q.id, authorId: ctx.user.id, authorName: ctx.user.name, party, body: d.body, outcome: closing ? "CLOSE" : "ASSIGN", assignedBefore: before, assignedAfter: after, source: opts.source ?? "" })
      .returning();
    const files = await attachPending(ctx, tx, d.fileIds, q.id, m.id);
    let summary: string;
    if (closing) {
      await tx.update(T.bridgeQuestions).set({ status: "CLOSED", closedAt: now, closedById: ctx.user.id, closedByName: ctx.user.name, lastActivityAt: now }).where(eq(T.bridgeQuestions.id, q.id));
      summary = `Réponse de ${label(ctx, party)} (${ctx.user.name}), question clôturée${via(opts)}`;
      notice = { kind: "closed", clientId: ctx.client.id, questionId: q.id, actor: actorOf(ctx, party), message: d.body };
    } else {
      // changement d'attribution : à traiter par l'autre ; réponse partielle de l'attributaire : en cours ; relance : statut inchangé
      const status = after !== before ? "OPEN" : party === before ? "IN_PROGRESS" : q.status;
      await tx.update(T.bridgeQuestions).set({ assignedParty: after!, status, lastActivityAt: now }).where(eq(T.bridgeQuestions.id, q.id));
      summary =
        after !== before
          ? `Réponse de ${label(ctx, party)} (${ctx.user.name}), attribuée à ${label(ctx, after)}${via(opts)}`
          : `Réponse de ${label(ctx, party)} (${ctx.user.name}), attribution conservée (${label(ctx, after)})${via(opts)}`;
      notice =
        after !== party
          ? { kind: "assigned", reason: "answer", clientId: ctx.client.id, questionId: q.id, party: after!, actor: actorOf(ctx, party), message: d.body }
          : { kind: "partial", clientId: ctx.client.id, questionId: q.id, actor: actorOf(ctx, party), message: d.body };
    }
    await bridgeEvent(
      ctx,
      q.id,
      "answer",
      summary,
      { message: keep(d.body), assignedParty: [before, after], ...(closing ? { status: [q.status, "CLOSED"] } : {}), ...(files.length ? { files: files.map((f) => f.name) } : {}) },
      party,
      tx,
    );
    return q.id;
  });
  if (notice) emitBridgeNotice(notice);
  return getQuestion(ctx, id);
}

export async function editMessage(ctx: BridgeCtx, messageId: string, input: unknown) {
  const { body } = parse(z.object({ body: z.string().max(20000) }), input, "Texte attendu.");
  if (!isUuid(messageId)) throw notFound("Message introuvable.");
  const id = await db.transaction(async (tx) => {
    const [m] = await tx
      .select()
      .from(T.bridgeMessages)
      .where(and(eq(T.bridgeMessages.id, messageId), eq(T.bridgeMessages.clientId, ctx.client.id)))
      .for("update");
    if (!m) throw notFound("Message introuvable.");
    if (m.deletedAt) throw notFound("Ce message a été supprimé.");
    const l = await loadQuestion(ctx, m.questionId, tx);
    const role = roleOn(ctx, l.q, l.streamIds);
    if (!canEditMessage(ctx, role, m)) throw forbidden("Vous ne pouvez pas modifier ce message.");
    if (body === m.body) return l.q.id;
    if (!body.trim()) {
      const [f] = await tx.select({ id: T.bridgeFiles.id }).from(T.bridgeFiles).where(eq(T.bridgeFiles.messageId, m.id)).limit(1);
      if (!f) throw badRequest("Un message sans pièce jointe ne peut pas être vide.");
    }
    await tx.update(T.bridgeMessages).set({ body, editedAt: new Date() }).where(eq(T.bridgeMessages.id, m.id));
    await tx.update(T.bridgeQuestions).set({ lastActivityAt: new Date() }).where(eq(T.bridgeQuestions.id, l.q.id));
    const when = m.createdAt.toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    await bridgeEvent(ctx, l.q.id, "message_edit", `Message de ${label(ctx, m.party)} (${m.authorName}) du ${when} modifié`, { message: [keep(m.body), keep(body)] }, null, tx);
    return l.q.id;
  });
  return getQuestion(ctx, id);
}

/**
 * Supprime un message : son texte et ses pièces jointes sont retirés du fil, où une mention « Réponse supprimée » reste
 * à sa place avec son issue. L'attribution et le statut de la question ne changent pas. Le texte reste à l'historique.
 */
export async function deleteMessage(ctx: BridgeCtx, messageId: string) {
  if (!isUuid(messageId)) throw notFound("Message introuvable.");
  const id = await db.transaction(async (tx) => {
    const [m] = await tx
      .select()
      .from(T.bridgeMessages)
      .where(and(eq(T.bridgeMessages.id, messageId), eq(T.bridgeMessages.clientId, ctx.client.id)))
      .for("update");
    if (!m) throw notFound("Message introuvable.");
    if (m.deletedAt) throw notFound("Ce message a déjà été supprimé.");
    const l = await loadQuestion(ctx, m.questionId, tx);
    const role = roleOn(ctx, l.q, l.streamIds);
    if (!canEditMessage(ctx, role, m)) throw forbidden("Vous ne pouvez pas supprimer ce message.");
    const now = new Date();
    const files = await tx.delete(T.bridgeFiles).where(eq(T.bridgeFiles.messageId, m.id)).returning({ name: T.bridgeFiles.name });
    await tx.update(T.bridgeMessages).set({ body: "", deletedAt: now, deletedByName: ctx.user.name }).where(eq(T.bridgeMessages.id, m.id));
    await tx.update(T.bridgeQuestions).set({ lastActivityAt: now }).where(eq(T.bridgeQuestions.id, l.q.id));
    const when = m.createdAt.toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    await bridgeEvent(
      ctx,
      l.q.id,
      "message_delete",
      `Message de ${label(ctx, m.party)} (${m.authorName}) du ${when} supprimé par ${ctx.user.name}`,
      { message: keep(m.body), ...(files.length ? { files: files.map((f) => f.name) } : {}) },
      null,
      tx,
    );
    return l.q.id;
  });
  return getQuestion(ctx, id);
}

export async function deleteQuestion(ctx: BridgeCtx, idOrRef: string) {
  await db.transaction(async (tx) => {
    const l = await loadQuestion(ctx, idOrRef, tx, { forUpdate: true });
    if (!questionPerms(ctx, l.q, l.streamIds, l.messageCount).delete) throw forbidden("Vous ne pouvez pas supprimer cette question.");
    await tx.update(T.bridgeQuestions).set({ deletedAt: new Date() }).where(eq(T.bridgeQuestions.id, l.q.id));
    await bridgeEvent(ctx, l.q.id, "delete", `Question supprimée par ${ctx.user.name}`, {}, null, tx);
  });
  return { ok: true };
}

export async function restoreQuestion(ctx: BridgeCtx, idOrRef: string) {
  if (!ctx.user.isSuperAdmin) throw forbidden("Réservé au super-administrateur.");
  const id = await db.transaction(async (tx) => {
    const l = await loadQuestion(ctx, idOrRef, tx, { forUpdate: true, allowDeleted: true });
    if (!l.q.deletedAt) return l.q.id;
    await tx.update(T.bridgeQuestions).set({ deletedAt: null }).where(eq(T.bridgeQuestions.id, l.q.id));
    await bridgeEvent(ctx, l.q.id, "restore", `Question restaurée par ${ctx.user.name}`, {}, null, tx);
    return l.q.id;
  });
  return getQuestion(ctx, id);
}

/** Questions et échanges visibles pour l'export Excel. */
export async function exportRows(ctx: BridgeCtx) {
  const list = await listQuestions(ctx);
  const ids = list.map((q) => q.id);
  const messages = ids.length
    ? await db
        .select()
        .from(T.bridgeMessages)
        .where(and(inArray(T.bridgeMessages.questionId, ids), isNull(T.bridgeMessages.deletedAt)))
        .orderBy(asc(T.bridgeMessages.createdAt))
    : [];
  return { list, messages };
}
