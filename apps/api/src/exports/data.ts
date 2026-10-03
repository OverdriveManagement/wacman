import { and, asc, desc, eq } from "drizzle-orm";
import { db, T, getAccountRow, mergeSettings, listCards, type Ctx } from "@wacman/core";

/** Charge en une fois tout ce qu'il faut pour les exports d'un compte. */
export async function loadAccountData(ctx: Ctx) {
  const account = await getAccountRow(ctx.accountId);
  const [streams, sprints, options, contacts, meetingTypes] = await Promise.all([
    db.select().from(T.streams).where(eq(T.streams.accountId, ctx.accountId)).orderBy(asc(T.streams.order), asc(T.streams.name)),
    db.select().from(T.sprints).where(eq(T.sprints.accountId, ctx.accountId)).orderBy(asc(T.sprints.order)),
    db.select().from(T.options).where(eq(T.options.accountId, ctx.accountId)).orderBy(asc(T.options.order)),
    db.select().from(T.contacts).where(eq(T.contacts.accountId, ctx.accountId)),
    db.select().from(T.meetingTypes).where(eq(T.meetingTypes.accountId, ctx.accountId)).orderBy(asc(T.meetingTypes.order)),
  ]);
  const opt = new Map(options.map((o) => [o.id, o]));
  const str = new Map(streams.map((s) => [s.id, s]));
  const spr = new Map(sprints.map((s) => [s.id, s]));
  const ctc = new Map(contacts.map((c) => [c.id, c]));
  const optLabel = (id: string | null | undefined, withEmoji = true) => {
    const o = id ? opt.get(id) : undefined;
    return o ? (withEmoji && o.emoji ? `${o.emoji} ${o.label}` : o.label) : "";
  };
  const streamLabel = (id: string | null | undefined, withEmoji = true) => {
    const s = id ? str.get(id) : undefined;
    return s ? (withEmoji && s.emoji ? `${s.emoji} ${s.name}` : s.name) : "";
  };
  const currentSprint = sprints.find((s) => s.state === "CURRENT") ?? sprints.find((s) => s.state === "UPCOMING") ?? sprints[0];
  return {
    account,
    settings: mergeSettings(account.clientName, account.settings),
    streams,
    sprints,
    options,
    contacts,
    meetingTypes,
    opt,
    str,
    spr,
    ctc,
    optLabel,
    streamLabel,
    contactName: (id: string | null | undefined) => (id ? ctc.get(id)?.name ?? "" : ""),
    sprintName: (id: string | null | undefined) => (id ? spr.get(id)?.name ?? "" : ""),
    currentSprint,
    isDone: (statusId: string | null | undefined) => !!(statusId && (opt.get(statusId)?.meta as { done?: boolean })?.done),
    cards: (sprintId?: string) => listCards(ctx, { sprintId }),
  };
}

export async function latestMeetings(ctx: Ctx, meetingTypeId: string, limit = 1) {
  return db
    .select()
    .from(T.meetings)
    .where(and(eq(T.meetings.accountId, ctx.accountId), eq(T.meetings.meetingTypeId, meetingTypeId)))
    .orderBy(desc(T.meetings.date))
    .limit(limit);
}

/** Retire le balisage léger (**gras**, [lien](url)) pour un export texte. */
export function plain(md: string | null | undefined): string {
  return (md ?? "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
}

export function frDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
