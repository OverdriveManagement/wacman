import { and, desc, eq, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "../db.js";
import * as T from "../schema.js";
import type { Ctx } from "../context.js";

/** Date du jour à Paris (AAAA-MM-JJ). */
export function parisToday(): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86_400_000);

// ---------------------------------------------------------------------------
// Tableau de bord
// ---------------------------------------------------------------------------

export async function getDashboard(ctx: Ctx, today = parisToday()) {
  const acc = ctx.accountId;
  const [options, streams, sprints, cards, risks, contacts, meetingTypes, meetings, activity] = await Promise.all([
    db.select().from(T.options).where(eq(T.options.accountId, acc)),
    db.select().from(T.streams).where(eq(T.streams.accountId, acc)),
    db.select().from(T.sprints).where(eq(T.sprints.accountId, acc)),
    db.select().from(T.cards).where(and(eq(T.cards.accountId, acc), eq(T.cards.archived, false))),
    db.select().from(T.risks).where(eq(T.risks.accountId, acc)),
    db.select().from(T.contacts).where(eq(T.contacts.accountId, acc)),
    db.select().from(T.meetingTypes).where(eq(T.meetingTypes.accountId, acc)),
    db.select({ id: T.meetings.id, meetingTypeId: T.meetings.meetingTypeId, date: T.meetings.date }).from(T.meetings).where(eq(T.meetings.accountId, acc)),
    db
      .select({ id: T.auditLogs.id, entityType: T.auditLogs.entityType, entityId: T.auditLogs.entityId, action: T.auditLogs.action, summary: T.auditLogs.summary, userName: T.auditLogs.userName, viaAssistant: T.auditLogs.viaAssistant, createdAt: T.auditLogs.createdAt })
      .from(T.auditLogs)
      .where(eq(T.auditLogs.accountId, acc))
      .orderBy(desc(T.auditLogs.createdAt))
      .limit(12),
  ]);

  const byKind = (k: string) => options.filter((o) => o.kind === k).sort((a, b) => a.order - b.order);
  const statuses = byKind("CARD_STATUS");
  const doneIds = new Set(statuses.filter((o) => (o.meta as { done?: boolean })?.done).map((o) => o.id));
  const isDone = (c: { statusId: string | null }) => !!c.statusId && doneIds.has(c.statusId);
  const closedRisk = new Set(byKind("RISK_STATUS").filter((o) => (o.meta as { closed?: boolean })?.closed).map((o) => o.id));

  const sorted = [...sprints].sort((a, b) => a.order - b.order || String(a.startDate).localeCompare(String(b.startDate)));
  const sprint = sorted.find((s) => s.state === "CURRENT") ?? sorted.find((s) => s.state === "UPCOMING") ?? null;
  const sprintCards = sprint ? cards.filter((c) => c.sprintId === sprint.id) : cards;
  const open = cards.filter((c) => !isDone(c));
  const compact = (c: (typeof cards)[number]) => ({ id: c.id, ref: c.ref, title: c.title, emoji: c.emoji, dueDate: c.dueDate, ownerId: c.ownerId, streamId: c.streamId, statusId: c.statusId, alertLevelId: c.alertLevelId });

  let timeline: { daysTotal: number; daysElapsed: number; daysLeft: number } | null = null;
  if (sprint?.startDate && sprint?.endDate) {
    const total = Math.max(1, daysBetween(sprint.startDate, sprint.endDate) + 1);
    const elapsed = Math.min(total, Math.max(0, daysBetween(sprint.startDate, today) + 1));
    timeline = { daysTotal: total, daysElapsed: elapsed, daysLeft: Math.max(0, daysBetween(today, sprint.endDate)) };
  }

  const myContactIds = new Set(contacts.filter((c) => c.userId === ctx.user.id).map((c) => c.id));
  const soon = addDays(today, 14);
  const openRisks = risks.filter((r) => !(r.statusId && closedRisk.has(r.statusId)));

  const lanes = streams.filter((s) => s.active && s.inKanban).sort((a, b) => a.order - b.order);
  return {
    today,
    sprint: sprint
      ? {
          id: sprint.id,
          name: sprint.name,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          objective: sprint.objective,
          clientMilestone: sprint.clientMilestone,
          timeline,
          total: sprintCards.length,
          done: sprintCards.filter(isDone).length,
          byStatus: [
            ...statuses.map((s) => ({ id: s.id as string | null, count: sprintCards.filter((c) => c.statusId === s.id).length })),
            { id: null, count: sprintCards.filter((c) => !c.statusId || !statuses.some((s) => s.id === c.statusId)).length },
          ].filter((x) => x.id || x.count),
          byStream: lanes.map((s) => {
            const list = sprintCards.filter((c) => c.streamId === s.id);
            return { id: s.id, total: list.length, done: list.filter(isDone).length, alerts: list.filter((c) => c.alertLevelId && !isDone(c)).length };
          }),
        }
      : null,
    alerts: byKind("ALERT_LEVEL").map((l) => ({ id: l.id, count: open.filter((c) => c.alertLevelId === l.id).length })),
    overdue: open
      .filter((c) => c.dueDate && c.dueDate < today)
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
      .slice(0, 12)
      .map(compact),
    overdueCount: open.filter((c) => c.dueDate && c.dueDate < today).length,
    dueSoon: open
      .filter((c) => c.dueDate && c.dueDate >= today && c.dueDate <= soon)
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
      .slice(0, 12)
      .map(compact),
    mine: myContactIds.size ? open.filter((c) => c.ownerId && myContactIds.has(c.ownerId)).map(compact) : null,
    risks: {
      open: openRisks.length,
      total: risks.length,
      byCriticality: byKind("RISK_CRITICALITY").map((o) => ({ id: o.id, count: openRisks.filter((r) => r.criticalityId === o.id).length })),
      overdue: openRisks
        .filter((r) => r.dueDate && r.dueDate < today)
        .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
        .slice(0, 8)
        .map((r) => ({ id: r.id, title: r.title, dueDate: r.dueDate, criticalityId: r.criticalityId, ownerId: r.ownerId })),
    },
    meetings: meetingTypes
      .filter((t) => t.active)
      .sort((a, b) => a.order - b.order)
      .map((t) => {
        const dates = meetings.filter((m) => m.meetingTypeId === t.id).map((m) => m.date).sort();
        const past = dates.filter((d) => d <= today);
        const next = dates.find((d) => d > today) ?? null;
        const lastDate = past.length ? past[past.length - 1] : null;
        return { typeId: t.id, count: dates.length, last: lastDate ? { date: lastDate, id: meetings.find((m) => m.meetingTypeId === t.id && m.date === lastDate)!.id } : null, next };
      }),
    activity,
  };
}

// ---------------------------------------------------------------------------
// Recherche globale (insensible à la casse et aux accents)
// ---------------------------------------------------------------------------

const FROM = "àâäáãéèêëîïíìôöóòõùûüúçñœæ";
const TO = "aaaaaeeeeiiiiooooouuuucnoa";
export const fold = (s: string) =>
  s
    .toLowerCase()
    .split("")
    .map((ch) => {
      const i = FROM.indexOf(ch);
      return i >= 0 ? TO[i] : ch;
    })
    .join("");

function likeAny(cols: AnyPgColumn[], q: string): SQL {
  const pattern = `%${fold(q).replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  return or(...cols.map((c) => sql`translate(lower(${c}), ${FROM}, ${TO}) like ${pattern}`))!;
}

function snippet(q: string, ...texts: (string | null | undefined)[]): string {
  const fq = fold(q);
  for (const raw of texts) {
    const t = (raw ?? "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
    const i = fold(t).indexOf(fq);
    if (i >= 0) {
      const start = Math.max(0, i - 50);
      return `${start > 0 ? "…" : ""}${t.slice(start, i + fq.length + 80)}${i + fq.length + 80 < t.length ? "…" : ""}`;
    }
  }
  return "";
}

export async function searchAccount(ctx: Ctx, query: string, limit = 8) {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return { query: q, cards: [], risks: [], topics: [], highlights: [], contacts: [], streams: [] };
  const acc = ctx.accountId;
  const refNum = /^#?\d{1,6}$/.test(q) ? Number(q.replace("#", "")) : null;
  const C = T.cards;
  const [cards, risks, topics, highlights, contacts, streams] = await Promise.all([
    db
      .select({ id: C.id, ref: C.ref, title: C.title, emoji: C.emoji, description: C.description, progressNote: C.progressNote, nextSteps: C.nextSteps, alertsNote: C.alertsNote, streamId: C.streamId, statusId: C.statusId, archived: C.archived })
      .from(C)
      .where(and(eq(C.accountId, acc), refNum !== null ? or(eq(C.ref, refNum), likeAny([C.title], q)) : likeAny([C.title, C.description, C.progressNote, C.nextSteps, C.alertsNote], q)))
      .orderBy(C.archived, desc(C.updatedAt))
      .limit(limit),
    db
      .select({ id: T.risks.id, title: T.risks.title, description: T.risks.description, mitigation: T.risks.mitigation, criticalityId: T.risks.criticalityId })
      .from(T.risks)
      .where(and(eq(T.risks.accountId, acc), likeAny([T.risks.title, T.risks.description, T.risks.mitigation, T.risks.instance], q)))
      .orderBy(desc(T.risks.updatedAt))
      .limit(limit),
    db
      .select({ id: T.topics.id, title: T.topics.title, emoji: T.topics.emoji, description: T.topics.description, decisionRequest: T.topics.decisionRequest, meetingId: T.topics.meetingId, date: T.meetings.date, meetingTypeId: T.meetings.meetingTypeId })
      .from(T.topics)
      .innerJoin(T.meetings, eq(T.meetings.id, T.topics.meetingId))
      .where(and(eq(T.topics.accountId, acc), likeAny([T.topics.title, T.topics.description, T.topics.decisionRequest], q)))
      .orderBy(desc(T.meetings.date))
      .limit(limit),
    db
      .select({ id: T.highlights.id, title: T.highlights.title, emoji: T.highlights.emoji, detail: T.highlights.detail, meetingId: T.highlights.meetingId, date: T.meetings.date, meetingTypeId: T.meetings.meetingTypeId })
      .from(T.highlights)
      .innerJoin(T.meetings, eq(T.meetings.id, T.highlights.meetingId))
      .where(and(eq(T.highlights.accountId, acc), likeAny([T.highlights.title, T.highlights.detail], q)))
      .orderBy(desc(T.meetings.date))
      .limit(limit),
    db
      .select({ id: T.contacts.id, name: T.contacts.name, company: T.contacts.company, role: T.contacts.role, email: T.contacts.email })
      .from(T.contacts)
      .where(and(eq(T.contacts.accountId, acc), likeAny([T.contacts.name, T.contacts.company, T.contacts.role, T.contacts.email], q)))
      .limit(limit),
    db
      .select({ id: T.streams.id, name: T.streams.name, emoji: T.streams.emoji, leader: T.streams.leader, prescriber: T.streams.prescriber })
      .from(T.streams)
      .where(and(eq(T.streams.accountId, acc), likeAny([T.streams.name, T.streams.leader, T.streams.prescriber], q)))
      .limit(limit),
  ]);
  return {
    query: q,
    cards: cards.map((c) => ({ id: c.id, ref: c.ref, title: c.title, emoji: c.emoji, streamId: c.streamId, statusId: c.statusId, archived: c.archived, snippet: snippet(q, c.description, c.progressNote, c.nextSteps, c.alertsNote) })),
    risks: risks.map((r) => ({ id: r.id, title: r.title, criticalityId: r.criticalityId, snippet: snippet(q, r.description, r.mitigation) })),
    topics: topics.map((t) => ({ id: t.id, title: t.title, emoji: t.emoji, meetingId: t.meetingId, meetingTypeId: t.meetingTypeId, date: t.date, snippet: snippet(q, t.description, t.decisionRequest) })),
    highlights: highlights.map((h) => ({ id: h.id, title: h.title, emoji: h.emoji, meetingId: h.meetingId, meetingTypeId: h.meetingTypeId, date: h.date, snippet: snippet(q, h.detail) })),
    contacts,
    streams,
  };
}

