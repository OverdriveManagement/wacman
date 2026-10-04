import { and, asc, desc, eq, gte, inArray, lt, lte, ne, sql } from "drizzle-orm";
import { db } from "../db.js";
import * as T from "../schema.js";
import { badRequest, isUuid, notFound, type Ctx } from "../context.js";

/**
 * Vues de synthèse calculées côté serveur :
 * - ce qui a changé depuis la séance précédente (préparation d'une séance) ;
 * - la revue d'un stream (point hebdomadaire avec le stream leader) ;
 * - le bilan d'un sprint (à la bascule).
 */

type Change = [unknown, unknown];
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
/** Début de journée à Paris d'une date AAAA-MM-JJ, en instant SQL. */
const parisStart = (d: string) => sql`((${d}::date)::timestamp at time zone 'Europe/Paris')`;

async function doneStatusIds(accountId: string) {
  const rows = await db.select().from(T.options).where(and(eq(T.options.accountId, accountId), eq(T.options.kind, "CARD_STATUS")));
  return new Set(rows.filter((o) => (o.meta as { done?: boolean })?.done).map((o) => o.id));
}

const cardLite = (c: typeof T.cards.$inferSelect) => ({
  id: c.id,
  ref: c.ref,
  title: c.title,
  emoji: c.emoji,
  streamId: c.streamId,
  sprintId: c.sprintId,
  statusId: c.statusId,
  alertLevelId: c.alertLevelId,
  ownerId: c.ownerId,
  dueDate: c.dueDate,
  alertsNote: c.alertsNote,
  progressNote: c.progressNote,
  nextSteps: c.nextSteps,
  contentUpdatedAt: c.contentUpdatedAt.toISOString(),
});

// ---------------------------------------------------------------------------
// Quoi de neuf depuis la séance précédente
// ---------------------------------------------------------------------------

export async function meetingChanges(ctx: Ctx, meetingId: string) {
  if (!isUuid(meetingId)) throw notFound("Séance introuvable.");
  const [m] = await db.select().from(T.meetings).where(and(eq(T.meetings.id, meetingId), eq(T.meetings.accountId, ctx.accountId)));
  if (!m) throw notFound("Séance introuvable.");
  const [prev] = await db
    .select()
    .from(T.meetings)
    .where(and(eq(T.meetings.accountId, ctx.accountId), eq(T.meetings.meetingTypeId, m.meetingTypeId), lt(T.meetings.date, m.date)))
    .orderBy(desc(T.meetings.date))
    .limit(1);
  const since = prev?.date ?? addDays(m.date, -7);
  const until = m.date;
  const inRange = and(gte(T.auditLogs.createdAt, parisStart(since)), lt(T.auditLogs.createdAt, parisStart(addDays(until, 1))));

  const [logs, cards, done, actions, decisions, prevStatuses, curStatuses] = await Promise.all([
    db
      .select()
      .from(T.auditLogs)
      .where(and(eq(T.auditLogs.accountId, ctx.accountId), inRange))
      .orderBy(asc(T.auditLogs.createdAt)),
    db.select().from(T.cards).where(eq(T.cards.accountId, ctx.accountId)),
    doneStatusIds(ctx.accountId),
    db.select().from(T.actions).where(and(eq(T.actions.accountId, ctx.accountId), eq(T.actions.meetingTypeId, m.meetingTypeId))),
    db.select().from(T.decisions).where(eq(T.decisions.accountId, ctx.accountId)),
    prev ? db.select().from(T.streamStatuses).where(eq(T.streamStatuses.meetingId, prev.id)) : Promise.resolve([]),
    db.select().from(T.streamStatuses).where(eq(T.streamStatuses.meetingId, m.id)),
  ]);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const lite = (id: string) => {
    const c = byId.get(id);
    return c && !c.archived ? cardLite(c) : null;
  };
  const sets = { created: new Set<string>(), done: new Set<string>(), moved: new Set<string>(), alertUp: new Set<string>(), alertDown: new Set<string>(), due: new Map<string, Change>(), updated: new Set<string>() };
  const deleted: { id: string; summary: string }[] = [];
  let switches: { summary: string; at: string }[] = [];
  for (const l of logs) {
    if (l.entityType === "sprint" && l.action === "switch") switches.push({ summary: l.summary, at: l.createdAt.toISOString() });
    if (l.entityType !== "card") continue;
    const ch = (l.changes ?? {}) as Record<string, Change>;
    if (l.action === "create") sets.created.add(l.entityId);
    else if (l.action === "delete") deleted.push({ id: l.entityId, summary: l.summary });
    else if (l.action === "update" || l.action === "move") {
      if (ch.statusId) {
        const [from, to] = ch.statusId as [string | null, string | null];
        if (to && done.has(to) && !(from && done.has(from))) sets.done.add(l.entityId);
        else sets.moved.add(l.entityId);
      }
      if (ch.alertLevelId) {
        if (ch.alertLevelId[1]) sets.alertUp.add(l.entityId);
        else sets.alertDown.add(l.entityId);
      }
      if (ch.dueDate) {
        const first = sets.due.get(l.entityId)?.[0];
        sets.due.set(l.entityId, [first !== undefined ? first : ch.dueDate[0], ch.dueDate[1]]);
      }
      const content = Object.keys(ch).some((k) => !["position", "archived", "contentUpdatedAt"].includes(k));
      if (content) sets.updated.add(l.entityId);
    }
  }
  // une carte créée puis terminée n'apparaît qu'une fois, dans la rubrique la plus parlante
  for (const id of sets.done) sets.moved.delete(id);
  for (const id of sets.created) sets.updated.delete(id);
  const list = (s: Set<string>) => [...s].map(lite).filter((x): x is NonNullable<typeof x> => !!x);
  const prevBy = new Map(prevStatuses.map((r) => [r.streamId ?? "", r]));
  const streamChanges = curStatuses
    .filter((r) => r.streamId)
    .map((r) => {
      const p = prevBy.get(r.streamId ?? "");
      const before = p?.statusIds ?? [];
      const statusChanged = JSON.stringify([...before].sort()) !== JSON.stringify([...r.statusIds].sort());
      const textChanged = !!p && (p.progress !== r.progress || p.alerts !== r.alerts);
      return { streamId: r.streamId, before, after: r.statusIds, statusChanged, textChanged, isNew: !p };
    })
    .filter((x) => x.statusChanged || x.textChanged || x.isNew);
  const inDays = (d: string | null | undefined) => !!d && d >= since && d <= until;
  const day = (t: Date | null) => (t ? t.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }) : null);
  switches = switches.slice(-3);
  return {
    since,
    until,
    previousMeetingId: prev?.id ?? null,
    cards: {
      created: list(sets.created),
      done: list(sets.done),
      moved: list(sets.moved),
      alertUp: list(sets.alertUp),
      alertDown: list(sets.alertDown),
      due: [...sets.due.entries()].map(([id, [from, to]]) => ({ card: lite(id), from, to })).filter((x) => x.card && x.from !== x.to),
      updated: list(sets.updated).length,
      deleted,
    },
    streams: streamChanges,
    actions: {
      created: actions.filter((a) => inDays(day(a.createdAt))).map((a) => ({ id: a.id, title: a.title, party: a.party, streamId: a.streamId, status: a.status })),
      closed: actions.filter((a) => a.closedAt && inDays(day(a.closedAt))).map((a) => ({ id: a.id, title: a.title, party: a.party, streamId: a.streamId, status: a.status })),
    },
    decisions: decisions
      .filter((d) => (d.status === "TAKEN" && inDays(d.decidedOn)) || (d.status === "PENDING" && inDays(day(d.createdAt))))
      .map((d) => ({ id: d.id, title: d.title, status: d.status, decidedOn: d.decidedOn, meetingTypeId: d.meetingTypeId, streamId: d.streamId })),
    sprintSwitches: switches,
  };
}

// ---------------------------------------------------------------------------
// Revue d'un stream
// ---------------------------------------------------------------------------

export async function streamReview(ctx: Ctx, streamId: string) {
  if (!isUuid(streamId)) throw notFound("Stream introuvable.");
  const [stream] = await db.select().from(T.streams).where(and(eq(T.streams.id, streamId), eq(T.streams.accountId, ctx.accountId)));
  if (!stream) throw notFound("Stream introuvable.");
  const since14 = addDays(today(), -14);
  const since30 = addDays(today(), -30);
  const [cards, statusRows, highlights, actions, decisions, risks, closedRisk] = await Promise.all([
    db
      .select()
      .from(T.cards)
      .where(and(eq(T.cards.accountId, ctx.accountId), eq(T.cards.streamId, streamId), eq(T.cards.archived, false)))
      .orderBy(asc(T.cards.position)),
    db
      .select({ row: T.streamStatuses, date: T.meetings.date, typeId: T.meetings.meetingTypeId, meetingId: T.meetings.id })
      .from(T.streamStatuses)
      .innerJoin(T.meetings, eq(T.meetings.id, T.streamStatuses.meetingId))
      .where(and(eq(T.streamStatuses.accountId, ctx.accountId), eq(T.streamStatuses.streamId, streamId)))
      .orderBy(desc(T.meetings.date))
      .limit(2),
    db
      .select({ h: T.highlights, date: T.meetings.date, typeId: T.meetings.meetingTypeId })
      .from(T.highlights)
      .innerJoin(T.meetings, eq(T.meetings.id, T.highlights.meetingId))
      .where(and(eq(T.highlights.accountId, ctx.accountId), eq(T.highlights.streamId, streamId)))
      .orderBy(desc(T.meetings.date))
      .limit(6),
    db.select().from(T.actions).where(and(eq(T.actions.accountId, ctx.accountId), eq(T.actions.streamId, streamId))),
    db.select().from(T.decisions).where(and(eq(T.decisions.accountId, ctx.accountId), eq(T.decisions.streamId, streamId))),
    db.select().from(T.risks).where(and(eq(T.risks.accountId, ctx.accountId), eq(T.risks.streamId, streamId))),
    db.select().from(T.options).where(and(eq(T.options.accountId, ctx.accountId), eq(T.options.kind, "RISK_STATUS"))),
  ]);
  const closed = new Set(closedRisk.filter((o) => (o.meta as { closed?: boolean })?.closed).map((o) => o.id));
  const cardIds = cards.map((c) => c.id);
  const activity = cardIds.length
    ? await db
        .select({ id: T.auditLogs.id, entityId: T.auditLogs.entityId, action: T.auditLogs.action, summary: T.auditLogs.summary, userName: T.auditLogs.userName, createdAt: T.auditLogs.createdAt })
        .from(T.auditLogs)
        .where(and(eq(T.auditLogs.accountId, ctx.accountId), eq(T.auditLogs.entityType, "card"), inArray(T.auditLogs.entityId, cardIds), gte(T.auditLogs.createdAt, parisStart(since14))))
        .orderBy(desc(T.auditLogs.createdAt))
        .limit(25)
    : [];
  const day = (t: Date | null) => (t ? t.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }) : "");
  return {
    stream,
    cards: cards.map(cardLite),
    status: statusRows[0] ? { ...statusRows[0].row, date: statusRows[0].date, meetingTypeId: statusRows[0].typeId, meetingId: statusRows[0].meetingId } : null,
    previousStatus: statusRows[1] ? { ...statusRows[1].row, date: statusRows[1].date } : null,
    highlights: highlights.map((x) => ({ ...x.h, date: x.date, meetingTypeId: x.typeId })),
    actions: actions.filter((a) => a.status === "OPEN" || (a.closedAt && day(a.closedAt) >= since14)),
    decisions: decisions.filter((d) => d.status === "PENDING" || (d.decidedOn && d.decidedOn >= since30)),
    risks: risks.filter((r) => !(r.statusId && closed.has(r.statusId))),
    activity,
  };
}

// ---------------------------------------------------------------------------
// Bilan d'un sprint
// ---------------------------------------------------------------------------

export async function sprintReview(ctx: Ctx, sprintId: string) {
  if (!isUuid(sprintId)) throw notFound("Sprint introuvable.");
  const [sprint] = await db.select().from(T.sprints).where(and(eq(T.sprints.id, sprintId), eq(T.sprints.accountId, ctx.accountId)));
  if (!sprint) throw notFound("Sprint introuvable.");
  const done = await doneStatusIds(ctx.accountId);
  const [inSprint, switchLog, allCards] = await Promise.all([
    db.select().from(T.cards).where(and(eq(T.cards.accountId, ctx.accountId), eq(T.cards.sprintId, sprintId), eq(T.cards.archived, false))),
    db
      .select()
      .from(T.auditLogs)
      .where(and(eq(T.auditLogs.accountId, ctx.accountId), eq(T.auditLogs.entityType, "sprint"), eq(T.auditLogs.action, "switch"), sql`${T.auditLogs.changes}->>'from' = ${sprintId}`))
      .orderBy(desc(T.auditLogs.createdAt))
      .limit(1),
    db.select().from(T.cards).where(eq(T.cards.accountId, ctx.accountId)),
  ]);
  const sw = switchLog[0];
  const movedIds = new Set(((sw?.changes as { moved?: string[] })?.moved ?? []) as string[]);
  const byId = new Map(allCards.map((c) => [c.id, c]));
  const carried = sprint.state === "DONE" ? [...movedIds].map((id) => byId.get(id)).filter((c): c is NonNullable<typeof c> => !!c) : inSprint.filter((c) => !(c.statusId && done.has(c.statusId)));
  const finished = inSprint.filter((c) => c.statusId && done.has(c.statusId));
  const scope = sprint.state === "DONE" ? [...inSprint, ...carried.filter((c) => !inSprint.some((x) => x.id === c.id))] : inSprint;
  const alerts = scope.filter((c) => c.alertLevelId && !(c.statusId && done.has(c.statusId)));
  const from = sprint.startDate ?? "0000-01-01";
  const to = sw ? sw.createdAt.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }) : (sprint.endDate ?? today());
  const [decisions, actions, highlights] = await Promise.all([
    db
      .select()
      .from(T.decisions)
      .where(and(eq(T.decisions.accountId, ctx.accountId), eq(T.decisions.status, "TAKEN"), gte(T.decisions.decidedOn, from), lte(T.decisions.decidedOn, to)))
      .orderBy(asc(T.decisions.decidedOn)),
    db.select().from(T.actions).where(and(eq(T.actions.accountId, ctx.accountId), ne(T.actions.status, "CANCELLED"))),
    db
      .select({ h: T.highlights, date: T.meetings.date })
      .from(T.highlights)
      .innerJoin(T.meetings, eq(T.meetings.id, T.highlights.meetingId))
      .where(and(eq(T.highlights.accountId, ctx.accountId), gte(T.meetings.date, from), lte(T.meetings.date, to)))
      .orderBy(desc(T.meetings.date))
      .limit(12),
  ]);
  const day = (t: Date | null) => (t ? t.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }) : "");
  const sprints = await db.select().from(T.sprints).where(eq(T.sprints.accountId, ctx.accountId)).orderBy(asc(T.sprints.order));
  const i = sprints.findIndex((s) => s.id === sprint.id);
  return {
    sprint,
    next: sprints[i + 1] ?? null,
    switchedAt: sw ? sw.createdAt.toISOString() : null,
    period: { from, to },
    stats: { total: scope.length, done: finished.length, carried: carried.length, alerts: alerts.length },
    done: finished.map(cardLite),
    carried: carried.map(cardLite),
    alerts: alerts.map(cardLite),
    decisions,
    actionsClosed: actions.filter((a) => a.closedAt && day(a.closedAt) >= from && day(a.closedAt) <= to),
    actionsOpen: actions.filter((a) => a.status === "OPEN"),
    highlights: highlights.map((x) => ({ ...x.h, date: x.date })),
  };
}

/** Garde-fou partagé : vérifie qu'une séance donnée appartient au compte et renvoie son type. */
export async function meetingWithType(ctx: Ctx, meetingId: string) {
  if (!isUuid(meetingId)) throw notFound("Séance introuvable.");
  const [row] = await db
    .select({ m: T.meetings, t: T.meetingTypes })
    .from(T.meetings)
    .innerJoin(T.meetingTypes, eq(T.meetingTypes.id, T.meetings.meetingTypeId))
    .where(and(eq(T.meetings.id, meetingId), eq(T.meetings.accountId, ctx.accountId)));
  if (!row) throw notFound("Séance introuvable.");
  if (!row.t) throw badRequest("Type de séance introuvable.");
  return row;
}
