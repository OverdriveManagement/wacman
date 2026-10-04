import type { AccountCtx } from "./hooks";
import type { Action, ActionParty, Decision, Meeting, MeetingType } from "./types";

/** Jour (AAAA-MM-JJ, heure de Paris) d'un instant. */
export const parisDay = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

export function partyOptions(acc: AccountCtx) {
  const client = acc.data?.account.clientShortName || acc.data?.account.clientName || "Client";
  return [
    { id: "WIFIRST", label: "Wifirst", color: "blue" },
    { id: "CLIENT", label: acc.data?.account.clientName || client, color: "ocre" },
    { id: "JOINT", label: "Commun", color: "teal" },
  ];
}

export function partyLabel(party: ActionParty, acc: AccountCtx) {
  return partyOptions(acc).find((o) => o.id === party)?.label ?? party;
}

/** Date de prise d'une action ou d'une décision : celle de sa séance, sinon sa date de création. */
function bornOn(x: { meetingId: string | null; createdAt: string }, meetings: Pick<Meeting, "id" | "date">[]) {
  return meetings.find((m) => m.id === x.meetingId)?.date ?? parisDay(x.createdAt);
}

/**
 * Actions affichées pour une séance : celles de la série prises au plus tard ce jour-là,
 * encore ouvertes ou closes depuis la séance précédente.
 */
export function actionsForMeeting(all: Action[], type: MeetingType, meeting: Meeting, meetings: Meeting[]) {
  const prev = meetings.filter((m) => m.date < meeting.date).sort((a, b) => b.date.localeCompare(a.date))[0];
  return all
    .filter((a) => a.meetingTypeId === type.id && bornOn(a, meetings) <= meeting.date)
    .filter((a) => a.status === "OPEN" || (a.closedAt && (!prev || parisDay(a.closedAt) > prev.date)))
    .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

/** Décisions affichées pour une séance : attendues à cette date, et prises lors de cette séance (ou depuis la précédente). */
export function decisionsForMeeting(all: Decision[], type: MeetingType, meeting: Meeting, meetings: Meeting[]) {
  const prev = meetings.filter((m) => m.date < meeting.date).sort((a, b) => b.date.localeCompare(a.date))[0];
  const ofType = all.filter((d) => d.meetingTypeId === type.id);
  const pending = ofType.filter((d) => d.status === "PENDING" && bornOn(d, meetings) <= meeting.date);
  const taken = ofType.filter(
    (d) => d.status === "TAKEN" && (d.meetingId === meeting.id || (!d.meetingId && d.decidedOn && d.decidedOn <= meeting.date && (!prev || d.decidedOn > prev.date))),
  );
  const sort = (l: Decision[]) => l.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
  return { pending: sort(pending), taken: sort(taken) };
}

/** Retire de l'arbitrage demandé d'un sujet les lignes « Décision : … » (affichées dans le registre). */
export function stripDecisions(text: string): string {
  const lines = (text ?? "").split("\n");
  const idx = lines.findIndex((l) => /^\s*(\*\*)?\s*d[ée]cisions?(\s+prises?)?\s*(\*\*)?\s*:/i.test(l));
  return idx === -1 ? text : lines.slice(0, idx).join("\n").replace(/\s+$/, "");
}

/** Remplit les variables d'un gabarit d'e-mail : {type}, {date}, {date_longue}, {compte}, {client}. */
export function fillTemplate(tpl: string, v: { type: string; date: string; dateLongue: string; compte: string; client: string }) {
  return tpl
    .replace(/\{type\}/g, v.type)
    .replace(/\{date\}/g, v.date)
    .replace(/\{date_longue\}/g, v.dateLongue)
    .replace(/\{compte\}/g, v.compte)
    .replace(/\{client\}/g, v.client);
}
