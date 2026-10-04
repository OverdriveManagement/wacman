import PptxGenJS from "pptxgenjs";
import { getMeeting, type Ctx } from "@wacman/core";
import { loadAccountData, latestMeetings, frDate, plain } from "./data.js";

/**
 * Export PowerPoint au gabarit Wifirst (16:9, 10 x 5,625 pouces) :
 * titre Hind Madurai gras 20 pt bleu pétrole, corps Inter, palette du deck Program weekly.
 */

const C = {
  petrol: "004968",
  blue: "2563EB",
  blueLight: "9DBDF4",
  ocre: "D97706",
  teal: "0F766E",
  red: "EF4444",
  amber: "F59E0B",
  text: "1E293B",
  body: "334155",
  muted: "64748B",
  faint: "94A3B8",
  card: "F8FAFC",
  rule: "F1F5F9",
  line: "E2E8F0",
  white: "FFFFFF",
};
const COLOR_TOKENS: Record<string, string> = {
  blue: C.blue,
  teal: C.teal,
  ocre: C.ocre,
  red: C.red,
  amber: C.amber,
  slate: C.muted,
  violet: "7C3AED",
  green: "16A34A",
};
const TITLE_FONT = "Hind Madurai";
const BODY_FONT = "Inter";
const W = 10;

type Run = { text: string; options?: PptxGenJS.TextPropsOptions };

/**
 * Convertit le balisage léger en segments de texte PowerPoint :
 * **gras**, *italique*, __souligné__, ~~barré~~, ==surligné==, `code`, [lien](url) ;
 * puces « - », cases « [ ] » / « [x] », intertitres « ### ».
 */
const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|==[^=]+==|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\*[^*\s](?:[^*]*[^*\s])?\*)/g;
function runs(md: string, base: PptxGenJS.TextPropsOptions = {}): Run[] {
  const out: Run[] = [];
  const lines = (md ?? "").split("\n");
  lines.forEach((raw, li) => {
    let line = raw;
    let lineOpts: PptxGenJS.TextPropsOptions = {};
    if (/^\s*#{1,3}\s+/.test(line)) {
      line = line.replace(/^\s*#{1,3}\s+/, "");
      lineOpts = { bold: true };
    }
    line = line
      .replace(/^(\s*)[-•*]\s+(?!\*)/, "$1• ")
      .replace(/^(\s*)\[[xX]\]\s+/, "$1☑ ")
      .replace(/^(\s*)\[ \]\s+/, "$1☐ ");
    const parts: Run[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    const re = new RegExp(INLINE.source, "g");
    const push = (text: string, o: PptxGenJS.TextPropsOptions = {}) => text && parts.push({ text, options: { ...base, ...lineOpts, ...o } });
    while ((m = re.exec(line))) {
      push(line.slice(last, m.index));
      const tok = m[0];
      if (tok.startsWith("**")) push(tok.slice(2, -2), { bold: true });
      else if (tok.startsWith("__")) push(tok.slice(2, -2), { underline: { style: "sng" } });
      else if (tok.startsWith("~~")) push(tok.slice(2, -2), { strike: "sngStrike" });
      else if (tok.startsWith("==")) push(tok.slice(2, -2), { highlight: "FDE68A" });
      else if (tok.startsWith("`")) push(tok.slice(1, -1), { fontFace: "Consolas" });
      else if (tok.startsWith("[")) push(tok.replace(/\[([^\]]+)\]\([^)]+\)/, "$1"), { color: C.blue });
      else push(tok.slice(1, -1), { italic: true });
      last = m.index + tok.length;
    }
    push(line.slice(last));
    if (!parts.length) parts.push({ text: " ", options: { ...base } });
    parts[parts.length - 1].options = { ...parts[parts.length - 1].options, breakLine: li < lines.length - 1 };
    out.push(...parts);
  });
  return out;
}

const clip = (s: string, n: number) => {
  const t = plain(s ?? "").replace(/\s+\n/g, "\n").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

type Cell = { text: string | Run[]; options?: PptxGenJS.TableCellProps };

/** Estime la hauteur (pouces) d'une ligne de tableau à 7 pt, pour paginer sans couper une ligne. */
function rowHeight(row: Cell[], colW: number[]) {
  let lines = 1;
  row.forEach((c, i) => {
    const txt = typeof c.text === "string" ? c.text : c.text.map((r) => r.text + (r.options?.breakLine ? "\n" : "")).join("");
    const perLine = Math.max(8, Math.floor((colW[i] - 0.1) * 19));
    const n = txt.split("\n").reduce((acc, l) => acc + Math.max(1, Math.ceil(l.length / perLine)), 0);
    lines = Math.max(lines, n);
  });
  return lines * 0.125 + 0.1;
}

/** Répartit les lignes d'un tableau sur plusieurs slides (titre et pied de page répétés). */
function paginate(header: Cell[], rows: Cell[][], colW: number[], available = 4.05) {
  const pages: Cell[][][] = [];
  let cur: Cell[][] = [];
  let h = rowHeight(header, colW);
  for (const r of rows) {
    const rh = rowHeight(r, colW);
    if (cur.length && h + rh > available) {
      pages.push(cur);
      cur = [];
      h = rowHeight(header, colW);
    }
    cur.push(r);
    h += rh;
  }
  if (cur.length || !pages.length) pages.push(cur);
  return pages.map((p) => [header, ...p]);
}

export async function buildDeck(ctx: Ctx, opts: { sprintId?: string; meetingIds?: string[]; sections: string[] }) {
  const d = await loadAccountData(ctx);
  const sprint = (opts.sprintId && d.spr.get(opts.sprintId)) || d.currentSprint;
  const cards = sprint ? await d.cards(sprint.id) : [];

  // séances retenues : celles demandées, sinon la dernière de chaque type
  let meetings = [] as Awaited<ReturnType<typeof getMeeting>>[];
  if (opts.meetingIds) {
    meetings = await Promise.all(opts.meetingIds.map((id) => getMeeting(ctx, id)));
  } else {
    for (const t of d.meetingTypes.filter((m) => m.active)) {
      const [last] = await latestMeetings(ctx, t.id, 1);
      if (last) meetings.push(await getMeeting(ctx, last.id));
    }
  }

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIFIRST", width: W, height: 5.625 });
  pptx.layout = "WIFIRST";
  pptx.author = ctx.user.name;
  pptx.company = "Wifirst";
  pptx.title = `${d.account.name} - Program Management`;
  let page = 0;

  const newSlide = (title: string, chapo?: string) => {
    const s = pptx.addSlide();
    page++;
    s.background = { color: C.white };
    s.addText(title, { x: 0.33, y: 0.17, w: 9.33, h: 0.45, fontFace: TITLE_FONT, fontSize: 20, bold: true, color: C.petrol, margin: 0 });
    if (chapo) s.addText(runs(chapo, { fontFace: BODY_FONT, fontSize: 8, color: C.body }), { x: 0.42, y: 0.63, w: 9.17, h: 0.3, margin: 0, valign: "top" });
    s.addText("Wifirst", { x: 0.34, y: 5.24, w: 0.9, h: 0.22, fontFace: TITLE_FONT, fontSize: 11, bold: true, color: C.petrol, margin: 0 });
    s.addText(`Document confidentiel, diffusion limitée. ${d.account.name}`, { x: 1.46, y: 5.27, w: 6.5, h: 0.18, fontFace: TITLE_FONT, fontSize: 6, color: "A6AAA9", margin: 0 });
    s.addText(String(page), { x: 9.2, y: 5.27, w: 0.46, h: 0.18, fontFace: BODY_FONT, fontSize: 7, color: C.faint, align: "right", margin: 0 });
    return s;
  };

  const table = (title: string, chapo: string | undefined, header: Cell[], rows: Cell[][], colW: number[]) => {
    const pages = paginate(header, rows, colW);
    pages.forEach((p, i) => {
      const s = newSlide(pages.length > 1 && i > 0 ? `${title} (suite)` : title, chapo);
      s.addTable(p as PptxGenJS.TableRow[], {
        x: 0.42,
        y: 1.0,
        w: 9.17,
        colW,
        fontFace: BODY_FONT,
        fontSize: 7,
        color: C.text,
        border: { type: "solid", color: C.line, pt: 0.5 },
        valign: "top",
        margin: 0.05,
      });
    });
  };
  const head = (t: string): Cell => ({ text: t, options: { bold: true, color: C.white, fill: { color: C.petrol } } });

  // ---------------------------------------------------------------- couverture
  if (opts.sections.includes("cover")) {
    const s = pptx.addSlide();
    page++;
    s.background = { color: C.petrol };
    s.addText(d.account.name, { x: 0.6, y: 1.6, w: 8.8, h: 0.7, fontFace: TITLE_FONT, fontSize: 32, bold: true, color: C.white, margin: 0 });
    const sub = [sprint ? `${sprint.name} (${frDate(sprint.startDate)} au ${frDate(sprint.endDate)})` : "", `Point au ${frDate(new Date().toISOString())}`].filter(Boolean).join("\n");
    s.addText(sub, { x: 0.6, y: 2.4, w: 8.8, h: 0.8, fontFace: BODY_FONT, fontSize: 14, color: "CFE3EA", margin: 0 });
    s.addText("Wifirst", { x: 0.6, y: 4.9, w: 2, h: 0.3, fontFace: TITLE_FONT, fontSize: 14, bold: true, color: C.white, margin: 0 });
  }

  // ---------------------------------------------------------------- faits marquants
  if (opts.sections.includes("meetings")) {
    for (const m of meetings.filter((x) => x.meetingType.blocks.includes("HIGHLIGHTS"))) {
      const hs = m.highlights;
      const perSlide = 6;
      for (let i = 0; i < Math.max(hs.length, 1); i += perSlide) {
        const s = newSlide(`Faits marquants de la semaine`, `${m.meetingType.name} du ${frDate(m.date)}`);
        const chunk = hs.slice(i, i + perSlide);
        if (!chunk.length) s.addText("Aucun fait marquant saisi pour cette séance.", { x: 0.42, y: 1.2, w: 9, h: 0.3, fontFace: BODY_FONT, fontSize: 9, color: C.muted });
        chunk.forEach((h, k) => {
          const col = k % 3;
          const row = Math.floor(k / 3);
          const x = 0.42 + col * 3.1;
          const y = 1.1 + row * 2.0;
          s.addShape(pptx.ShapeType.roundRect, { x, y, w: 2.95, h: 1.85, fill: { color: C.card }, line: { color: C.line, width: 0.75 }, rectRadius: 0.06 });
          s.addText(`${h.emoji ? h.emoji + "  " : ""}${h.title}`, { x: x + 0.12, y: y + 0.1, w: 2.7, h: 0.4, fontFace: BODY_FONT, fontSize: 9, bold: true, color: C.blue, margin: 0, valign: "top" });
          const meta = [d.streamLabel(h.streamId, false), d.optLabel(h.typeId, false)].filter(Boolean).join("  |  ");
          if (meta) s.addText(meta, { x: x + 0.12, y: y + 0.5, w: 2.7, h: 0.18, fontFace: BODY_FONT, fontSize: 6.5, bold: true, color: C.ocre, margin: 0 });
          s.addText(runs(clip(h.detail, 420), { fontFace: BODY_FONT, fontSize: 7, color: C.text }), { x: x + 0.12, y: y + 0.72, w: 2.7, h: 1.05, margin: 0, valign: "top" });
        });
      }
    }
  }

  // ---------------------------------------------------------------- cartes en vigilance ou en alerte
  if (opts.sections.includes("alerts")) {
    const alertCards = cards.filter((c) => c.alertLevelId && !d.isDone(c.statusId));
    const rows: Cell[][] = [];
    for (const c of alertCards.sort((x, y) => (d.opt.get(y.alertLevelId!)?.order ?? 0) - (d.opt.get(x.alertLevelId!)?.order ?? 0))) {
      const lvl = d.opt.get(c.alertLevelId!);
      rows.push([
        { text: "●", options: { color: COLOR_TOKENS[lvl?.color ?? "slate"] ?? C.muted, fontSize: 12, align: "center" } },
        { text: c.title, options: { bold: true } },
        { text: d.streamLabel(c.streamId, false) },
        { text: d.contactName(c.ownerId) },
        { text: frDate(c.dueDate) },
        { text: clip(c.alertsNote, 330) },
      ]);
    }
    if (!rows.length) rows.push([{ text: "" }, { text: "Aucune carte en vigilance ou en alerte." }, { text: "" }, { text: "" }, { text: "" }, { text: "" }]);
    table(
      "Cartes en vigilance ou en alerte",
      sprint ? `${sprint.name} : ${alertCards.length} carte(s)` : undefined,
      [head(""), head("Livrable"), head("Stream"), head("Porteur"), head("Échéance"), head("Alertes / arbitrages")],
      rows,
      [0.3, 2.3, 1.55, 1.15, 0.75, 3.12],
    );
  }

  // ---------------------------------------------------------------- kanban : une slide par stream
  if (opts.sections.includes("kanban") && sprint) {
    const statusOrder = d.options.filter((o) => o.kind === "CARD_STATUS").map((o) => o.id);
    const accent = (statusId: string | null) => {
      const o = statusId ? d.opt.get(statusId) : undefined;
      if (!o) return C.blueLight;
      if ((o.meta as { done?: boolean })?.done) return C.teal;
      return o.color === "blue" ? C.blue : o.color === "amber" ? C.amber : o.color === "teal" ? C.teal : C.blueLight;
    };
    for (const st of d.streams.filter((x) => x.inKanban && x.active)) {
      const list = cards
        .filter((c) => c.streamId === st.id)
        .sort((a, b) => statusOrder.indexOf(a.statusId ?? "") - statusOrder.indexOf(b.statusId ?? "") || a.position - b.position);
      if (!list.length) continue;
      const perSlide = 8;
      for (let i = 0; i < list.length; i += perSlide) {
        const chunk = list.slice(i, i + perSlide);
        const suffix = list.length > perSlide ? ` (${Math.floor(i / perSlide) + 1}/${Math.ceil(list.length / perSlide)})` : "";
        const s = newSlide(`Les livrables du ${sprint.name} : ${st.name}${suffix}`, `${st.emoji ? st.emoji + " " : ""}Leader : ${st.leader || "à déterminer"}${st.prescriber ? `. ${d.settings.labels.prescriber} : ${st.prescriber}` : ""}`);
        chunk.forEach((c, k) => {
          const col = k % 2;
          const row = Math.floor(k / 2);
          const x = 0.42 + col * 4.65;
          const y = 1.05 + row * 1.03;
          s.addShape(pptx.ShapeType.rect, { x, y, w: 4.52, h: 0.93, fill: { color: C.card }, line: { color: C.line, width: 0.5 } });
          s.addShape(pptx.ShapeType.rect, { x, y, w: 0.06, h: 0.93, fill: { color: accent(c.statusId) }, line: { color: accent(c.statusId), width: 0 } });
          s.addText(clip(`${c.emoji ? c.emoji + " " : ""}${c.title}`, 80), { x: x + 0.15, y: y + 0.06, w: 3.9, h: 0.22, fontFace: BODY_FONT, fontSize: 8, bold: true, color: C.text, margin: 0 });
          const meta = [d.optLabel(c.statusId, false), d.contactName(c.ownerId), c.dueDate ? `échéance ${frDate(c.dueDate)}` : ""].filter(Boolean).join("  |  ");
          s.addText(meta, { x: x + 0.15, y: y + 0.29, w: 4.2, h: 0.16, fontFace: BODY_FONT, fontSize: 6.5, color: C.muted, margin: 0 });
          const body = c.alertLevelId ? c.alertsNote || c.progressNote : c.progressNote || c.nextSteps || c.description;
          s.addText(clip(body, 230), {
            x: x + 0.15,
            y: y + 0.47,
            w: 4.25,
            h: 0.42,
            fontFace: BODY_FONT,
            fontSize: 6.5,
            color: c.alertLevelId ? (d.opt.get(c.alertLevelId)?.color === "red" ? "B91C1C" : "92400E") : C.body,
            margin: 0,
            valign: "top",
          });
          if (c.alertLevelId) {
            const col2 = COLOR_TOKENS[d.opt.get(c.alertLevelId)?.color ?? "slate"] ?? C.muted;
            s.addShape(pptx.ShapeType.ellipse, { x: x + 4.28, y: y + 0.09, w: 0.14, h: 0.14, fill: { color: col2 }, line: { color: col2, width: 0 } });
          }
        });
      }
    }
  }

  // ---------------------------------------------------------------- planning (Gantt) des cartes par stream
  if (opts.sections.includes("planning")) {
    const all = (await d.cards()).filter((c) => !c.archived);
    const today = new Date().toISOString().slice(0, 10);
    const DAY = 86_400_000;
    const t = (iso: string) => new Date(`${iso}T12:00:00Z`).getTime();
    const bar = (c: (typeof all)[number]) => {
      const sp = c.sprintId ? d.spr.get(c.sprintId) : undefined;
      let a = c.startDate ?? sp?.startDate ?? null;
      let b = c.dueDate ?? sp?.endDate ?? null;
      if (!a && !b) return null;
      if (!a) a = b;
      if (!b) b = a;
      if (a! > b!) [a, b] = [b, a];
      return { a: a!, b: b!, milestone: !c.startDate && !sp && !!c.dueDate };
    };
    const open = d.sprints.filter((x) => x.state !== "DONE" && x.startDate && x.endDate);
    // fenêtre : autour d'aujourd'hui, élargie aux barres des cartes ouvertes (au plus 120 jours)
    const openBars = all.filter((c) => !d.isDone(c.statusId)).map(bar).filter((b): b is NonNullable<ReturnType<typeof bar>> => !!b);
    const cur = open.find((x) => x.state === "CURRENT");
    const winStart = Math.min(t(today) - 7 * DAY, cur ? t(cur.startDate!) : Infinity, ...openBars.map((b) => t(b.a)).filter((x) => x >= t(today) - 60 * DAY)) - 3 * DAY;
    const winEnd = Math.max(t(today) + 35 * DAY, ...openBars.map((b) => t(b.b))) + 5 * DAY;
    const span = Math.min(winEnd - winStart, 120 * DAY);
    const X0 = 3.0;
    const WT = 6.6;
    const xOf = (ms: number) => X0 + Math.max(0, Math.min(1, (ms - winStart) / span)) * WT;
    type Row = { kind: "stream"; label: string } | { kind: "card"; c: (typeof all)[number]; b: NonNullable<ReturnType<typeof bar>> | null };
    const rows: Row[] = [];
    for (const st of d.streams.filter((x) => x.active && x.inKanban)) {
      const list = all
        .filter((c) => c.streamId === st.id && !d.isDone(c.statusId))
        .map((c) => ({ c, b: bar(c) }))
        .filter((r) => !r.b || (t(r.b.b) >= winStart && t(r.b.a) <= winStart + span))
        .sort((x, y) => (x.b?.a ?? "9").localeCompare(y.b?.a ?? "9"));
      if (!list.length) continue;
      rows.push({ kind: "stream", label: `${st.emoji ? st.emoji + " " : ""}${st.name}` });
      list.forEach((r) => rows.push({ kind: "card", ...r }));
    }
    const perSlide = 24;
    const ROW = 0.165;
    for (let i = 0; i < Math.max(rows.length, 1); i += perSlide) {
      const chunk = rows.slice(i, i + perSlide);
      const s = newSlide(i ? "Planning des livrables (suite)" : "Planning des livrables", "Cartes non terminées, par stream. Barre rouge : alerte ; orange : vigilance ; trait pointillé : dates du sprint faute de dates propres à la carte.");
      const top = 1.05;
      // mois et sprints
      for (let m = new Date(winStart); m.getTime() <= winStart + span; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
        const x = xOf(m.getTime());
        s.addText(m.toLocaleDateString("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" }), { x, y: top - 0.2, w: 0.8, h: 0.16, fontFace: BODY_FONT, fontSize: 6, color: C.muted, margin: 0 });
      }
      for (const sp of open) {
        const x1 = xOf(t(sp.startDate!));
        const x2 = xOf(t(sp.endDate!));
        if (x2 - x1 > 0.05) {
          s.addShape(pptx.ShapeType.rect, { x: x1, y: top, w: x2 - x1, h: perSlide * ROW, fill: { color: sp.state === "CURRENT" ? "EFF6FF" : C.card }, line: { color: C.line, width: 0.25 } });
          s.addText(sp.name, { x: x1 + 0.03, y: top + 0.01, w: Math.max(0.5, x2 - x1 - 0.06), h: 0.14, fontFace: BODY_FONT, fontSize: 5.5, color: C.faint, margin: 0 });
        }
      }
      chunk.forEach((r, k) => {
        const y = top + 0.16 + k * ROW;
        if (r.kind === "stream") {
          s.addText(r.label, { x: 0.42, y, w: 2.5, h: ROW, fontFace: BODY_FONT, fontSize: 7, bold: true, color: C.petrol, margin: 0, valign: "middle" });
          return;
        }
        const c = r.c;
        s.addText(clip(`#${c.ref} ${c.title}`, 52), { x: 0.52, y, w: 2.45, h: ROW, fontFace: BODY_FONT, fontSize: 6, color: C.text, margin: 0, valign: "middle" });
        if (!r.b) {
          s.addText("non planifiée", { x: X0 + 0.02, y, w: 1.2, h: ROW, fontFace: BODY_FONT, fontSize: 5.5, italic: true, color: C.faint, margin: 0, valign: "middle" });
          return;
        }
        const lvl = c.alertLevelId ? d.opt.get(c.alertLevelId) : undefined;
        const col = lvl ? COLOR_TOKENS[lvl.color] ?? C.amber : C.blue;
        const x1 = xOf(t(r.b.a));
        const x2 = Math.max(x1 + 0.05, xOf(t(r.b.b) + DAY));
        if (r.b.milestone) {
          s.addShape(pptx.ShapeType.diamond, { x: x2 - 0.06, y: y + 0.03, w: 0.11, h: 0.11, fill: { color: col }, line: { color: col, width: 0 } });
        } else {
          const implied = !c.startDate || !c.dueDate;
          s.addShape(pptx.ShapeType.roundRect, { x: x1, y: y + 0.035, w: x2 - x1, h: ROW - 0.07, rectRadius: 0.03, fill: { color: col, transparency: implied ? 55 : 0 }, line: { color: col, width: 0.5, dashType: implied ? "dash" : "solid" } });
        }
      });
      const xt = xOf(t(today));
      s.addShape(pptx.ShapeType.line, { x: xt, y: top, w: 0, h: perSlide * ROW + 0.1, line: { color: C.red, width: 1 } });
      s.addText("Aujourd'hui", { x: xt - 0.4, y: top + perSlide * ROW + 0.1, w: 0.8, h: 0.14, fontFace: BODY_FONT, fontSize: 5.5, color: C.red, align: "center", margin: 0 });
    }
  }

  // ---------------------------------------------------------------- statut des streams et sujets
  if (opts.sections.includes("meetings")) {
    for (const m of meetings) {
      const st = (m.meetingType.settings ?? {}) as Record<string, string>;
      if (m.meetingType.blocks.includes("STREAM_STATUS")) {
        const rows: Cell[][] = m.statuses.map((r) => [
          { text: d.streamLabel(r.streamId), options: { bold: true } },
          { text: r.statusIds.map((id) => d.optLabel(id)).join("\n") },
          { text: runs(clip(r.progress, 500)) },
          { text: runs(clip(r.alerts, 500)) },
        ]);
        table(
          "Avancement des streams, alertes et prérequis",
          `${m.meetingType.name} du ${frDate(m.date)}`,
          [head("Stream"), head(st.statusLabel ?? "Statut"), head(st.progressLabel ?? "Avancement"), head(st.alertsLabel ?? "Alertes & prérequis")],
          rows,
          [1.9, 1.55, 2.86, 2.86],
        );
      }
      if (m.meetingType.blocks.includes("TOPICS")) {
        const rows: Cell[][] = m.topics.map((t) => [
          { text: `${t.emoji ? t.emoji + " " : ""}${t.title}`, options: { bold: true } },
          { text: d.optLabel(t.themeId, false) },
          { text: d.optLabel(t.natureId) },
          { text: runs(clip(t.description, 520)) },
          { text: runs(clip(t.decisionRequest, 420)) },
        ]);
        table(
          `${m.meetingType.name} du ${frDate(m.date)}`,
          `${m.topics.length} sujet(s), dans l'ordre de passage`,
          [head("Sujet"), head("Thématique"), head("Nature"), head("Description"), head(st.decisionLabel ?? "Arbitrage ou décision demandée")],
          rows,
          [1.75, 0.8, 0.95, 3.05, 2.62],
        );
      }
    }
  }

  if (page === 0) newSlide(d.account.name, "Aucune section sélectionnée.");
  const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return { buffer, filename: `${stamp}_${d.account.slug}_program-management.pptx` };
}

