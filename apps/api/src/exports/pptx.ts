import PptxGenJS from "pptxgenjs";
import { getMeeting, type Ctx } from "@wacman/core";
import { loadAccountData, latestMeetings, frDate } from "./data.js";

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

/** Convertit le balisage léger (**gras**, retours à la ligne) en segments de texte PowerPoint. */
function runs(md: string, base: PptxGenJS.TextPropsOptions = {}): Run[] {
  const out: Run[] = [];
  const lines = (md ?? "").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1").split("\n");
  lines.forEach((line, li) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).filter((p) => p !== "");
    if (!parts.length) parts.push(" ");
    parts.forEach((p, pi) => {
      const bold = p.startsWith("**") && p.endsWith("**");
      out.push({ text: bold ? p.slice(2, -2) : p, options: { ...base, bold: bold || base.bold, breakLine: pi === parts.length - 1 && li < lines.length - 1 } });
    });
  });
  return out;
}

const clip = (s: string, n: number) => {
  const t = (s ?? "").replace(/\*\*/g, "").replace(/\s+\n/g, "\n").trim();
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

