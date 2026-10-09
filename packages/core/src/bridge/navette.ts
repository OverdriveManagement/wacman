import { z } from "zod";
import { HttpError, UUID_RE } from "../context.js";
import { other, parse, partyLabel, type BridgeCtx, type Party } from "./common.js";
import { assignQuestion, closeQuestion, getQuestion, reopenQuestion, respondQuestion } from "./questions.js";

/**
 * Fiche navette : réimport des réponses saisies dans l'export Excel (colonnes « Votre réponse » et « Nouvel attribué »).
 * Chaque ligne est d'abord analysée (aperçu), puis appliquée par les mêmes services que l'écran : mêmes droits,
 * même historique, mêmes e-mails. Les réponses importées sont marquées « fiche navette ».
 */

export type NavetteTarget = Party | "CLOSE" | null;
export type NavetteAction = "answer" | "assign" | "close" | "reopen";

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

/** Lit la valeur de la colonne « Nouvel attribué » : nom d'une organisation, son sigle, ou « Clôturer ». */
export function parseNavetteTarget(ctx: BridgeCtx, raw: string): { target: NavetteTarget; error: string | null } {
  const v = norm(raw);
  if (!v) return { target: null, error: null };
  const c = ctx.client;
  if (v === norm(c.providerName)) return { target: "PROVIDER", error: null };
  if (v === norm(c.clientName) || (c.shortName && v === norm(c.shortName))) return { target: "CLIENT", error: null };
  if (["cloturer", "cloture", "cloturee", "clore", "close", "fermer"].includes(v)) return { target: "CLOSE", error: null };
  return { target: null, error: `Nouvel attribué non reconnu : « ${raw.trim()} » (attendu : ${c.providerName}, ${c.clientName} ou Clôturer).` };
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
    if (!target) return fail("Question clôturée : indiquez un nouvel attribué pour la rouvrir avec cette réponse.");
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

/** Aperçu de l'import : une entrée par ligne remplie (action prévue ou raison du refus). */
export async function planNavette(ctx: BridgeCtx, rows: NavetteRow[]) {
  if (rows.length > MAX_ROWS) throw new HttpError(400, `Fichier trop long : ${MAX_ROWS} lignes au plus.`);
  const seen = new Map<string, number>();
  const items: NavettePlan[] = [];
  let empty = 0;
  for (const row of rows) {
    const p = await planRow(ctx, row, seen);
    if (p) items.push(p);
    else empty++;
  }
  return { rows: rows.length, empty, items, ready: items.filter((i) => !i.error).length };
}

const applySchema = z.object({
  items: z
    .array(
      z.object({
        line: z.number().int().min(0).max(100000).default(0),
        questionId: z.string().regex(UUID_RE, "Question inconnue."),
        body: z.string().max(20000).default(""),
        target: z.enum(["PROVIDER", "CLIENT", "CLOSE"]).nullable().default(null),
        version: z.string().max(40).nullable().default(null),
      }),
    )
    .min(1, "Aucune réponse à importer.")
    .max(500, "500 réponses au plus par import."),
});

/** Applique les lignes validées : chacune est analysée de nouveau (droits, état de la question), puis enregistrée. */
export async function applyNavette(ctx: BridgeCtx, input: unknown) {
  const { items } = parse(applySchema, input);
  const seen = new Map<string, number>();
  const results: { line: number; ref: number | null; subject: string; summary: string; ok: boolean; error: string | null }[] = [];
  for (const it of items) {
    const plan = await planRow(ctx, { line: it.line, id: it.questionId, ref: null, version: it.version, body: it.body, target: it.target }, seen);
    if (!plan) continue;
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
