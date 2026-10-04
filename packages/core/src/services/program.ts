import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { db } from "../db.js";
import * as T from "../schema.js";
import { assertRole, badRequest, notFound, type Ctx } from "../context.js";
import { audit } from "../audit.js";

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

// ---------------------------------------------------------------------------
// Cartes
// ---------------------------------------------------------------------------

export async function listCards(ctx: Ctx, filter: { sprintId?: string; includeArchived?: boolean } = {}) {
  const conds = [eq(T.cards.accountId, ctx.accountId)];
  if (filter.sprintId && isUuid(filter.sprintId)) conds.push(eq(T.cards.sprintId, filter.sprintId));
  if (!filter.includeArchived) conds.push(eq(T.cards.archived, false));
  const rows = await db
    .select()
    .from(T.cards)
    .where(and(...conds))
    .orderBy(asc(T.cards.position), asc(T.cards.ref));
  const counts = await db
    .select({ entityId: T.comments.entityId, n: sql<number>`count(*)::int` })
    .from(T.comments)
    .where(and(eq(T.comments.accountId, ctx.accountId), eq(T.comments.entityType, "card")))
    .groupBy(T.comments.entityId);
  const cmap = new Map(counts.map((c) => [c.entityId, c.n]));
  return rows.map((r) => ({ ...r, commentCount: cmap.get(r.id) ?? 0 }));
}

async function cardOf(ctx: Ctx, id: unknown) {
  if (!isUuid(id)) return null;
  const [c] = await db
    .select()
    .from(T.cards)
    .where(and(eq(T.cards.id, id), eq(T.cards.accountId, ctx.accountId)));
  return c ?? null;
}

/** Déplacement d'une carte dans le kanban (colonne, couloir, position entre deux cartes). */
export async function moveCard(ctx: Ctx, cardId: string, input: unknown) {
  assertRole(ctx, "EDITOR");
  const p = z
    .object({
      statusId: z.string().nullable().optional(),
      streamId: z.string().nullable().optional(),
      beforeId: z.string().nullable().optional(),
      afterId: z.string().nullable().optional(),
    })
    .safeParse(input);
  if (!p.success) throw badRequest("Données invalides.");
  const card = await cardOf(ctx, cardId);
  if (!card) throw notFound("Carte introuvable.");
  const [before, after] = await Promise.all([cardOf(ctx, p.data.beforeId), cardOf(ctx, p.data.afterId)]);
  let position = card.position;
  if (before && after) position = (before.position + after.position) / 2;
  else if (before) position = before.position + 1;
  else if (after) position = after.position - 1;
  const data: Partial<typeof T.cards.$inferInsert> = { position, updatedById: ctx.user.id };
  const changes: Record<string, unknown> = {};
  for (const k of ["statusId", "streamId"] as const) {
    const v = p.data[k];
    if (v !== undefined && v !== card[k]) {
      if (v) {
        const t = k === "statusId" ? T.options : T.streams;
        const [ok] = isUuid(v) ? await db.select({ id: t.id }).from(t).where(and(eq(t.id, v), eq(t.accountId, ctx.accountId))) : [];
        if (!ok) throw badRequest(`Référence invalide : ${k}`);
      }
      data[k] = v;
      changes[k] = [card[k], v];
    }
  }
  const [row] = await db.update(T.cards).set(data).where(eq(T.cards.id, card.id)).returning();
  if (Object.keys(changes).length) await audit(ctx, "card", card.id, "move", `Carte déplacée : ${card.title}`, changes);
  return row;
}

/** Duplique une carte (sans ses commentaires) juste après l'originale. */
export async function duplicateCard(ctx: Ctx, cardId: string) {
  assertRole(ctx, "EDITOR");
  const card = await cardOf(ctx, cardId);
  if (!card) throw notFound("Carte introuvable.");
  const { createEntity } = await import("../entities.js");
  const [next] = await db
    .select({ position: T.cards.position })
    .from(T.cards)
    .where(and(eq(T.cards.accountId, ctx.accountId), sql`${T.cards.position} > ${card.position}`))
    .orderBy(asc(T.cards.position))
    .limit(1);
  return createEntity(ctx, "card", {
    title: `${card.title} (copie)`.slice(0, 300),
    emoji: card.emoji,
    description: card.description,
    progressNote: card.progressNote,
    nextSteps: card.nextSteps,
    alertsNote: card.alertsNote,
    startDate: card.startDate,
    dueDate: card.dueDate,
    progressPct: card.progressPct,
    streamId: card.streamId,
    sprintId: card.sprintId,
    statusId: card.statusId,
    alertLevelId: card.alertLevelId,
    ownerId: card.ownerId,
    position: next ? (card.position + next.position) / 2 : card.position + 1,
  });
}

/** Clôt un sprint, ouvre le suivant et y bascule les cartes non terminées. */
export async function switchSprint(ctx: Ctx, input: unknown) {
  assertRole(ctx, "ADMIN");
  const p = z.object({ fromSprintId: z.string().uuid(), toSprintId: z.string().uuid() }).safeParse(input);
  if (!p.success) throw badRequest("Données invalides.");
  const sps = await db
    .select()
    .from(T.sprints)
    .where(and(eq(T.sprints.accountId, ctx.accountId), inArray(T.sprints.id, [p.data.fromSprintId, p.data.toSprintId])));
  const from = sps.find((s) => s.id === p.data.fromSprintId);
  const to = sps.find((s) => s.id === p.data.toSprintId);
  if (!from || !to) throw notFound("Sprint introuvable.");
  const statuses = await db
    .select()
    .from(T.options)
    .where(and(eq(T.options.accountId, ctx.accountId), eq(T.options.kind, "CARD_STATUS")));
  const doneIds = statuses.filter((o) => (o.meta as { done?: boolean })?.done).map((o) => o.id);
  const moved = await db.transaction(async (tx) => {
    const res = await tx
      .update(T.cards)
      .set({ sprintId: to.id, updatedById: ctx.user.id })
      .where(
        and(
          eq(T.cards.accountId, ctx.accountId),
          eq(T.cards.sprintId, from.id),
          eq(T.cards.archived, false),
          doneIds.length ? or(isNull(T.cards.statusId), notInArray(T.cards.statusId, doneIds)) : undefined,
        ),
      )
      .returning({ id: T.cards.id });
    await tx.update(T.sprints).set({ state: "DONE" }).where(eq(T.sprints.id, from.id));
    await tx.update(T.sprints).set({ state: "CURRENT" }).where(eq(T.sprints.id, to.id));
    await audit(ctx, "sprint", to.id, "switch", `Bascule de ${from.name} vers ${to.name} : ${res.length} carte(s) reportée(s)`, {}, tx);
    return res.length;
  });
  return { moved };
}

// ---------------------------------------------------------------------------
// Séances
// ---------------------------------------------------------------------------

async function withChildren(meetingRows: (typeof T.meetings.$inferSelect)[]) {
  if (!meetingRows.length) return [];
  const ids = meetingRows.map((m) => m.id);
  const [hs, ss, ts] = await Promise.all([
    db.select().from(T.highlights).where(inArray(T.highlights.meetingId, ids)).orderBy(asc(T.highlights.order), asc(T.highlights.createdAt)),
    db.select().from(T.streamStatuses).where(inArray(T.streamStatuses.meetingId, ids)).orderBy(asc(T.streamStatuses.order), asc(T.streamStatuses.createdAt)),
    db.select().from(T.topics).where(inArray(T.topics.meetingId, ids)).orderBy(asc(T.topics.order), asc(T.topics.createdAt)),
  ]);
  return meetingRows.map((m) => ({
    ...m,
    highlights: hs.filter((h) => h.meetingId === m.id),
    statuses: ss.filter((s) => s.meetingId === m.id),
    topics: ts.filter((t) => t.meetingId === m.id),
  }));
}

export async function listMeetings(ctx: Ctx, meetingTypeId: string) {
  if (!isUuid(meetingTypeId)) throw notFound("Type de séance introuvable.");
  const rows = await db
    .select()
    .from(T.meetings)
    .where(and(eq(T.meetings.accountId, ctx.accountId), eq(T.meetings.meetingTypeId, meetingTypeId)))
    .orderBy(desc(T.meetings.date));
  return withChildren(rows);
}

export async function getMeeting(ctx: Ctx, meetingId: string) {
  if (!isUuid(meetingId)) throw notFound("Séance introuvable.");
  const rows = await db
    .select()
    .from(T.meetings)
    .where(and(eq(T.meetings.id, meetingId), eq(T.meetings.accountId, ctx.accountId)));
  if (!rows.length) throw notFound("Séance introuvable.");
  const [m] = await withChildren(rows);
  const [type] = await db.select().from(T.meetingTypes).where(eq(T.meetingTypes.id, m.meetingTypeId));
  return { ...m, meetingType: type };
}

/** Retire d'un texte d'arbitrage les lignes de décision (« Décision : … » et tout ce qui suit). */
export function stripDecisions(text: string): string {
  const lines = text.split("\n");
  const idx = lines.findIndex((l) => /^\s*(\*\*)?\s*d[ée]cisions?(\s+prises?)?\s*(\*\*)?\s*:/i.test(l));
  if (idx === -1) return text;
  return lines.slice(0, idx).join("\n").replace(/\s+$/, "");
}

export const meetingCreateSchema = z.object({
  meetingTypeId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(["empty", "previous"]).default("empty"),
});

/** Crée une séance vide (avec les lignes de streams par défaut) ou à partir de la séance précédente. */
export async function createMeeting(ctx: Ctx, input: unknown) {
  assertRole(ctx, "EDITOR");
  const p = meetingCreateSchema.safeParse(input);
  if (!p.success) throw badRequest("Données invalides.", p.error.flatten());
  const [type] = await db
    .select()
    .from(T.meetingTypes)
    .where(and(eq(T.meetingTypes.id, p.data.meetingTypeId), eq(T.meetingTypes.accountId, ctx.accountId)));
  if (!type) throw notFound("Type de séance introuvable.");
  const date = p.data.date;
  const [exists] = await db
    .select({ id: T.meetings.id })
    .from(T.meetings)
    .where(and(eq(T.meetings.accountId, ctx.accountId), eq(T.meetings.meetingTypeId, type.id), eq(T.meetings.date, date)));
  if (exists) throw badRequest(`Une séance ${type.name} existe déjà à cette date.`);

  let previous: Awaited<ReturnType<typeof withChildren>>[number] | null = null;
  if (p.data.mode === "previous") {
    const prevRows = await db
      .select()
      .from(T.meetings)
      .where(and(eq(T.meetings.accountId, ctx.accountId), eq(T.meetings.meetingTypeId, type.id), lt(T.meetings.date, date)))
      .orderBy(desc(T.meetings.date))
      .limit(1);
    if (!prevRows.length) throw badRequest("Aucune séance antérieure à recopier.");
    [previous] = await withChildren(prevRows);
  }
  const blocks = type.blocks ?? [];

  const meetingId = await db.transaction(async (tx) => {
    const [m] = await tx.insert(T.meetings).values({ accountId: ctx.accountId, meetingTypeId: type.id, date }).returning();
    const base = { accountId: ctx.accountId, meetingId: m.id };
    if (previous) {
      if (blocks.includes("HIGHLIGHTS") && previous.highlights.length) {
        await tx.insert(T.highlights).values(
          previous.highlights.map((h) => ({ ...base, title: h.title, emoji: h.emoji, detail: h.detail, streamId: h.streamId, typeId: h.typeId, authorId: h.authorId, order: h.order })),
        );
      }
      const st = previous.statuses.filter((s) => s.streamId || s.progress || s.alerts);
      if (blocks.includes("STREAM_STATUS") && st.length) {
        await tx.insert(T.streamStatuses).values(
          st.map((s) => ({ ...base, streamId: s.streamId, statusIds: s.statusIds, progress: s.progress, alerts: s.alerts, order: s.order })),
        );
      }
      if (blocks.includes("TOPICS") && previous.topics.length) {
        await tx.insert(T.topics).values(
          previous.topics.map((t) => ({
            ...base,
            title: t.title,
            emoji: t.emoji,
            themeId: t.themeId,
            natureId: t.natureId,
            description: t.description,
            decisionRequest: stripDecisions(t.decisionRequest),
            order: t.order,
          })),
        );
      }
    } else if (blocks.includes("STREAM_STATUS")) {
      const strs = await tx
        .select()
        .from(T.streams)
        .where(and(eq(T.streams.accountId, ctx.accountId), eq(T.streams.active, true), eq(T.streams.inStatusTemplate, true)))
        .orderBy(asc(T.streams.order), asc(T.streams.name));
      if (strs.length) {
        await tx.insert(T.streamStatuses).values(strs.map((s, i) => ({ ...base, streamId: s.id, statusIds: [], order: s.order || i + 1 })));
      }
    }
    await audit(ctx, "meeting", m.id, "create", `Séance ${type.name} du ${date} créée${previous ? ` à partir du ${previous.date}` : ""}`, {}, tx);
    return m.id;
  });
  return getMeeting(ctx, meetingId);
}

// ---------------------------------------------------------------------------
// Commentaires et journal
// ---------------------------------------------------------------------------

const COMMENTABLE: Record<string, typeof T.cards | typeof T.risks | typeof T.topics | typeof T.highlights | typeof T.streamStatuses> = {
  card: T.cards,
  risk: T.risks,
  topic: T.topics,
  highlight: T.highlights,
  streamStatus: T.streamStatuses,
};

export async function listComments(ctx: Ctx, entityType: string, entityId: string) {
  if (!COMMENTABLE[entityType]) throw badRequest("Commentaires non disponibles pour cet élément.");
  if (!isUuid(entityId)) throw notFound();
  return db
    .select({
      id: T.comments.id,
      body: T.comments.body,
      createdAt: T.comments.createdAt,
      authorId: T.comments.authorId,
      authorName: T.users.name,
    })
    .from(T.comments)
    .leftJoin(T.users, eq(T.users.id, T.comments.authorId))
    .where(and(eq(T.comments.accountId, ctx.accountId), eq(T.comments.entityType, entityType), eq(T.comments.entityId, entityId)))
    .orderBy(asc(T.comments.createdAt));
}

export async function addComment(ctx: Ctx, entityType: string, entityId: string, body: string) {
  assertRole(ctx, "VIEWER");
  const t = COMMENTABLE[entityType];
  if (!t) throw badRequest("Commentaires non disponibles pour cet élément.");
  const text = (body ?? "").trim();
  if (!text) throw badRequest("Commentaire vide.");
  if (text.length > 10000) throw badRequest("Commentaire trop long.");
  if (!isUuid(entityId)) throw notFound();
  const [target] = await db.select({ id: t.id }).from(t).where(and(eq(t.id, entityId), eq(t.accountId, ctx.accountId)));
  if (!target) throw notFound();
  const [c] = await db.insert(T.comments).values({ accountId: ctx.accountId, entityType, entityId, authorId: ctx.user.id, body: text }).returning();
  await audit(ctx, entityType, entityId, "comment", `Commentaire de ${ctx.user.name}`);
  return { ...c, authorName: ctx.user.name };
}

export async function deleteComment(ctx: Ctx, commentId: string) {
  if (!isUuid(commentId)) throw notFound();
  const [c] = await db
    .select()
    .from(T.comments)
    .where(and(eq(T.comments.id, commentId), eq(T.comments.accountId, ctx.accountId)));
  if (!c) throw notFound();
  if (c.authorId !== ctx.user.id) assertRole(ctx, "ADMIN");
  await db.delete(T.comments).where(eq(T.comments.id, c.id));
  return { ok: true };
}

export async function listAudit(ctx: Ctx, filter: { entityType?: string; entityId?: string; limit?: number }) {
  const conds = [eq(T.auditLogs.accountId, ctx.accountId)];
  if (filter.entityType) conds.push(eq(T.auditLogs.entityType, filter.entityType));
  if (filter.entityId && isUuid(filter.entityId)) conds.push(eq(T.auditLogs.entityId, filter.entityId));
  return db
    .select()
    .from(T.auditLogs)
    .where(and(...conds))
    .orderBy(desc(T.auditLogs.createdAt))
    .limit(Math.min(filter.limit ?? 100, 500));
}
