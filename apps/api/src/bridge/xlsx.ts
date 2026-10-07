import ExcelJS from "exceljs";
import { Bridge, markupToPlain } from "@wacman/core";

/** Export Excel des questions visibles : un onglet Questions (une ligne par question), un onglet Échanges. */

const HEADER_FILL = "FF004968";
const STATUS: Record<string, string> = { OPEN: "À traiter", IN_PROGRESS: "En cours", CLOSED: "Clôturée" };

function style(ws: ExcelJS.Worksheet) {
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Inter", size: 10 };
  h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  h.alignment = { vertical: "middle", wrapText: true };
  h.height = 28;
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  ws.eachRow((row, i) => {
    if (i === 1) return;
    row.alignment = { vertical: "top", wrapText: true };
    row.font = { name: "Inter", size: 10 };
  });
}

const day = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`) : null);
// date et heure de Paris, sans fuseau (Excel n'en gère pas)
const local = (d: Date | null) => (d ? new Date(`${d.toLocaleString("sv-SE", { timeZone: "Europe/Paris" }).replace(" ", "T")}Z`) : null);

export async function buildBridgeWorkbook(ctx: Bridge.BridgeCtx, status: "open" | "closed" | "all") {
  const { list, messages } = await Bridge.exportRows(ctx);
  const rows = list.filter((q) => status === "all" || (status === "closed" ? q.status === "CLOSED" : q.status !== "CLOSED")).sort((a, b) => a.ref - b.ref);
  const label = (p: Bridge.Party | null | undefined) => Bridge.partyLabel(ctx.client, p);
  const streamName = new Map(ctx.streams.map((s) => [s.id, s.name]));
  const wb = new ExcelJS.Workbook();
  wb.creator = "WiBridge";
  const ws = wb.addWorksheet("Questions");
  ws.columns = [
    { header: "Réf.", key: "ref", width: 7 },
    { header: "Sujet", key: "subject", width: 36 },
    { header: "Question", key: "body", width: 60 },
    { header: "Streams", key: "streams", width: 26 },
    { header: "Posée par", key: "askedBy", width: 20 },
    { header: "Organisation", key: "askedParty", width: 14 },
    { header: "Posée le", key: "createdAt", width: 17 },
    { header: "Attribuée à", key: "assigned", width: 14 },
    { header: "Statut", key: "status", width: 12 },
    { header: "Échéance", key: "due", width: 12 },
    { header: "Échanges", key: "count", width: 10 },
    { header: "Dernier message", key: "last", width: 60 },
    { header: "Dernier message de", key: "lastBy", width: 24 },
    { header: "Dernier message le", key: "lastAt", width: 17 },
    { header: "Clôturée le", key: "closedAt", width: 17 },
  ];
  const byQuestion = new Map<string, typeof messages>();
  for (const m of messages) byQuestion.set(m.questionId, [...(byQuestion.get(m.questionId) ?? []), m]);
  for (const q of rows) {
    const ms = byQuestion.get(q.id) ?? [];
    const last = ms[ms.length - 1];
    ws.addRow({
      ref: q.ref,
      subject: q.subject,
      body: markupToPlain(q.body),
      streams: q.streamIds.map((s) => streamName.get(s) ?? "").filter(Boolean).join(", "),
      askedBy: q.askedBy.name,
      askedParty: label(q.askedByParty),
      createdAt: local(q.createdAt),
      assigned: q.status === "CLOSED" ? "" : label(q.assignedParty),
      status: STATUS[q.status] ?? q.status,
      due: day(q.dueDate),
      count: ms.length,
      last: last ? markupToPlain(last.body) : "",
      lastBy: last ? `${last.authorName} (${label(last.party)})` : "",
      lastAt: last ? local(last.createdAt) : null,
      closedAt: local(q.closedAt),
    });
  }
  for (const k of ["createdAt", "lastAt", "closedAt"]) ws.getColumn(k).numFmt = "dd/mm/yyyy hh:mm";
  ws.getColumn("due").numFmt = "dd/mm/yyyy";
  style(ws);

  const wm = wb.addWorksheet("Échanges");
  wm.columns = [
    { header: "Réf.", key: "ref", width: 7 },
    { header: "Sujet", key: "subject", width: 32 },
    { header: "Date", key: "at", width: 17 },
    { header: "Organisation", key: "party", width: 14 },
    { header: "Auteur", key: "author", width: 20 },
    { header: "Issue", key: "outcome", width: 26 },
    { header: "Message", key: "body", width: 80 },
  ];
  const ids = new Set(rows.map((q) => q.id));
  const subjectOf = new Map(rows.map((q) => [q.id, q]));
  for (const m of messages) {
    if (!ids.has(m.questionId)) continue;
    const q = subjectOf.get(m.questionId)!;
    const outcome =
      m.outcome === "CLOSE"
        ? "Clôture"
        : m.outcome === "REOPEN"
          ? `Réouverture, attribuée à ${label(m.assignedAfter)}`
          : m.assignedAfter === m.assignedBefore
            ? `Attribution conservée (${label(m.assignedAfter)})`
            : `Attribuée à ${label(m.assignedAfter)}`;
    wm.addRow({ ref: q.ref, subject: q.subject, at: local(m.createdAt), party: label(m.party), author: m.authorName, outcome, body: markupToPlain(m.body) });
  }
  wm.getColumn("at").numFmt = "dd/mm/yyyy hh:mm";
  style(wm);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const stamp = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }).replace(/-/g, "");
  return { buffer, filename: `WiBridge_${ctx.client.slug}_questions_${stamp}.xlsx` };
}
