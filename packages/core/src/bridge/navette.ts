import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db.js";
import * as T from "../schema.js";
import { HttpError, UUID_RE } from "../context.js";
import { creatableStreams, other, parse, partyLabel, type BridgeCtx, type Party } from "./common.js";
import { assignQuestion, closeQuestion, createQuestion, getQuestion, reopenQuestion, respondQuestion } from "./questions.js";

/**
 * Fiche navette : réimport des réponses saisies dans l'export Excel (colonnes « Votre réponse » et « Nouveau statut », anciennement « Nouvel attribué »).
 * Chaque ligne est d'abord analysée (aperçu), puis appliquée par les mêmes services que l'écran : mêmes droits,
 * même historique, mêmes e-mails. Les réponses importées sont marquées « fiche navette ».
 * La partie « Nouvelles questions » de la fiche crée des questions (stream, échéance, organisation qui doit répondre,
 * texte avec le sujet en première ligne, nom de la personne qui la pose).
 */

export type NavetteTarget = Party | "CLOSE" | null;
export type NavetteAction = "answer" | "assign" | "close" | "reopen" | "create";

/** Nouvelle question saisie dans la partie « Nouvelles questions » de la fiche : textes bruts des cellules. */
export interface NavetteNewQuestion {
  /** colonne Question : sujet sur la première ligne, détail ensuite */
  text: string;
  /** colonne Stream : un ou plusieurs noms (séparés par une virgule, un point-virgule ou un retour à la ligne) */
  streams: string;
  /** colonne Échéance : AAAA-MM-JJ ou JJ/MM/AAAA, vide si aucune */
  due: string;
  /** colonne À traiter par : organisation qui doit répondre (Wifirst si vide) */
  assigned: string;
  /** colonne Posée par : nom de la personne, facultatif */
  askedBy: string;
}

/** Une ligne lue dans le fichier (ou renvoyée par l'aperçu pour être appliquée). */
export interface NavetteRow {
  line: number;
  /** identifiant de la question (colonne cachée), sinon numéro (colonne Réf.) */
  id: string | null;
  ref: number | null;
  /** dernière activité de la question au moment de l'export (colonne cachée) */
  version: string | null;
  body: string;
  /** organisation ou clôture choisie ; `targetText` garde la saisie brute pour les messages d'erreur */
  target: NavetteTarget;
  targetText?: string;
  targetError?: string | null;
  /** ligne de la partie « Nouvelles questions » (sans identifiant ni numéro) */
  newQuestion?: NavetteNewQuestion | null;
}

export interface NavettePlan {
  line: number;
  questionId: string | null;
  ref: number | null;
  subject: string;
  body: string;
  target: NavetteTarget;
  version: string | null;
  action: NavetteAction | null;
  /** organisation au nom de laquelle la réponse est enregistrée */
  party: Party | null;
  /** issue effective (cible choisie, ou règle par défaut) */
  outcome: NavetteTarget;
  summary: string;
  warning: string | null;
  error: string | null;
  /** nouvelle question : saisie d'origine (renvoyée telle quelle à l'import) */
  newQuestion: NavetteNewQuestion | null;
  /** nouvelle question : valeurs retenues */
  create: { streamIds: string[]; dueDate: string | null; askedByName: string } | null;
}

const MAX_ROWS = 1000;
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
/** Texte d'une réponse : fins de ligne unifiées, espaces de fin retirés. */
export const navetteText = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .trim();
const same = (a: string, b: string) => norm(a) === norm(b);

/** Choix proposés dans la colonne « Nouveau statut » de la fiche navette. */
export const navetteStatusChoices = (c: { providerName: string; clientName: string }) => [`À traiter par ${c.providerName}`, `À traiter par ${c.clientName}`, "Clôturer"];

/** Lit la valeur de la colonne « Nouveau statut » : « À traiter par » suivi d'une organisation (ou son seul nom, ou le sigle du client), ou « Clôturer ». */
export function parseNavetteTarget(ctx: BridgeCtx, raw: string): { target: NavetteTarget; error: string | null } {
  const v = norm(raw).replace(/^(?:a traiter par|attribuer a|attribuee a|attribue a|a)\s+/, "");
  if (!v) return { target: null, error: null };
  const c = ctx.client;
  if (v === norm(c.providerName)) return { target: "PROVIDER", error: null };
  if (v === norm(c.clientName) || (c.shortName && v === norm(c.shortName))) return { target: "CLIENT", error: null };
  if (["cloturer", "cloture", "cloturee", "clore", "close", "fermer"].includes(v)) return { target: "CLOSE", error: null };
  return { target: null, error: `Nouveau statut non reconnu : « ${raw.trim()} » (attendu : ${navetteStatusChoices(c).join(", ").replace(/, (?=[^,]*$)/, " ou ")}).` };
}

const label = (ctx: BridgeCtx, p: Party | null | undefined) => partyLabel(ctx.client, p);
const when = (d: Date) => d.toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Analyse d'une ligne : action à mener, ou raison pour laquelle elle est ignorée. `seen` évite de traiter deux fois une question. */
async function planRow(ctx: BridgeCtx, row: NavetteRow, seen: Map<string, number>): Promise<NavettePlan | null> {
  const body = navetteText(row.body ?? "");
  if (!body && row.target === null && !row.targetError) return null; // ligne sans réponse
  const plan: NavettePlan = {
    line: row.line,
    questionId: null,
    ref: row.ref,
    subject: "",
    body,
    target: row.target,
    version: row.version,
    action: null,
    party: null,
    outcome: null,
    summary: "",
    warning: null,
    error: null,
    newQuestion: null,
    create: null,
  };
  const fail = (error: string) => ({ ...plan, error });
  const key = row.id && UUID_RE.test(row.id) ? row.id : row.ref ? String(row.ref) : null;
  if (!key) return fail("Ligne sans numéro de question.");
  let q: Awaited<ReturnType<typeof getQuestion>>;
  try {
    q = await getQuestion(ctx, key);
  } catch {
    return fail(`Question${row.ref ? ` n°${row.ref}` : ""} introuvable pour ce client.`);
  }
  plan.questionId = q.id;
  plan.ref = q.ref;
  plan.subject = q.subject;
  if (q.deletedAt) return fail("Question supprimée.");
  if (row.targetError) return fail(row.targetError);
  if (body.length > 20000) return fail("Réponse trop longue (20 000 caractères au plus).");
  const first = seen.get(q.id);
  if (first !== undefined) return fail(`Question déjà traitée par la ligne ${first} du fichier.`);
  seen.set(q.id, row.line);
  if (body && q.messages.some((m) => !m.deletedAt && same(m.body, body))) return fail("Cette réponse figure déjà dans les échanges (fichier déjà importé ?).");
  const exported = row.version ? new Date(row.version) : null;
  if (exported && !Number.isNaN(exported.getTime()) && new Date(q.lastActivityAt).getTime() > exported.getTime())
    plan.warning = `La question a changé depuis l'export (dernière activité le ${when(new Date(q.lastActivityAt))}).`;

  const target = row.target;
  if (q.status === "CLOSED") {
    if (target === "CLOSE") return fail("Question déjà clôturée.");
    if (!target) return fail(`Question clôturée : choisissez « ${navetteStatusChoices(ctx.client)[0]} » ou « ${navetteStatusChoices(ctx.client)[1]} » dans « Nouveau statut » pour la rouvrir avec cette réponse.`);
    if (!q.perms.reopenAs.length) return fail("Question clôturée : vous ne pouvez pas la rouvrir.");
    const acting = q.perms.reopenAs.includes(ctx.side) ? ctx.side : q.perms.reopenAs[0];
    return { ...plan, action: "reopen", party: acting, outcome: target, summary: `Réouverture${body ? " avec cette réponse" : ""}, attribuée à ${label(ctx, target)}` };
  }
  if (body) {
    const as = q.perms.respondAs;
    if (!as.length) return fail(`Question attribuée à ${label(ctx, q.assignedParty)} : vous ne pouvez pas y répondre.`);
    // la réponse est celle de l'attribué quand l'importateur peut répondre en son nom, sinon celle de son organisation
    const party: Party = as.includes(q.assignedParty) ? q.assignedParty : as.includes(ctx.side) ? ctx.side : as[0];
    const outcome: NavetteTarget = target ?? (party === q.assignedParty ? other(q.assignedParty) : q.assignedParty);
    const issue =
      outcome === "CLOSE" ? "puis clôture" : outcome === q.assignedParty ? `attribution conservée (${label(ctx, outcome)})` : `attribuée à ${label(ctx, outcome)}`;
    return { ...plan, action: "answer", party, outcome, summary: `Réponse de ${label(ctx, party)}, ${issue}` };
  }
  if (target === "CLOSE") {
    if (!q.perms.close) return fail("Vous ne pouvez pas clôturer cette question.");
    return { ...plan, action: "close", outcome: "CLOSE", summary: "Clôture, sans réponse" };
  }
  if (target === q.assignedParty) return fail(`Déjà attribuée à ${label(ctx, target)} : rien à changer.`);
  if (!q.perms.reassign) return fail("Vous ne pouvez pas changer l'attribution de cette question.");
  return { ...plan, action: "assign", outcome: target, summary: `Attribuée à ${label(ctx, target)}, sans réponse` };
}

/** Questions déjà présentes chez le client (sujet et texte), pour ne pas créer deux fois la même question. */
type Known = { ref: number; key: string }[];
const questionKey = (subject: string, body: string) => `${norm(subject)}|${norm(body)}`;
async function knownQuestions(ctx: BridgeCtx): Promise<Known> {
  const rows = await db
    .select({ ref: T.bridgeQuestions.ref, subject: T.bridgeQuestions.subject, body: T.bridgeQuestions.body })
    .from(T.bridgeQuestions)
    .where(and(eq(T.bridgeQuestions.clientId, ctx.client.id), isNull(T.bridgeQuestions.deletedAt)));
  return rows.map((r) => ({ ref: r.ref, key: questionKey(r.subject, r.body) }));
}

/** Sujet (première ligne, ou début du texte s'il est long) et détail d'une nouvelle question. */
function splitQuestion(text: string) {
  const [first, ...rest] = text.split("\n");
  const head = first.trim();
  if (head.length <= 150) return { subject: head, body: rest.join("\n").trim() };
  const cut = head.slice(0, 147);
  return { subject: `${cut.slice(0, cut.lastIndexOf(" ") > 80 ? cut.lastIndexOf(" ") : 147).trimEnd()}…`, body: text };
}

/** Échéance saisie : date Excel relue (AAAA-MM-JJ…), JJ/MM/AAAA ou JJ/MM/AA, numéro de série Excel. `undefined` si illisible. */
function parseDue(raw: string): string | null | undefined {
  const t = raw.trim();
  if (!t) return null;
  let y: number, m: number, d: number;
  let r: RegExpExecArray | null;
  if ((r = /^(\d{4})-(\d{2})-(\d{2})/.exec(t))) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t))) [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3].length === 2 ? `20${r[3]}` : r[3])];
  else if (/^\d{5}(?:\.\d+)?$/.test(t)) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 86_400_000);
    [y, m, d] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
  } else return undefined;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 2000 || y > 2100) return undefined;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Analyse d'une nouvelle question : stream, échéance, organisation qui doit répondre, droits, doublons. */
function planNew(ctx: BridgeCtx, row: NavetteRow, nq: NavetteNewQuestion, seen: Map<string, number>, known: Known): NavettePlan {
  const text = navetteText(nq.text);
  const { subject, body } = splitQuestion(text);
  const plan: NavettePlan = {
    line: row.line,
    questionId: null,
    ref: null,
    subject,
    body,
    target: null,
    version: null,
    action: null,
    party: null,
    outcome: null,
    summary: "",
    warning: null,
    error: null,
    newQuestion: nq,
    create: null,
  };
  const fail = (error: string) => ({ ...plan, error });
  if (!subject) return fail("Nouvelle question sans texte.");
  if (body.length > 20000) return fail("Question trop longue (20 000 caractères au plus).");
  // streams
  const names = nq.streams.split(/[,;+\n]+/).map((x) => x.trim()).filter(Boolean);
  if (!names.length) return fail("Nouvelle question : choisissez un stream.");
  const streamIds: string[] = [];
  for (const n of names) {
    const st = ctx.streams.find((x) => norm(x.name) === norm(n));
    if (!st) return fail(`Stream inconnu : « ${n} ».`);
    if (!st.active) return fail(`Le stream ${st.name} n'est plus actif.`);
    if (!streamIds.includes(st.id)) streamIds.push(st.id);
  }
  // échéance
  const dueDate = parseDue(nq.due);
  if (dueDate === undefined) return fail(`Échéance illisible : « ${nq.due.trim()} » (attendu : JJ/MM/AAAA).`);
  // organisation qui doit répondre, et organisation au nom de laquelle la question est posée
  const a = nq.assigned.trim() ? parseNavetteTarget(ctx, nq.assigned) : { target: null, error: null };
  if (a.error || a.target === "CLOSE")
    return fail(`« À traiter par » non reconnu : « ${nq.assigned.trim()} » (attendu : ${ctx.client.providerName} ou ${ctx.client.clientName}).`);
  const assigned: Party = a.target ?? "PROVIDER";
  const creatable = creatableStreams(ctx);
  const can = (p: Party) => streamIds.every((sid) => creatable[p].includes(sid));
  if (!can("PROVIDER") && !can("CLIENT")) return fail("Vous ne pouvez pas poser de question dans ce stream.");
  let party: Party;
  if (assigned === "PROVIDER") {
    party = can("CLIENT") ? "CLIENT" : "PROVIDER";
    if (party === "PROVIDER") plan.warning = `Vous ne pouvez pas poser de question au nom de ${label(ctx, "CLIENT")} : elle sera posée au nom de ${label(ctx, "PROVIDER")}.`;
  } else {
    if (!can("PROVIDER"))
      return fail(`Une question de ${label(ctx, "CLIENT")} est à traiter par ${label(ctx, "PROVIDER")} : choisissez « ${ctx.client.providerName} » dans « À traiter par ».`);
    party = "PROVIDER";
  }
  // doublons : dans le fichier, puis parmi les questions existantes (même fichier importé deux fois)
  const key = questionKey(subject, body);
  const first = seen.get(`new:${key}`);
  if (first !== undefined) return fail(`Question identique à celle de la ligne ${first} du fichier.`);
  seen.set(`new:${key}`, row.line);
  const dup = known.find((k) => k.key === key);
  if (dup) return fail(`Cette question existe déjà (n°${dup.ref}) : fichier déjà importé ?`);
  const askedByName = navetteText(nq.askedBy).replace(/\s+/g, " ").slice(0, 120) || ctx.user.name;
  const streamsText = streamIds.map((sid) => ctx.streams.find((x) => x.id === sid)?.name ?? "").join(", ");
  const dueText = dueDate ? `, échéance le ${dueDate.split("-").reverse().join("/")}` : "";
  return {
    ...plan,
    action: "create",
    party,
    outcome: assigned,
    create: { streamIds, dueDate, askedByName },
    summary: `Nouvelle question de ${label(ctx, party)}${askedByName !== ctx.user.name ? ` (${askedByName})` : ""}, à traiter par ${label(ctx, assigned)} : ${streamsText}${dueText}`,
  };
}

/** Aperçu de l'import : une entrée par ligne remplie (action prévue ou raison du refus). */
export async function planNavette(ctx: BridgeCtx, rows: NavetteRow[]) {
  if (rows.length > MAX_ROWS) throw new HttpError(400, `Fichier trop long : ${MAX_ROWS} lignes au plus.`);
  const seen = new Map<string, number>();
  const known = rows.some((r) => r.newQuestion) ? await knownQuestions(ctx) : [];
  const items: NavettePlan[] = [];
  let empty = 0;
  for (const row of rows) {
    const p = row.newQuestion ? planNew(ctx, row, row.newQuestion, seen, known) : await planRow(ctx, row, seen);
    if (p) items.push(p);
    else empty++;
  }
  return { rows: rows.length, empty, items, ready: items.filter((i) => !i.error).length };
}

const answerItem = z.object({
  line: z.number().int().min(0).max(100000).default(0),
  questionId: z.string().regex(UUID_RE, "Question inconnue."),
  body: z.string().max(20000).default(""),
  target: z.enum(["PROVIDER", "CLIENT", "CLOSE"]).nullable().default(null),
  version: z.string().max(40).nullable().default(null),
});
const newItem = z.object({
  line: z.number().int().min(0).max(100000).default(0),
  newQuestion: z.object({
    text: z.string().max(25000),
    streams: z.string().max(1000).default(""),
    due: z.string().max(60).default(""),
    assigned: z.string().max(200).default(""),
    askedBy: z.string().max(300).default(""),
  }),
});
const applySchema = z.object({
  items: z.array(z.union([newItem, answerItem])).min(1, "Aucune réponse à importer.").max(500, "500 lignes au plus par import."),
});

/** Applique les lignes validées : chacune est analysée de nouveau (droits, état de la question), puis enregistrée. */
export async function applyNavette(ctx: BridgeCtx, input: unknown) {
  const { items } = parse(applySchema, input);
  const seen = new Map<string, number>();
  const known = items.some((it) => "newQuestion" in it) ? await knownQuestions(ctx) : [];
  const results: { line: number; ref: number | null; subject: string; summary: string; ok: boolean; error: string | null }[] = [];
  for (const it of items) {
    const plan =
      "newQuestion" in it
        ? planNew(ctx, { line: it.line, id: null, ref: null, version: null, body: "", target: null, newQuestion: it.newQuestion }, it.newQuestion, seen, known)
        : await planRow(ctx, { line: it.line, id: it.questionId, ref: null, version: it.version, body: it.body, target: it.target }, seen);
    if (!plan) continue;
    if (plan.action === "create" && plan.create && !plan.error) {
      try {
        const q = await createQuestion(
          ctx,
          { subject: plan.subject, body: plan.body, streamIds: plan.create.streamIds, askedByParty: plan.party, assignedParty: plan.outcome, dueDate: plan.create.dueDate },
          { source: "navette", askedByName: plan.create.askedByName },
        );
        results.push({ line: plan.line, ref: q.ref, subject: plan.subject, summary: plan.summary, ok: true, error: null });
      } catch (e) {
        results.push({ line: plan.line, ref: null, subject: plan.subject, summary: plan.summary, ok: false, error: e instanceof HttpError ? e.message : "Erreur à l'enregistrement." });
        if (!(e instanceof HttpError)) console.error("[wibridge] fiche navette", e);
      }
      continue;
    }
    if (plan.error || !plan.action || !plan.questionId) {
      results.push({ line: plan.line, ref: plan.ref, subject: plan.subject, summary: plan.summary, ok: false, error: plan.error ?? "Rien à importer." });
      continue;
    }
    try {
      const opts = { source: "navette" as const };
      if (plan.action === "answer") await respondQuestion(ctx, plan.questionId, { body: plan.body, party: plan.party, outcome: plan.outcome }, opts);
      else if (plan.action === "assign") await assignQuestion(ctx, plan.questionId, { party: plan.outcome }, opts);
      else if (plan.action === "close") await closeQuestion(ctx, plan.questionId, opts);
      else await reopenQuestion(ctx, plan.questionId, { as: plan.party, party: plan.outcome, body: plan.body }, opts);
      results.push({ line: plan.line, ref: plan.ref, subject: plan.subject, summary: plan.summary, ok: true, error: null });
    } catch (e) {
      results.push({ line: plan.line, ref: plan.ref, subject: plan.subject, summary: plan.summary, ok: false, error: e instanceof HttpError ? e.message : "Erreur à l'enregistrement." });
      if (!(e instanceof HttpError)) console.error("[wibridge] fiche navette", e);
    }
  }
  return { done: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
}
