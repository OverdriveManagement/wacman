import ExcelJS from "exceljs";
import { listMeetings, notFound, type Ctx } from "@wacman/core";
import { loadAccountData, plain, frDate } from "./data.js";

const HEADER_FILL = "FF004968"; // bleu pétrole Wifirst
const ALERT_FILL: Record<string, string> = { red: "FFFDE2E2", amber: "FFFEF3C7" };

function styleSheet(ws: ExcelJS.Worksheet) {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Inter", size: 10 };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  header.alignment = { vertical: "middle", wrapText: true };
  header.height = 28;
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  ws.eachRow((row, i) => {
    if (i === 1) return;
    row.alignment = { vertical: "top", wrapText: true };
    row.font = { name: "Inter", size: 10 };
  });
}

const stamp = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");

export async function buildCardsWorkbook(ctx: Ctx, sprintId?: string) {
  const d = await loadAccountData(ctx);
  const cards = await d.cards(sprintId);
  const wb = new ExcelJS.Workbook();
  wb.creator = "WacMan";
  const ws = wb.addWorksheet("Cartes");
  ws.columns = [
    { header: "Réf.", key: "ref", width: 7 },
    { header: "Livrable", key: "title", width: 40 },
    { header: "Stream", key: "stream", width: 24 },
    { header: "Statut", key: "status", width: 12 },
    { header: "Vigilance / Alerte", key: "alert", width: 15 },
    { header: "Porteur", key: "owner", width: 18 },
    { header: "Sprint", key: "sprint", width: 10 },
    { header: "Échéance", key: "due", width: 12 },
    { header: "Avancement %", key: "pct", width: 12 },
    { header: "Description", key: "description", width: 50 },
    { header: "Point d'avancement", key: "progress", width: 50 },
    { header: "Prochaines étapes", key: "next", width: 50 },
    { header: "Alertes / arbitrages", key: "alerts", width: 50 },
    { header: "Mis à jour", key: "updated", width: 16 },
  ];
  for (const c of cards) {
    const row = ws.addRow({
      ref: c.ref,
      title: c.title,
      stream: d.streamLabel(c.streamId, false),
      status: d.optLabel(c.statusId, false),
      alert: d.optLabel(c.alertLevelId, false),
      owner: d.contactName(c.ownerId),
      sprint: d.sprintName(c.sprintId),
      due: c.dueDate ? new Date(`${c.dueDate}T00:00:00Z`) : null,
      pct: c.progressPct,
      description: plain(c.description),
      progress: plain(c.progressNote),
      next: plain(c.nextSteps),
      alerts: plain(c.alertsNote),
      updated: c.updatedAt,
    });
    row.getCell("due").numFmt = "dd/mm/yyyy";
    row.getCell("updated").numFmt = "dd/mm/yyyy hh:mm";
    const color = c.alertLevelId ? d.opt.get(c.alertLevelId)?.color : undefined;
    if (color && ALERT_FILL[color]) row.getCell("alert").fill = { type: "pattern", pattern: "solid", fgColor: { argb: ALERT_FILL[color] } };
  }
  styleSheet(ws);
  const sprint = sprintId ? d.sprintName(sprintId) : "tous-sprints";
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), filename: `${stamp()}_${d.account.slug}_cartes_${sprint.replace(/\s+/g, "-")}.xlsx` };
}

export async function buildMeetingsWorkbook(ctx: Ctx, meetingTypeId: string) {
  const d = await loadAccountData(ctx);
  const type = d.meetingTypes.find((m) => m.id === meetingTypeId);
  if (!type) throw notFound("Type de séance introuvable.");
  const meetings = await listMeetings(ctx, meetingTypeId);
  const st = (type.settings ?? {}) as Record<string, string>;
  const wb = new ExcelJS.Workbook();
  wb.creator = "WacMan";
  if (type.blocks.includes("HIGHLIGHTS")) {
    const ws = wb.addWorksheet("Faits marquants");
    ws.columns = [
      { header: "Séance", key: "date", width: 12 },
      { header: "Fait marquant", key: "title", width: 40 },
      { header: "Stream", key: "stream", width: 24 },
      { header: "Type", key: "type", width: 16 },
      { header: "Détail", key: "detail", width: 80 },
    ];
    for (const m of meetings)
      for (const h of m.highlights)
        ws.addRow({ date: frDate(m.date), title: `${h.emoji ? h.emoji + " " : ""}${h.title}`, stream: d.streamLabel(h.streamId, false), type: d.optLabel(h.typeId, false), detail: plain(h.detail) });
    styleSheet(ws);
  }
  if (type.blocks.includes("STREAM_STATUS")) {
    const ws = wb.addWorksheet("Statut des streams");
    ws.columns = [
      { header: "Séance", key: "date", width: 12 },
      { header: "Stream", key: "stream", width: 26 },
      { header: st.statusLabel ?? "Statut", key: "status", width: 26 },
      { header: st.progressLabel ?? "Avancement", key: "progress", width: 60 },
      { header: st.alertsLabel ?? "Alertes & prérequis", key: "alerts", width: 60 },
    ];
    for (const m of meetings)
      for (const s of m.statuses)
        ws.addRow({ date: frDate(m.date), stream: d.streamLabel(s.streamId, false), status: s.statusIds.map((id) => d.optLabel(id, false)).join(", "), progress: plain(s.progress), alerts: plain(s.alerts) });
    styleSheet(ws);
  }
  if (type.blocks.includes("TOPICS")) {
    const ws = wb.addWorksheet("Sujets");
    ws.columns = [
      { header: "Séance", key: "date", width: 12 },
      { header: "Ordre", key: "order", width: 7 },
      { header: "Sujet", key: "title", width: 36 },
      { header: "Thématique", key: "theme", width: 13 },
      { header: "Nature", key: "nature", width: 13 },
      { header: "Description", key: "description", width: 60 },
      { header: st.decisionLabel ?? "Arbitrage ou décision demandée", key: "decision", width: 60 },
    ];
    for (const m of meetings)
      for (const t of m.topics)
        ws.addRow({
          date: frDate(m.date),
          order: t.order,
          title: `${t.emoji ? t.emoji + " " : ""}${t.title}`,
          theme: d.optLabel(t.themeId, false),
          nature: d.optLabel(t.natureId, false),
          description: plain(t.description),
          decision: plain(t.decisionRequest),
        });
    styleSheet(ws);
  }
  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), filename: `${stamp()}_${d.account.slug}_${type.name.replace(/\s+/g, "-")}.xlsx` };
}
