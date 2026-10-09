import ExcelJS from "exceljs";
import { Bridge, HttpError, markupToPlain } from "@wacman/core";

/**
 * Fiche navette Excel : un seul onglet, une question par ligne, avec deux colonnes à remplir par l'attribué
 * (« Votre réponse », « Nouvel attribué »). Le même fichier se réimporte dans WiBridge (`readNavette`).
 * Deux colonnes cachées portent l'identifiant de la question et sa dernière activité au moment de l'export.
 */

export interface NavetteFilters {
  status: "open" | "closed" | "all";
  assigned: "all" | Bridge.Party;
  stream: string | null;
}

const PETROL = "FF004968";
const ANSWER_HEAD = "FFD97706";
const ANSWER_FILL = "FFFFF4CC";
const CLOSED_FILL = "FFEDEFF2";
const STATUS: Record<string, string> = { OPEN: "À traiter", IN_PROGRESS: "En cours", CLOSED: "Clôturée" };
const HEADER_ROW = 5;

/** Libellés des colonnes : ceux de la réponse et des colonnes cachées servent aussi à relire le fichier. */
export const NAVETTE_COLUMNS = [
  { key: "ref", header: "Réf.", width: 7 },
  { key: "subject", header: "Sujet", width: 30 },
  { key: "body", header: "Question", width: 48 },
  { key: "streams", header: "Streams", width: 18 },
  { key: "askedBy", header: "Posée par", width: 22 },
  { key: "createdAt", header: "Posée le", width: 11 },
  { key: "assigned", header: "Attribuée à", width: 13 },
  { key: "status", header: "Statut", width: 11 },
  { key: "due", header: "Échéance", width: 11 },
  { key: "thread", header: "Échanges", width: 60 },
  { key: "answer", header: "Votre réponse", width: 55 },
  { key: "target", header: "Nouvel attribué", width: 17 },
  { key: "id", header: "ID", width: 38, hidden: true },
  { key: "version", header: "Version", width: 26, hidden: true },
] as const;

const day = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`) : null);
// date et heure de Paris, sans fuseau (Excel n'en gère pas)
const local = (d: Date | string | null) => (d ? new Date(`${new Date(d).toLocaleString("sv-SE", { timeZone: "Europe/Paris" }).replace(" ", "T")}Z`) : null);
const stampOf = (d: Date | string) => new Date(d).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const clip = (s: string, n = 30000) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export async function buildNavetteWorkbook(ctx: Bridge.BridgeCtx, filters: NavetteFilters) {
  const { list, messages } = await Bridge.exportRows(ctx);
  const rows = list
    .filter((q) => filters.status === "all" || (filters.status === "closed" ? q.status === "CLOSED" : q.status !== "CLOSED"))
    .filter((q) => filters.assigned === "all" || (q.status !== "CLOSED" && q.assignedParty === filters.assigned))
    .filter((q) => !filters.stream || q.streamIds.includes(filters.stream))
    .sort((a, b) => a.ref - b.ref);
  const label = (p: Bridge.Party | null | undefined) => Bridge.partyLabel(ctx.client, p);
  const streamName = new Map(ctx.streams.map((s) => [s.id, s.name]));
  const byQuestion = new Map<string, typeof messages>();
  for (const m of messages) byQuestion.set(m.questionId, [...(byQuestion.get(m.questionId) ?? []), m]);
  const outcome = (m: (typeof messages)[number]) =>
    m.outcome === "CLOSE"
      ? "clôture"
      : m.outcome === "REOPEN"
        ? `réouverture, attribuée à ${label(m.assignedAfter)}`
        : m.assignedAfter === m.assignedBefore
          ? `attribution conservée (${label(m.assignedAfter)})`
          : `attribuée à ${label(m.assignedAfter)}`;

  const wb = new ExcelJS.Workbook();
  wb.creator = "WiBridge";
  const ws = wb.addWorksheet("Fiche navette", { properties: { defaultRowHeight: 18 } });
  ws.columns = NAVETTE_COLUMNS.map((c) => ({ key: c.key, width: c.width, hidden: "hidden" in c ? c.hidden : false }));
  const last = NAVETTE_COLUMNS.length - 2; // dernière colonne visible

  // en-tête de la fiche
  const what = [
    filters.status === "open" ? "questions ouvertes" : filters.status === "closed" ? "questions clôturées" : "toutes les questions",
    filters.assigned !== "all" ? `attribuées à ${label(filters.assigned)}` : "",
    filters.stream ? `stream ${streamName.get(filters.stream) ?? ""}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  ws.getCell(1, 1).value = `Fiche navette WiBridge : ${ctx.client.name}`;
  ws.getCell(1, 1).font = { name: "Inter", size: 14, bold: true, color: { argb: PETROL } };
  ws.getCell(2, 1).value = `Exportée le ${stampOf(new Date())} par ${ctx.user.name}. ${rows.length} question${rows.length > 1 ? "s" : ""} (${what}).`;
  ws.getCell(3, 1).value =
    `Répondez dans les colonnes jaunes : « Votre réponse » et « Nouvel attribué » (${ctx.client.providerName}, ${ctx.client.clientName} ou Clôturer ; ` +
    "laissé vide, la question passe à l'autre organisation quand l'attribué répond). Importez ensuite ce fichier dans WiBridge (bouton Importer) : les autres colonnes ne sont pas lues.";
  for (const r of [2, 3]) {
    ws.mergeCells(r, 1, r, last);
    ws.getCell(r, 1).font = { name: "Inter", size: 10, color: { argb: "FF334155" } };
    ws.getCell(r, 1).alignment = { wrapText: true, vertical: "top" };
  }
  ws.getRow(3).height = 30;

  const head = ws.getRow(HEADER_ROW);
  NAVETTE_COLUMNS.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    const answer = c.key === "answer" || c.key === "target";
    cell.font = { name: "Inter", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: answer ? ANSWER_HEAD : PETROL } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  head.height = 24;

  const names = [ctx.client.providerName, ctx.client.clientName, "Clôturer"];
  const validation = names.every((n) => !/[,"]/.test(n)) ? `"${names.join(",")}"` : null;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  for (const q of rows) {
    const ms = byQuestion.get(q.id) ?? [];
    const thread = ms.map((m) => `${stampOf(m.createdAt)}, ${m.authorName} (${label(m.party)}), ${outcome(m)} :\n${markupToPlain(m.body).trim() || "(sans texte)"}`).join("\n\n");
    const row = ws.addRow({
      ref: q.ref,
      subject: q.subject,
      body: clip(markupToPlain(q.body)),
      streams: q.streamIds.map((s) => streamName.get(s) ?? "").filter(Boolean).join(", "),
      askedBy: `${q.askedBy.name || "Utilisateur supprimé"} (${label(q.askedByParty)})`,
      createdAt: local(q.createdAt),
      assigned: q.status === "CLOSED" ? "" : label(q.assignedParty),
      status: STATUS[q.status] ?? q.status,
      due: day(q.dueDate),
      thread: clip(thread),
      answer: "",
      target: "",
      id: q.id,
      version: new Date(q.lastActivityAt).toISOString(),
    });
    const closed = q.status === "CLOSED";
    row.font = { name: "Inter", size: 10, color: { argb: closed ? "FF94A3B8" : "FF0F172A" } };
    row.alignment = { vertical: "top", wrapText: true };
    for (const k of ["answer", "target"] as const) {
      const cell = row.getCell(k);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: closed ? CLOSED_FILL : ANSWER_FILL } };
      cell.font = { name: "Inter", size: 10, color: { argb: "FF0F172A" } };
      cell.border = { left: { style: "thin", color: { argb: "FFE2E8F0" } }, bottom: { style: "thin", color: { argb: "FFE2E8F0" } } };
    }
    if (!closed && q.dueDate && q.dueDate < today) row.getCell("due").font = { name: "Inter", size: 10, bold: true, color: { argb: "FFEF4444" } };
  }
  // liste de choix de « Nouvel attribué » : une seule règle pour toute la colonne (des règles qui se chevauchent abîment le fichier)
  const targetCol = NAVETTE_COLUMNS.findIndex((c) => c.key === "target") + 1;
  if (validation && rows.length) {
    const letter = ws.getColumn(targetCol).letter;
    (ws as unknown as { dataValidations: { add: (range: string, v: ExcelJS.DataValidation) => void } }).dataValidations.add(`${letter}${HEADER_ROW + 1}:${letter}${HEADER_ROW + rows.length}`, {
      type: "list",
      allowBlank: true,
      formulae: [validation],
      showErrorMessage: true,
      errorTitle: "Nouvel attribué",
      error: `Choisissez ${names.join(", ")} ou laissez vide.`,
    });
  }
  ws.getColumn("createdAt").numFmt = "dd/mm/yyyy";
  ws.getColumn("due").numFmt = "dd/mm/yyyy";
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: HEADER_ROW }];
  // impression : paysage, toute la largeur sur une page, en-tête du tableau répété
  ws.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${HEADER_ROW}:${HEADER_ROW}` };
  ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: last } };

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const stamp = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }).replace(/-/g, "");
  return { buffer, filename: `WiBridge_${ctx.client.slug}_fiche_navette_${stamp}.xlsx` };
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && "richText" in v) return v.richText.map((r) => r.text).join("");
  if (typeof v === "object" && "result" in v) return v.result === undefined || v.result === null ? "" : String(v.result);
  return cell.text ?? "";
}

/** Relit une fiche navette : lignes avec identifiant ou numéro, réponse et nouvel attribué. */
export async function readNavette(buffer: Buffer, ctx: Bridge.BridgeCtx): Promise<Bridge.NavetteRow[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new HttpError(400, "Fichier illisible : importez la fiche navette exportée par WiBridge, au format Excel (.xlsx).");
  }
  const wanted = { ref: norm("Réf."), id: "id", version: "version", answer: norm("Votre réponse"), target: norm("Nouvel attribué") };
  for (const ws of wb.worksheets) {
    for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
      const cols: Partial<Record<keyof typeof wanted, number>> = {};
      ws.getRow(r).eachCell((cell, c) => {
        const t = norm(cellText(cell));
        for (const [k, v] of Object.entries(wanted) as [keyof typeof wanted, string][]) if (t === v && cols[k] === undefined) cols[k] = c;
      });
      if (cols.answer === undefined || cols.target === undefined) continue;
      const rows: Bridge.NavetteRow[] = [];
      for (let i = r + 1; i <= ws.rowCount; i++) {
        const row = ws.getRow(i);
        const get = (k: keyof typeof wanted) => (cols[k] ? cellText(row.getCell(cols[k]!)).trim() : "");
        const id = get("id");
        const refText = get("ref").replace(/^n°\s*/i, "").replace(/^#/, "");
        const ref = /^\d{1,7}$/.test(refText) ? Number(refText) : null;
        if (!id && !ref) continue;
        const targetText = get("target");
        const t = Bridge.parseNavetteTarget(ctx, targetText);
        rows.push({ line: i, id: id || null, ref, version: get("version") || null, body: cols.answer ? cellText(row.getCell(cols.answer)) : "", target: t.target, targetText, targetError: t.error });
      }
      return rows;
    }
  }
  throw new HttpError(400, "Ce fichier n'est pas une fiche navette WiBridge : colonnes « Votre réponse » et « Nouvel attribué » introuvables.");
}
