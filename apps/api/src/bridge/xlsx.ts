import ExcelJS from "exceljs";
import { Bridge, HttpError, markupToPlain } from "@wacman/core";

/**
 * Fiche navette Excel, pensée pour l'organisation qui la reçoit : un seul onglet, les questions regroupées par stream
 * (bandeau de couleur), l'échéance mise en évidence, puis la question, les derniers échanges et la cellule de réponse
 * juste à côté (« Votre réponse », « Nouveau statut », seules cellules modifiables). En bas, la partie « Nouvelles
 * questions » offre des lignes vides pour en poser de nouvelles. Le fichier se réimporte dans WiBridge (`readNavette`) :
 * deux colonnes cachées portent l'identifiant de la question et sa dernière activité.
 */

export interface NavetteFilters {
  status: "open" | "closed" | "all";
  assigned: "all" | Bridge.Party;
  stream: string | null;
}

const FONT = "Calibri";
const PETROL = "FF004968";
const ANSWER_HEAD = "FFB45309";
const ANSWER_FILL = "FFFFF7D6";
const ANSWER_BORDER = "FFF59E0B";
const CLOSED_FILL = "FFF1F5F9";
const GRID = "FFE2E8F0";
const HEADER_ROW = 6;
/** Colonnes dont le contenu est centré dans la cellule. */
const CENTERED = new Set<string>(["ref", "stream", "due", "assigned"]);
/** Lignes vides proposées pour de nouvelles questions, et cellules à remplir sur ces lignes. */
const NEW_ROWS = 20;
const NEW_EDITABLE = new Set<string>(["stream", "due", "assigned", "question", "askedBy"]);
// couleurs des streams (fond clair de la cellule, bandeau foncé), dans l'ordre des streams du client
const STREAM_COLORS = [
  ["FFDBEAFE", "FF1D4ED8"],
  ["FFCCFBF1", "FF0F766E"],
  ["FFEDE9FE", "FF6D28D9"],
  ["FFFEF3C7", "FFB45309"],
  ["FFFFE4E6", "FFBE123C"],
  ["FFDCFCE7", "FF15803D"],
  ["FFCFFAFE", "FF0E7490"],
  ["FFE2E8F0", "FF334155"],
];

/** Colonnes : les titres de la réponse et des colonnes cachées servent aussi à relire le fichier. */
export const NAVETTE_COLUMNS = [
  { key: "ref", header: "N°", width: 6 },
  { key: "stream", header: "Stream", width: 16 },
  { key: "due", header: "Échéance", width: 13 },
  { key: "assigned", header: "À traiter par", width: 12 },
  { key: "question", header: "Question", width: 52 },
  { key: "thread", header: "Derniers échanges", width: 42 },
  { key: "answer", header: "Votre réponse", width: 56 },
  { key: "target", header: "Nouveau statut", width: 22 },
  { key: "askedBy", header: "Posée par", width: 20 },
  { key: "id", header: "ID", width: 38, hidden: true },
  { key: "version", header: "Version", width: 26, hidden: true },
] as const;
type Key = (typeof NAVETTE_COLUMNS)[number]["key"];
const col = (k: Key) => NAVETTE_COLUMNS.findIndex((c) => c.key === k) + 1;
const width = (k: Key) => NAVETTE_COLUMNS.find((c) => c.key === k)!.width;
const LAST_VISIBLE = NAVETTE_COLUMNS.filter((c) => !("hidden" in c)).length;

const day = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`) : null);
const shortOf = (d: Date | string) => new Date(d).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
/** Texte propre pour une cellule : sans caractères invisibles, sans lignes vides ni puces vides au début ou à la fin, deux sauts de ligne au plus d'affilée. */
const tidy = (s: string) => {
  const lines = s
    .replace(/[\u200b-\u200d\u2060\ufeff\u00ad]/g, "")
    .replace(/\r\n?|[\u000b\u000c\u2028\u2029]/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""));
  while (lines.length && /^\s*(?:[-*•☐☑])?$/.test(lines[lines.length - 1])) lines.pop();
  while (lines.length && !lines[0].trim()) lines.shift();
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
};
/** Nombre de lignes affichées d'un texte dans une colonne (estimation, pour régler la hauteur des lignes). */
const linesOf = (text: string, w: number) => text.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / (w * 1.15))), 0);
const thin = (argb: string) => ({ style: "thin" as const, color: { argb } });

export async function buildNavetteWorkbook(ctx: Bridge.BridgeCtx, filters: NavetteFilters) {
  const { list, messages } = await Bridge.exportRows(ctx);
  const label = (p: Bridge.Party | null | undefined) => Bridge.partyLabel(ctx.client, p);
  const order = new Map(ctx.streams.map((s, i) => [s.id, i]));
  const streamOf = new Map(ctx.streams.map((s) => [s.id, s]));
  const rows = list
    .filter((q) => filters.status === "all" || (filters.status === "closed" ? q.status === "CLOSED" : q.status !== "CLOSED"))
    .filter((q) => filters.assigned === "all" || (q.status !== "CLOSED" && q.assignedParty === filters.assigned))
    .filter((q) => !filters.stream || q.streamIds.includes(filters.stream));
  // regroupement par stream (le premier de la question dans l'ordre du client), puis par échéance, puis par numéro
  const main = (q: (typeof rows)[number]) => [...q.streamIds].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99))[0] ?? "";
  rows.sort((a, b) => (order.get(main(a)) ?? 99) - (order.get(main(b)) ?? 99) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.ref - b.ref);
  const byQuestion = new Map<string, typeof messages>();
  for (const m of messages) byQuestion.set(m.questionId, [...(byQuestion.get(m.questionId) ?? []), m]);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const soon = new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const colorOf = (sid: string) => STREAM_COLORS[(order.get(sid) ?? 0) % STREAM_COLORS.length];

  const wb = new ExcelJS.Workbook();
  const title = `Fiche navette ${ctx.client.providerName} - ${ctx.client.clientName}`;
  wb.creator = ctx.client.providerName;
  wb.title = title;
  const ws = wb.addWorksheet("Fiche navette", { properties: { defaultRowHeight: 16 }, views: [{ state: "frozen", ySplit: HEADER_ROW, showGridLines: false }] });
  ws.columns = NAVETTE_COLUMNS.map((c) => ({ key: c.key, width: c.width, hidden: "hidden" in c ? c.hidden : false }));

  // ---- en-tête de la fiche : titre, situation, repères, mode d'emploi
  const counts = new Map<string, number>();
  for (const q of rows) counts.set(main(q), (counts.get(main(q)) ?? 0) + 1);
  const late = rows.filter((q) => q.status !== "CLOSED" && q.dueDate && q.dueDate < today).length;
  const choices = Bridge.navetteStatusChoices(ctx.client);
  const plural = rows.length > 1 ? "s" : "";
  const what = [
    `${rows.length} question${plural}${filters.status === "open" ? ` ouverte${plural}` : filters.status === "closed" ? ` clôturée${plural}` : ""}`,
    filters.assigned !== "all" ? `à traiter par ${label(filters.assigned)}` : "",
    filters.stream ? `stream ${streamOf.get(filters.stream)?.name ?? ""}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const top: [string, Partial<ExcelJS.Font>, number][] = [
    [title, { size: 16, bold: true, color: { argb: PETROL } }, 26],
    [`Situation au ${new Date().toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })} : ${what}.`, { size: 10, color: { argb: "FF475569" } }, 16],
    [
      `Par stream : ${[...counts].map(([sid, n]) => `${streamOf.get(sid)?.name ?? "sans stream"} ${n}`).join(", ") || "aucune question"}.${late ? ` Échéances dépassées : ${late}.` : ""} Échéance en rouge si elle est dépassée, en orange si elle tombe dans les 7 jours.`,
      { size: 10, color: { argb: "FF475569" } },
      16,
    ],
    [
      `Pour répondre : 1. écrivez votre réponse dans la cellule jaune « Votre réponse » (Alt+Entrée sur Windows, Ctrl+Option+Entrée sur Mac pour aller à la ligne) ; 2. choisissez la suite dans « Nouveau statut » (${choices.join(", ").replace(/, (?=[^,]*$)/, " ou ")} ; laissé vide, la question est renvoyée à l'autre organisation) . Pour poser une question : remplissez une ligne de la partie « Nouvelles questions », en bas du tableau (stream, échéance si besoin, organisation qui doit répondre, question avec son sujet en première ligne, votre nom). Enfin, renvoyez le fichier à votre contact. Seules les cellules jaunes sont modifiables.`,
      { size: 10, bold: true, color: { argb: "FF0F172A" } },
      44,
    ],
  ];
  top.forEach(([text, font, height], i) => {
    const r = i + 1;
    ws.mergeCells(r, 1, r, LAST_VISIBLE);
    const c = ws.getCell(r, 1);
    c.value = text;
    c.font = { name: FONT, ...font };
    c.alignment = { wrapText: true, vertical: "middle" };
    ws.getRow(r).height = height;
  });
  ws.getCell(4, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ANSWER_FILL } };
  ws.getCell(4, 1).border = { left: { style: "medium", color: { argb: ANSWER_BORDER } } };
  ws.getRow(5).height = 8;

  // ---- titres des colonnes
  const head = ws.getRow(HEADER_ROW);
  NAVETTE_COLUMNS.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    const answer = c.key === "answer" || c.key === "target";
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: answer ? ANSWER_HEAD : PETROL } };
    cell.alignment = { vertical: "middle", horizontal: CENTERED.has(c.key) ? "center" : "left", wrapText: true };
    cell.border = { right: thin("FF0B5A7A") };
  });
  head.height = 22;

  // ---- questions, par stream
  let current: string | null = null;
  let firstData = 0;
  let lastData = 0;
  for (const q of rows) {
    const sid = main(q);
    const [light, strong] = colorOf(sid);
    if (sid !== current) {
      current = sid;
      const st = streamOf.get(sid);
      const band = ws.addRow({});
      ws.mergeCells(band.number, 1, band.number, LAST_VISIBLE);
      const c = band.getCell(1);
      const n = counts.get(sid) ?? 0;
      c.value = `${st?.emoji ? `${st.emoji} ` : ""}${st?.name ?? "Sans stream"} : ${n} question${n > 1 ? "s" : ""}`;
      c.font = { name: FONT, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: strong } };
      c.alignment = { vertical: "middle", indent: 1 };
      band.height = 20;
    }
    const ms = byQuestion.get(q.id) ?? [];
    const shown = ms.slice(-3);
    const thread = [
      ...(ms.length > shown.length ? [`(${ms.length - shown.length} échange${ms.length - shown.length > 1 ? "s" : ""} plus ancien${ms.length - shown.length > 1 ? "s" : ""})`] : []),
      ...shown.map((m) => `${shortOf(m.createdAt)}, ${m.authorName} (${label(m.party)}) :\n${clip(tidy(markupToPlain(m.body)) || "(pièce jointe)", 500)}`),
    ].join("\n\n");
    const others = q.streamIds.filter((x) => x !== sid).map((x) => streamOf.get(x)?.name ?? "");
    const subject = tidy(q.subject).replace(/\s*\n\s*/g, " ");
    const body = clip(tidy(markupToPlain(q.body)), 3000);
    const closed = q.status === "CLOSED";
    const overdue = !closed && !!q.dueDate && q.dueDate < today;
    const near = !closed && !!q.dueDate && !overdue && q.dueDate <= soon;
    const row = ws.addRow({
      ref: q.ref,
      stream: [streamOf.get(sid)?.name ?? "", ...others.map((o) => `+ ${o}`)].join("\n"),
      due: q.dueDate ? day(q.dueDate) : "Aucune",
      assigned: closed ? "Clôturée" : `${label(q.assignedParty)}${q.status === "IN_PROGRESS" ? "\n(en cours)" : ""}`,
      question: { richText: [{ text: subject, font: { name: FONT, size: 11, bold: true, color: { argb: closed ? "FF64748B" : "FF0F172A" } } }, ...(body ? [{ text: `\n${body}`, font: { name: FONT, size: 10, color: { argb: closed ? "FF94A3B8" : "FF334155" } } }] : [])] },
      thread: thread || "Aucun échange.",
      answer: "",
      target: "",
      askedBy: `${q.askedBy.name || "Utilisateur supprimé"} (${label(q.askedByParty)})\nle ${new Date(q.createdAt).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}`,
      id: q.id,
      version: new Date(q.lastActivityAt).toISOString(),
    });
    if (!firstData) firstData = row.number;
    lastData = row.number;
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      // la question porte ses polices dans le texte enrichi (sujet en gras, texte en dessous)
      if (c !== col("question")) cell.font = { name: FONT, size: 10, color: { argb: closed ? "FF94A3B8" : "FF334155" } };
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = { bottom: thin(GRID) };
    });
    row.getCell("ref").font = { name: FONT, size: 11, bold: true, color: { argb: closed ? "FF94A3B8" : PETROL } };
    row.getCell("ref").alignment = { vertical: "top", horizontal: "center" };
    for (const k of ["stream", "due", "assigned"] as const) row.getCell(k).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    const stc = row.getCell("stream");
    stc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: light } };
    stc.font = { name: FONT, size: 10, bold: true, color: { argb: strong } };
    const due = row.getCell("due");
    due.numFmt = "dd/mm/yyyy";
    if (!q.dueDate) due.font = { name: FONT, size: 10, italic: true, color: { argb: "FF94A3B8" } };
    else if (overdue) due.font = { name: FONT, size: 10, bold: true, color: { argb: "FFDC2626" } };
    else if (near) due.font = { name: FONT, size: 10, bold: true, color: { argb: "FFEA580C" } };
    else due.font = { name: FONT, size: 10, bold: true, color: { argb: closed ? "FF94A3B8" : "FF0F172A" } };
    const as = row.getCell("assigned");
    if (!closed) as.font = { name: FONT, size: 10, bold: true, color: { argb: q.assignedParty === "PROVIDER" ? "FF1D4ED8" : "FFB45309" } };
    row.getCell("thread").font = { name: FONT, size: 9, color: { argb: "FF64748B" } };
    // cellules à remplir : jaunes, encadrées, seules modifiables
    for (const k of ["answer", "target"] as const) {
      const cell = row.getCell(k);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: closed ? CLOSED_FILL : ANSWER_FILL } };
      cell.font = { name: FONT, size: 11, color: { argb: "FF0F172A" } };
      cell.border = { top: thin(ANSWER_BORDER), bottom: thin(ANSWER_BORDER), left: thin(ANSWER_BORDER), right: thin(ANSWER_BORDER) };
      cell.protection = { locked: false };
    }
    row.getCell("target").alignment = { vertical: "top", horizontal: "center", wrapText: true };
    // hauteur : le texte le plus long, avec au moins quatre lignes pour écrire la réponse
    const lines = Math.max(
      linesOf(body ? `${subject}\n${body}` : subject, width("question")),
      linesOf(thread, width("thread") * 1.1),
      linesOf(row.getCell("stream").value as string, width("stream")),
      4,
    );
    row.height = Math.min(400, lines * 13 + 8);
  }
  if (!rows.length) {
    const r = ws.addRow({});
    ws.mergeCells(r.number, 1, r.number, LAST_VISIBLE);
    r.getCell(1).value = "Aucune question avec les filtres choisis.";
    r.getCell(1).font = { name: FONT, size: 11, italic: true, color: { argb: "FF64748B" } };
  }

  // ---- nouvelles questions : lignes vides à remplir par la personne qui reçoit la fiche
  const band = ws.addRow({});
  ws.mergeCells(band.number, 1, band.number, LAST_VISIBLE);
  const bc = band.getCell(1);
  bc.value = "➕ Nouvelles questions : une par ligne, dans les cellules jaunes. Le sujet sur la première ligne de la question, le détail ensuite.";
  bc.font = { name: FONT, size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  bc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ANSWER_HEAD } };
  bc.alignment = { vertical: "middle", indent: 1 };
  band.height = 20;
  const firstNew = band.number + 1;
  for (let i = 0; i < NEW_ROWS; i++) {
    const row = ws.addRow({});
    for (const c of NAVETTE_COLUMNS) {
      if ("hidden" in c) continue;
      const cell = row.getCell(c.key);
      const editable = NEW_EDITABLE.has(c.key);
      cell.font = { name: FONT, size: c.key === "question" ? 11 : 10, color: { argb: "FF0F172A" } };
      cell.alignment = CENTERED.has(c.key) ? { vertical: "middle", horizontal: "center", wrapText: true } : { vertical: "top", wrapText: true };
      if (editable) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ANSWER_FILL } };
        cell.border = { top: thin(ANSWER_BORDER), bottom: thin(ANSWER_BORDER), left: thin(ANSWER_BORDER), right: thin(ANSWER_BORDER) };
        cell.protection = { locked: false };
      } else {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CLOSED_FILL } };
        cell.border = { bottom: thin(GRID) };
      }
    }
    row.getCell("due").numFmt = "dd/mm/yyyy";
    row.height = 48;
  }
  const lastNew = firstNew + NEW_ROWS - 1;

  // listes de choix et aides à la saisie : une seule règle par plage (des règles qui se chevauchent abîment le fichier)
  const validations = (ws as unknown as { dataValidations: { add: (range: string, v: ExcelJS.DataValidation) => void } }).dataValidations;
  const range = (k: Key, from: number, to: number) => `${ws.getColumn(col(k)).letter}${from}:${ws.getColumn(col(k)).letter}${to}`;
  const listable = (names: string[]) => names.every((n) => !/[,"]/.test(n)) && names.join(",").length < 250;
  const streamNames = ctx.streams.filter((st) => st.active).map((st) => st.name);
  const parties = [ctx.client.providerName, ctx.client.clientName];
  validations.add(range("stream", firstNew, lastNew), {
    ...(listable(streamNames) ? { type: "list" as const, formulae: [`"${streamNames.join(",")}"`] } : { type: "textLength" as const, operator: "lessThanOrEqual" as const, formulae: [1000] }),
    allowBlank: true,
    showErrorMessage: listable(streamNames),
    errorTitle: "Stream",
    error: "Choisissez un stream dans la liste.",
    showInputMessage: true,
    promptTitle: "Stream",
    prompt: "Stream concerné par la question.",
  });
  validations.add(range("due", firstNew, lastNew), {
    type: "date",
    operator: "greaterThan",
    formulae: [new Date(Date.UTC(2000, 0, 1))],
    allowBlank: true,
    showErrorMessage: true,
    errorTitle: "Échéance",
    error: "Saisissez une date (jj/mm/aaaa) ou laissez vide.",
    showInputMessage: true,
    promptTitle: "Échéance",
    prompt: "Date de réponse attendue (jj/mm/aaaa), facultative.",
  });
  if (listable(parties))
    validations.add(range("assigned", firstNew, lastNew), {
      type: "list",
      formulae: [`"${parties.join(",")}"`],
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: "À traiter par",
      error: `Choisissez ${parties.join(" ou ")}, ou laissez vide.`,
      showInputMessage: true,
      promptTitle: "À traiter par",
      prompt: `Organisation qui doit répondre. Laissé vide : ${ctx.client.providerName}.`,
    });
  validations.add(range("question", firstNew, lastNew), {
    type: "textLength",
    operator: "lessThanOrEqual",
    formulae: [20000],
    allowBlank: true,
    showInputMessage: true,
    promptTitle: "Question",
    prompt: "Le sujet sur la première ligne, le détail ensuite (Alt+Entrée sur Windows, Ctrl+Option+Entrée sur Mac pour aller à la ligne).",
  });
  validations.add(range("askedBy", firstNew, lastNew), {
    type: "textLength",
    operator: "lessThanOrEqual",
    formulae: [120],
    allowBlank: true,
    showInputMessage: true,
    promptTitle: "Posée par",
    prompt: "Votre nom, facultatif.",
  });
  if (firstData && choices.every((n) => !/[,"]/.test(n))) {
    validations.add(range("target", firstData, lastData), {
      type: "list",
      allowBlank: true,
      formulae: [`"${choices.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "Nouveau statut",
      error: `Choisissez ${choices.join(", ")} ou laissez vide.`,
      showInputMessage: true,
      promptTitle: "Nouveau statut",
      prompt: `${choices.join(", ")}. Laissé vide : la question est renvoyée à l'autre organisation.`,
    });
  }
  // impression : paysage, largeur sur une page, titres des colonnes répétés
  ws.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${HEADER_ROW}:${HEADER_ROW}`, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } };
  ws.headerFooter = { oddFooter: `&L${title}&RPage &P sur &N` };
  // feuille protégée sans mot de passe : seules les cellules jaunes se modifient ; lignes et colonnes restent ajustables,
  // et l'on peut insérer des lignes (par exemple pour poser plus de questions)
  await ws.protect("", { selectLockedCells: true, selectUnlockedCells: true, formatRows: true, formatColumns: true, insertRows: true, formatCells: false, sort: false, autoFilter: false });

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const stamp = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  return { buffer, filename: `${title} ${stamp}.xlsx` };
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

/** Relit une fiche navette : lignes avec identifiant ou numéro (réponse et nouveau statut), puis nouvelles questions (lignes sans numéro avec un texte de question). */
export async function readNavette(buffer: Buffer, ctx: Bridge.BridgeCtx): Promise<Bridge.NavetteRow[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new HttpError(400, "Fichier illisible : importez la fiche navette exportée par WiBridge, au format Excel (.xlsx).");
  }
  const wanted = {
    ref: norm("Réf."),
    id: "id",
    version: "version",
    answer: norm("Votre réponse"),
    target: norm("Nouveau statut"),
    question: norm("Question"),
    stream: norm("Stream"),
    due: norm("Échéance"),
    assigned: norm("À traiter par"),
    askedBy: norm("Posée par"),
  };
  const targetAliases = new Set([norm("Nouveau statut"), norm("Nouvel attribué")]); // fiches exportées avant la V1.8
  const refAliases = new Set([norm("Réf."), norm("N°"), "numero", "no"]);
  for (const ws of wb.worksheets) {
    for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
      const cols: Partial<Record<keyof typeof wanted, number>> = {};
      ws.getRow(r).eachCell((cell, c) => {
        const t = norm(cellText(cell));
        for (const [k, v] of Object.entries(wanted) as [keyof typeof wanted, string][]) if ((t === v || (k === "ref" && refAliases.has(t)) || (k === "target" && targetAliases.has(t))) && cols[k] === undefined) cols[k] = c;
      });
      if (cols.answer === undefined || cols.target === undefined) continue;
      const rows: Bridge.NavetteRow[] = [];
      for (let i = r + 1; i <= ws.rowCount; i++) {
        const row = ws.getRow(i);
        const get = (k: keyof typeof wanted) => (cols[k] ? cellText(row.getCell(cols[k]!)).trim() : "");
        const id = get("id");
        const refText = get("ref").replace(/^n°\s*/i, "").replace(/^#/, "");
        const ref = /^\d{1,7}$/.test(refText) ? Number(refText) : null;
        if (!id && !ref) {
          // nouvelle question : ligne sans numéro dont la cellule Question est remplie (les bandeaux fusionnés sont ignorés)
          const qc = cols.question ? row.getCell(cols.question) : null;
          if (!qc || qc.isMerged) continue;
          const text = cellText(qc).trim();
          if (!text) continue;
          rows.push({
            line: i,
            id: null,
            ref: null,
            version: null,
            body: "",
            target: null,
            newQuestion: { text, streams: get("stream"), due: get("due"), assigned: get("assigned"), askedBy: get("askedBy") },
          });
          continue;
        }
        const targetText = get("target");
        const t = Bridge.parseNavetteTarget(ctx, targetText);
        rows.push({ line: i, id: id || null, ref, version: get("version") || null, body: cols.answer ? cellText(row.getCell(cols.answer)) : "", target: t.target, targetText, targetError: t.error });
      }
      return rows;
    }
  }
  throw new HttpError(400, "Ce fichier n'est pas une fiche navette WiBridge : colonnes « Votre réponse » et « Nouveau statut » introuvables.");
}
