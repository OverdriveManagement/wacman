import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "../db.js";
import * as T from "../schema.js";
import { effectiveAccess, mergeBridgeSettings, partiesOf, canSee, type Party } from "./common.js";

/**
 * Notifications WiBridge : le service métier signale un événement ; l'API (apps/api) l'envoie par e-mail.
 * Les destinataires sont calculés ici : membres qui doivent agir, selon leurs droits par stream et leur préférence.
 */

export type BridgeNotice =
  | { kind: "assigned"; clientId: string; questionId: string; party: Party; reason: "created" | "answer" | "reassigned" | "reopened"; actor: NoticeActor; message?: string }
  | { kind: "closed"; clientId: string; questionId: string; actor: NoticeActor; message?: string }
  | { kind: "partial"; clientId: string; questionId: string; actor: NoticeActor; message?: string };

export interface NoticeActor {
  id: string;
  name: string;
  party: Party;
}

type Sink = (n: BridgeNotice) => Promise<void>;
let sink: Sink | null = null;

/** L'API enregistre ici l'envoi des e-mails au démarrage. */
export function setBridgeNotifier(fn: Sink | null) {
  sink = fn;
}

/** Signale un événement (sans jamais faire échouer l'opération qui l'a déclenché). */
export function emitBridgeNotice(n: BridgeNotice) {
  if (!sink) return;
  setImmediate(() => {
    sink?.(n).catch((e) => console.error("[wibridge] notification non envoyée", e));
  });
}

export interface Recipient {
  userId: string;
  email: string;
  name: string;
}

/** Destinataires d'un événement : membres actifs du client, avec e-mail immédiat, ayant le droit d'agir. */
export async function noticeRecipients(n: BridgeNotice) {
  const [client] = await db.select().from(T.bridgeClients).where(eq(T.bridgeClients.id, n.clientId));
  if (!client || client.archived || !mergeBridgeSettings(client.settings).notifications) return null;
  const [question] = await db.select().from(T.bridgeQuestions).where(eq(T.bridgeQuestions.id, n.questionId));
  if (!question || question.deletedAt) return null;
  const streamIds = (await db.select({ s: T.bridgeQuestionStreams.streamId }).from(T.bridgeQuestionStreams).where(eq(T.bridgeQuestionStreams.questionId, question.id))).map((r) => r.s);
  const streams = streamIds.length ? await db.select().from(T.bridgeStreams).where(inArray(T.bridgeStreams.id, streamIds)) : [];
  const members = await db
    .select({ m: T.bridgeMembers, u: T.users })
    .from(T.bridgeMembers)
    .innerJoin(T.users, eq(T.users.id, T.bridgeMembers.userId))
    .where(and(eq(T.bridgeMembers.clientId, client.id), eq(T.bridgeMembers.notify, "IMMEDIATE"), eq(T.users.active, true), eq(T.users.passwordSet, true), ne(T.users.id, n.actor.id)));
  const eligible = members.filter(({ u }) => u.bridgeAccess || u.isSuperAdmin);
  let recipients: Recipient[] = [];
  if (n.kind === "assigned") {
    recipients = eligible.filter(({ m }) => streamIds.some((s) => partiesOf(effectiveAccess(m, s)).includes(n.party))).map(({ u }) => ({ userId: u.id, email: u.email, name: u.name }));
  } else if (question.askedById) {
    recipients = eligible
      .filter(({ u, m }) => u.id === question.askedById && streamIds.some((s) => canSee(effectiveAccess(m, s))))
      .map(({ u }) => ({ userId: u.id, email: u.email, name: u.name }));
  }
  return { client, question, streams: streams.sort((a, b) => a.order - b.order), recipients };
}

/** Récapitulatif quotidien : pour chaque membre qui l'a choisi, les questions ouvertes que son organisation doit traiter. */
export async function digestBatches() {
  const clients = await db.select().from(T.bridgeClients).where(eq(T.bridgeClients.archived, false));
  const out: { client: typeof T.bridgeClients.$inferSelect; recipient: Recipient; questions: (typeof T.bridgeQuestions.$inferSelect)[] }[] = [];
  for (const client of clients) {
    if (!mergeBridgeSettings(client.settings).notifications) continue;
    const members = await db
      .select({ m: T.bridgeMembers, u: T.users })
      .from(T.bridgeMembers)
      .innerJoin(T.users, eq(T.users.id, T.bridgeMembers.userId))
      .where(and(eq(T.bridgeMembers.clientId, client.id), eq(T.bridgeMembers.notify, "DAILY"), eq(T.users.active, true), eq(T.users.passwordSet, true)));
    if (!members.length) continue;
    const questions = await db
      .select()
      .from(T.bridgeQuestions)
      .where(and(eq(T.bridgeQuestions.clientId, client.id), ne(T.bridgeQuestions.status, "CLOSED"), isNull(T.bridgeQuestions.deletedAt)));
    if (!questions.length) continue;
    const links = await db
      .select({ q: T.bridgeQuestionStreams.questionId, s: T.bridgeQuestionStreams.streamId })
      .from(T.bridgeQuestionStreams)
      .where(inArray(T.bridgeQuestionStreams.questionId, questions.map((q) => q.id)));
    const streamsOf = new Map<string, string[]>();
    for (const l of links) streamsOf.set(l.q, [...(streamsOf.get(l.q) ?? []), l.s]);
    for (const { m, u } of members) {
      if (!u.bridgeAccess && !u.isSuperAdmin) continue;
      const mine = questions
        .filter((q) => (streamsOf.get(q.id) ?? []).some((s) => partiesOf(effectiveAccess(m, s)).includes(q.assignedParty)))
        .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.ref - b.ref);
      if (mine.length) out.push({ client, recipient: { userId: u.id, email: u.email, name: u.name }, questions: mine });
    }
  }
  return out;
}
