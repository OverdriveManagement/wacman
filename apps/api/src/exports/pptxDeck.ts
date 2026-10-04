import type PptxGenJS from "pptxgenjs";
import { and, asc, eq } from "drizzle-orm";
import { db, markupToPlain, T, sprintReview, type Ctx, type getMeeting, type listCards } from "@wacman/core";
import type { loadAccountData } from "./data.js";
import { frDate } from "./data.js";
import { BODY_FONT, C, COLOR_TOKENS, clip, runs, type Cell } from "./pptxKit.js";

/**
 * Slides au format des decks Program weekly et COPROJ (gabarit relevé dans les decks du 28/09 et du 01/10/2026) :
 * livrables du sprint par stream, météo des streams (« Actions en cours des streams »), focus stream,
 * « Ce que nous attendons de <client> », avancement des streams en cartes (COPROJ), registre des décisions,
 * relevé des actions et bilan de sprint.
 */

type Data = Awaited<ReturnType<typeof loadAccountData>>;
type CardRow = Awaited<ReturnType<typeof listCards>>[number];
type MeetingFull = Awaited<ReturnType<typeof getMeeting>>;
type Sprint = Data["sprints"][number];
type ActionRow = typeof T.actions.$inferSelect;
type DecisionRow = typeof T.decisions.$inferSelect;

export interface DeckKit {
  ctx: Ctx;
  pptx: PptxGenJS;
  d: Data;
  sprint: Sprint | undefined;
  cards: CardRow[];
  meetings: MeetingFull[];
  newSlide: (title: string, chapo?: string) => PptxGenJS.Slide;
  table: (title: string, chapo: string | undefined, header: Cell[], rows: Cell[][], colW: number[]) => void;
  head: (t: string) => Cell;
}

const EXTRA = "Inter ExtraBold";
const parisDay = (t: Date | null) => (t ? t.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }) : "");
const today = () => parisDay(new Date());

/** Intertitre de bloc : Inter ExtraBold 7,5 pt bleu, filet gris clair dessous. */
function sectionHeader(s: PptxGenJS.Slide, x: number, y: number, w: number, label: string, color = C.blue) {
  s.addText(label.toUpperCase(), { x, y, w, h: 0.18, fontFace: EXTRA, fontSize: 7.5, bold: true, color, margin: 0, charSpacing: 0.4 });
  s.addShape("line", { x, y: y + 0.2, w, h: 0, line: { color: C.rule, width: 1 } });
}

/** Pastille de statut (fond clair, texte coloré). */
function tag(s: PptxGenJS.Slide, x: number, y: number, label: string, color: string, align: "left" | "right" = "left") {
  const w = Math.min(1.6, 0.16 + label.length * 0.052);
  const left = align === "right" ? x - w : x;
  s.addShape("roundRect", { x: left, y, w, h: 0.17, rectRadius: 0.08, fill: { color, transparency: 85 }, line: { color, width: 0.5 } });
  s.addText(label, { x: left, y, w, h: 0.17, fontFace: BODY_FONT, fontSize: 6, bold: true, color, align: "center", valign: "middle", margin: 0 });
  return w;
}

const colorOf = (token: string | null | undefined) => COLOR_TOKENS[token ?? "slate"] ?? C.muted;

/** Texte saisi ramené à une ligne : puces retirées, lignes séparées par « ; ». */
const flat = (md: string | null | undefined) =>
  markupToPlain(md ?? "")
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+\.|\[[ xX]\])\s*/, "").trim())
    .filter(Boolean)
    .reduce((acc, l) => (!acc ? l : /[.!?;:]$/.test(acc) ? `${acc} ${l}` : `${acc} ; ${l}`), "");

function partyLabel(d: Data, party: string) {
  return party === "WIFIRST" ? "Wifirst" : party === "CLIENT" ? d.account.clientName || "Client" : "Commun";
}

// ---------------------------------------------------------------------------
// Météo d'un stream déduite des cartes et des risques
// ---------------------------------------------------------------------------

type Weather = { label: string; color: string; rank: number };
const WEATHER: Record<string, Weather> = {
  ok: { label: "Au planning", color: C.teal, rank: 0 },
  notStarted: { label: "Non commencé", color: C.muted, rank: 1 },
  watch: { label: "Vigilance", color: C.ocre, rank: 2 },
  risk: { label: "Risque", color: "C2410C", rank: 3 },
  alert: { label: "Alerte", color: C.red, rank: 4 },
};

async function openRisks(ctx: Ctx, d: Data) {
  const closed = new Set(d.options.filter((o) => o.kind === "RISK_STATUS" && (o.meta as { closed?: boolean })?.closed).map((o) => o.id));
  const rows = await db.select().from(T.risks).where(eq(T.risks.accountId, ctx.accountId));
  return rows.filter((r) => !(r.statusId && closed.has(r.statusId)));
}

function streamWeather(d: Data, list: CardRow[], risks: (typeof T.risks.$inferSelect)[]): Weather {
  const open = list.filter((c) => !d.isDone(c.statusId));
  const colors = open.map((c) => (c.alertLevelId ? d.opt.get(c.alertLevelId)?.color : null)).filter(Boolean) as string[];
  const riskColors = risks.map((r) => (r.criticalityId ? d.opt.get(r.criticalityId)?.color : null)).filter(Boolean) as string[];
  if (colors.includes("red")) return WEATHER.alert;
  if (riskColors.includes("red")) return WEATHER.risk;
  if (colors.length || riskColors.some((c) => c === "ocre" || c === "amber")) return WEATHER.watch;
  const first = d.options.find((o) => o.kind === "CARD_STATUS")?.id;
  if (list.length && open.length === list.length && open.every((c) => !c.statusId || c.statusId === first)) return WEATHER.notStarted;
  return WEATHER.ok;
}

const statusRank = (d: Data) => {
  const order = d.options.filter((o) => o.kind === "CARD_STATUS").map((o) => o.id);
  return (c: CardRow) => order.indexOf(c.statusId ?? "");
};

// ---------------------------------------------------------------------------
// Livrables du sprint : deux streams par slide, une carte par livrable
// ---------------------------------------------------------------------------

export function deliverablesSlides(k: DeckKit) {
  const { d, sprint, cards } = k;
  if (!sprint) return;
  const rank = statusRank(d);
  const PER_COL = 5;
  const cols: { streamId: string; name: string; leader: string; list: CardRow[]; part: string }[] = [];
  for (const st of d.streams.filter((x) => x.active && x.inKanban)) {
    const list = cards.filter((c) => c.streamId === st.id).sort((a, b) => rank(a) - rank(b) || a.position - b.position);
    if (!list.length) continue;
    const parts = Math.ceil(list.length / PER_COL);
    for (let i = 0; i < list.length; i += PER_COL) cols.push({ streamId: st.id, name: st.name, leader: st.leader, list: list.slice(i, i + PER_COL), part: parts > 1 ? ` (${i / PER_COL + 1}/${parts})` : "" });
  }
  for (let i = 0; i < cols.length; i += 2) {
    const pair = cols.slice(i, i + 2);
    const names = [...new Set(pair.map((c) => c.name))].join(", ");
    const s = k.newSlide(`Les livrables du ${sprint.name} : ${names}`, sprint.objective ? clip(sprint.objective, 220) : undefined);
    pair.forEach((col, ci) => {
      const x = 0.42 + ci * 4.65;
      const w = 4.52;
      sectionHeader(s, x, 1.0, w, `${col.name}${col.part}`);
      if (col.leader) s.addText(`Leader : ${col.leader}`, { x, y: 1.0, w, h: 0.18, fontFace: BODY_FONT, fontSize: 6.5, color: C.muted, align: "right", margin: 0 });
      col.list.forEach((c, j) => {
        const y = 1.3 + j * 0.76;
        const done = d.isDone(c.statusId);
        const lvl = c.alertLevelId && !done ? d.opt.get(c.alertLevelId) : undefined;
        const edge = done ? C.teal : lvl ? colorOf(lvl.color) : C.blueLight;
        s.addShape("rect", { x, y, w, h: 0.68, fill: { color: C.card }, line: { color: C.line, width: 0.5 } });
        s.addShape("rect", { x, y, w: 0.05, h: 0.68, fill: { color: edge }, line: { color: edge, width: 0 } });
        s.addText(clip(`${c.emoji ? c.emoji + " " : ""}${c.title}`, 78), { x: x + 0.14, y: y + 0.05, w: w - 1.3, h: 0.2, fontFace: BODY_FONT, fontSize: 8, bold: true, color: C.text, margin: 0 });
        if (lvl) tag(s, x + w - 0.1, y + 0.06, lvl.label, colorOf(lvl.color), "right");
        else if (done) tag(s, x + w - 0.1, y + 0.06, d.optLabel(c.statusId, false) || "Terminé", C.teal, "right");
        const body = flat(lvl ? c.alertsNote || c.progressNote : c.description || c.progressNote || c.nextSteps);
        s.addText(clip(body, 150) || " ", { x: x + 0.14, y: y + 0.26, w: w - 0.25, h: 0.26, fontFace: BODY_FONT, fontSize: 6.5, color: lvl ? (lvl.color === "red" ? "B91C1C" : "92400E") : C.body, margin: 0, valign: "top" });
        const meta = [c.dueDate ? `Échéance ${frDate(c.dueDate)}` : "Sans échéance", !done ? d.optLabel(c.statusId, false) : "", d.contactName(c.ownerId)].filter(Boolean).join("  |  ");
        s.addText(meta, { x: x + 0.14, y: y + 0.5, w: w - 0.25, h: 0.15, fontFace: BODY_FONT, fontSize: 6, color: C.muted, margin: 0 });
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Météo : « Actions en cours des streams »
// ---------------------------------------------------------------------------

export async function weatherSlides(k: DeckKit) {
  const { d, sprint, cards } = k;
  const risks = await openRisks(k.ctx, d);
  const rank = statusRank(d);
  const streams = d.streams.filter((x) => x.active && x.inKanban);
  const tiles = streams
    .map((st) => {
      const list = cards.filter((c) => c.streamId === st.id);
      const w = streamWeather(d, list, risks.filter((r) => r.streamId === st.id));
      const open = list.filter((c) => !d.isDone(c.statusId));
      const first = d.options.find((o) => o.kind === "CARD_STATUS")?.id;
      const active = open.filter((c) => c.statusId && c.statusId !== first);
      const shown = (active.length ? active : open)
        .sort((a, b) => Number(!!b.alertLevelId) - Number(!!a.alertLevelId) || (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9") || rank(a) - rank(b))
        .slice(0, 5);
      const done = list.length - open.length;
      return { st, w, shown, more: (active.length ? active : open).length - shown.length, done, total: list.length };
    })
    .filter((t) => t.total);
  const PER = 6;
  for (let i = 0; i < Math.max(tiles.length, 1); i += PER) {
    const s = k.newSlide(i ? "Actions en cours des streams (suite)" : "Actions en cours des streams", sprint ? `${sprint.name} : météo de chaque stream d'après les alertes des cartes et les risques ouverts` : undefined);
    const chunk = tiles.slice(i, i + PER);
    if (!chunk.length) s.addText("Aucune carte dans le sprint.", { x: 0.42, y: 1.2, w: 9, h: 0.3, fontFace: BODY_FONT, fontSize: 9, color: C.muted });
    // légende
    let lx = 9.59;
    for (const w of Object.values(WEATHER).reverse()) lx -= tag(s, lx, 0.66, w.label, w.color, "right") + 0.06;
    chunk.forEach((t, j) => {
      const x = 0.42 + (j % 3) * 3.1;
      const y = 1.0 + Math.floor(j / 3) * 2.05;
      s.addShape("rect", { x, y, w: 2.97, h: 1.95, fill: { color: C.card }, line: { color: C.line, width: 0.5 } });
      s.addShape("rect", { x, y, w: 2.97, h: 0.05, fill: { color: t.w.color }, line: { color: t.w.color, width: 0 } });
      s.addText(clip(`${t.st.emoji ? t.st.emoji + " " : ""}${t.st.name}`, 40), { x: x + 0.1, y: y + 0.12, w: 1.8, h: 0.22, fontFace: BODY_FONT, fontSize: 8.5, bold: true, color: C.petrol, margin: 0 });
      tag(s, x + 2.87, y + 0.14, t.w.label, t.w.color, "right");
      s.addText(`${t.done} terminé${t.done > 1 ? "s" : ""} sur ${t.total}`, { x: x + 0.1, y: y + 0.34, w: 2.7, h: 0.15, fontFace: BODY_FONT, fontSize: 6, color: C.muted, margin: 0 });
      const lines = t.shown.map((c) => {
        const lvl = c.alertLevelId ? d.opt.get(c.alertLevelId) : undefined;
        return `- ${lvl ? `**${clip(c.title, 70)}**` : clip(c.title, 70)}${c.dueDate ? ` (${frDate(c.dueDate).slice(0, 5)})` : ""}`;
      });
      if (t.more > 0) lines.push(`- et ${t.more} autre${t.more > 1 ? "s" : ""}`);
      s.addText(runs(lines.join("\n") || "Rien en cours.", { fontFace: BODY_FONT, fontSize: 7, color: C.text }, 520), { x: x + 0.1, y: y + 0.53, w: 2.77, h: 1.36, margin: 0, valign: "top", paraSpaceAfter: 2 });
    });
  }
}

// ---------------------------------------------------------------------------
// Focus stream
// ---------------------------------------------------------------------------

export async function focusSlides(k: DeckKit, streamIds: string[] | undefined) {
  const { d, sprint, cards } = k;
  const risks = await openRisks(k.ctx, d);
  const pending = await db
    .select()
    .from(T.decisions)
    .where(and(eq(T.decisions.accountId, k.ctx.accountId), eq(T.decisions.status, "PENDING")))
    .orderBy(asc(T.decisions.order));
  const rank = statusRank(d);
  const wanted = streamIds?.length ? d.streams.filter((s) => streamIds.includes(s.id)) : d.streams.filter((s) => s.active && s.inKanban && cards.some((c) => c.streamId === s.id));
  for (const st of wanted) {
    const list = cards.filter((c) => c.streamId === st.id).sort((a, b) => rank(a) - rank(b) || a.position - b.position);
    const open = list.filter((c) => !d.isDone(c.statusId));
    const sr = risks.filter((r) => r.streamId === st.id);
    const w = streamWeather(d, list, sr);
    const s = k.newSlide(`Focus stream : ${st.name}`, [st.leader ? `Leader : ${st.leader}` : "", sprint ? sprint.name : "", `${list.length - open.length} livrable(s) terminé(s) sur ${list.length}`].filter(Boolean).join(". "));
    tag(s, 9.59, 0.22, w.label, w.color, "right");
    const block = (x: number, y: number, wd: number, h: number, label: string, md: string, empty: string, color = C.blue) => {
      sectionHeader(s, x, y, wd, label, color);
      s.addText(runs(md.trim() || empty, { fontFace: BODY_FONT, fontSize: 7, color: md.trim() ? C.text : C.faint }, Math.round(h * wd * 120)), { x, y: y + 0.26, w: wd, h: h - 0.3, margin: 0, valign: "top", paraSpaceAfter: 2 });
    };
    const alerts = open.filter((c) => c.alertLevelId);
    const progress = open.filter((c) => !c.alertLevelId && (c.progressNote.trim() || c.statusId !== d.options.find((o) => o.kind === "CARD_STATUS")?.id));
    const one = (t: string, n: number) => clip(t.replace(/\n+/g, " "), n);
    block(0.42, 1.0, 4.52, 1.75, "Alertes", alerts.map((c) => `- **${one(c.title, 60)}** : ${one(c.alertsNote || "à préciser", 170)}`).join("\n"), "Aucune alerte en cours.", C.red);
    block(0.42, 2.85, 4.52, 2.25, "Avancement", progress.slice(0, 7).map((c) => `- **${one(c.title, 60)}**${c.progressNote.trim() ? ` : ${one(c.progressNote, 130)}` : ` (${d.optLabel(c.statusId, false)})`}`).join("\n"), "Rien en cours.");
    block(5.07, 1.0, 4.52, 1.25, "Risques & blocages", sr.map((r) => `- **${one(r.title, 70)}**${r.mitigation.trim() ? ` : ${one(r.mitigation, 110)}` : ""}`).join("\n"), "Aucun risque ouvert.", "C2410C");
    const next = open
      .filter((c) => c.nextSteps.trim() || c.dueDate)
      .sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"))
      .slice(0, 6)
      .map((c) => `- ${c.nextSteps.trim() ? `${one(c.nextSteps, 120)} (${one(c.title, 40)})` : `${one(c.title, 70)} pour le ${frDate(c.dueDate)}`}`);
    block(5.07, 2.35, 4.52, 1.45, "Prochaines étapes", next.join("\n"), "À définir.");
    block(5.07, 3.9, 4.52, 1.2, "Décisions attendues", pending.filter((p) => p.streamId === st.id).map((p) => `- ${one(p.title, 120)}${p.decidedOn ? ` (pour le ${frDate(p.decidedOn)})` : ""}`).join("\n"), "Aucune décision attendue.", C.ocre);
  }
}

// ---------------------------------------------------------------------------
// Ce que nous attendons du client
// ---------------------------------------------------------------------------

export async function expectationsSlides(k: DeckKit) {
  const { d, sprint } = k;
  const [actions, decisions] = await Promise.all([
    db.select().from(T.actions).where(and(eq(T.actions.accountId, k.ctx.accountId), eq(T.actions.status, "OPEN"), eq(T.actions.party, "CLIENT"))),
    db.select().from(T.decisions).where(and(eq(T.decisions.accountId, k.ctx.accountId), eq(T.decisions.status, "PENDING"))),
  ]);
  const client = d.account.clientShortName || d.account.clientName || "client";
  const items = [
    ...actions.map((a) => ({ streamId: a.streamId, text: a.title, due: a.dueDate, owner: d.contactName(a.ownerId) })),
    ...decisions.map((x) => ({ streamId: x.streamId, text: `Décision : ${x.title}`, due: x.decidedOn, owner: "" })),
  ].sort((a, b) => (a.due ?? "9").localeCompare(b.due ?? "9"));
  const groups = [...d.streams.filter((s) => items.some((i) => i.streamId === s.id)).map((s) => ({ id: s.id as string | null, name: s.name })), ...(items.some((i) => !i.streamId || !d.str.has(i.streamId)) ? [{ id: null, name: "Transverse" }] : [])];
  const tiles = groups.map((g) => ({ name: g.name, list: items.filter((i) => (g.id ? i.streamId === g.id : !i.streamId || !d.str.has(i.streamId))) }));
  const PER = 6;
  const title = `${sprint ? `${sprint.name} : ` : ""}ce que nous attendons de ${client}`;
  for (let i = 0; i < Math.max(tiles.length, 1); i += PER) {
    const s = k.newSlide(i ? `${title} (suite)` : title, `Actions ouvertes portées par ${d.account.clientName || client} et décisions attendues, par échéance`);
    const chunk = tiles.slice(i, i + PER);
    if (!chunk.length) s.addText("Aucune attente ouverte.", { x: 0.42, y: 1.2, w: 9, h: 0.3, fontFace: BODY_FONT, fontSize: 9, color: C.muted });
    chunk.forEach((t, j) => {
      const x = 0.42 + (j % 3) * 3.1;
      const y = 1.0 + Math.floor(j / 3) * 2.05;
      sectionHeader(s, x, y, 2.97, t.name, C.ocre);
      const lines = t.list.slice(0, 7).map((it) => `- ${clip(it.text, 110)}${it.due ? ` **(${frDate(it.due).slice(0, 5)})**` : ""}${it.owner ? `, ${it.owner}` : ""}`);
      if (t.list.length > 7) lines.push(`- et ${t.list.length - 7} autre(s)`);
      s.addText(runs(lines.join("\n"), { fontFace: BODY_FONT, fontSize: 7, color: C.text }, 640), { x, y: y + 0.27, w: 2.97, h: 1.68, margin: 0, valign: "top", paraSpaceAfter: 2 });
    });
  }
}

// ---------------------------------------------------------------------------
// COPROJ : avancement des streams en cartes (statut, avancement, prérequis)
// ---------------------------------------------------------------------------

export async function coprojSlides(k: DeckKit) {
  const { d } = k;
  const statusOpts = d.options.filter((o) => o.kind === "STREAM_STATUS");
  for (const m of k.meetings.filter((x) => x.meetingType.blocks.includes("STREAM_STATUS"))) {
    const st = (m.meetingType.settings ?? {}) as Record<string, string>;
    const all = m.statuses.filter((r) => r.streamId || r.progress.trim() || r.alerts.trim());
    // la ligne « Gouvernance » du statut va dans le bandeau de pied de slide, comme dans le deck COPROJ
    const gov = all.find((r) => /gouvernance/i.test(d.streamLabel(r.streamId, false)));
    const rows = all.filter((r) => r !== gov);
    const PER = 6;
    const [nextMeeting] = await db
      .select()
      .from(T.meetings)
      .where(and(eq(T.meetings.accountId, k.ctx.accountId), eq(T.meetings.meetingTypeId, m.meetingTypeId)))
      .orderBy(asc(T.meetings.date))
      .then((l) => l.filter((x) => x.date > m.date));
    for (let i = 0; i < Math.max(rows.length, 1); i += PER) {
      const s = k.newSlide(i ? "Avancement des streams Wifirst, alertes et prérequis (suite)" : "Avancement des streams Wifirst, alertes et prérequis", `${m.meetingType.name} du ${frDate(m.date)}`);
      let lx = 9.59;
      for (const o of [...statusOpts].reverse()) lx -= tag(s, lx, 0.66, o.label, colorOf(o.color), "right") + 0.06;
      const chunk = rows.slice(i, i + PER);
      if (!chunk.length) s.addText("Aucun statut renseigné.", { x: 0.42, y: 1.2, w: 9, h: 0.3, fontFace: BODY_FONT, fontSize: 9, color: C.muted });
      chunk.forEach((r, j) => {
        const x = 0.42 + (j % 3) * 3.1;
        const y = 0.98 + Math.floor(j / 3) * 1.97;
        const opts = r.statusIds.map((id) => d.opt.get(id)).filter((o): o is NonNullable<typeof o> => !!o);
        const worst = opts.find((o) => o.color === "red") ?? opts.find((o) => o.color === "ocre" || o.color === "amber") ?? opts[0];
        const color = worst ? colorOf(worst.color) : C.faint;
        s.addShape("rect", { x, y, w: 2.97, h: 1.9, fill: { color: C.card }, line: { color: C.line, width: 0.5 } });
        s.addShape("rect", { x, y, w: 0.05, h: 1.9, fill: { color }, line: { color, width: 0 } });
        s.addText(clip(d.streamLabel(r.streamId, false) || "Sans stream", 42), { x: x + 0.13, y: y + 0.07, w: 2.75, h: 0.2, fontFace: BODY_FONT, fontSize: 8.5, bold: true, color: C.petrol, margin: 0 });
        s.addText(opts.map((o) => o.label.toUpperCase()).join(" / ") || "NON RENSEIGNÉ", { x: x + 0.13, y: y + 0.27, w: 2.75, h: 0.15, fontFace: EXTRA, fontSize: 6.5, bold: true, color, margin: 0 });
        const hasAlerts = !!r.alerts.trim();
        s.addText((st.progressLabel || "Avancement").toUpperCase(), { x: x + 0.13, y: y + 0.47, w: 2.75, h: 0.13, fontFace: EXTRA, fontSize: 5.5, bold: true, color: C.blue, margin: 0 });
        s.addText(runs(r.progress || "Rien à signaler.", { fontFace: BODY_FONT, fontSize: 6.5, color: C.text }, hasAlerts ? 300 : 620), { x: x + 0.13, y: y + 0.6, w: 2.76, h: hasAlerts ? 0.66 : 1.27, margin: 0, valign: "top" });
        if (hasAlerts) {
          s.addText((st.alertsLabel || "Alertes et prérequis").toUpperCase(), { x: x + 0.13, y: y + 1.28, w: 2.75, h: 0.13, fontFace: EXTRA, fontSize: 5.5, bold: true, color: worst?.color === "red" ? C.red : C.ocre, margin: 0 });
          s.addText(runs(r.alerts, { fontFace: BODY_FONT, fontSize: 6.5, color: C.text }, 260), { x: x + 0.13, y: y + 1.41, w: 2.76, h: 0.46, margin: 0, valign: "top" });
        }
      });
      const cadence = `${m.meetingType.name}${m.meetingType.frequency ? ` (${m.meetingType.frequency.toLowerCase()})` : ""}${nextMeeting ? `, prochaine séance le ${frDate(nextMeeting.date)}` : ""}.`;
      const govText = gov ? flat([gov.progress, gov.alerts].filter((x) => x.trim()).join("\n")) : "";
      s.addShape("rect", { x: 0.42, y: 4.91, w: 9.17, h: 0.29, fill: { color: C.card }, line: { color: C.line, width: 0.5 } });
      s.addText(
        [
          { text: "GOUVERNANCE  ", options: { fontFace: EXTRA, bold: true, color: C.blue, fontSize: 6 } },
          { text: clip(govText || cadence, 330), options: { color: C.text } },
        ],
        { x: 0.52, y: 4.92, w: 8.97, h: 0.27, fontFace: BODY_FONT, fontSize: 6.5, margin: 0, valign: "middle" },
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Registre des décisions et relevé des actions
// ---------------------------------------------------------------------------

async function meetingsOfType(ctx: Ctx, typeId: string) {
  return db.select({ id: T.meetings.id, date: T.meetings.date }).from(T.meetings).where(and(eq(T.meetings.accountId, ctx.accountId), eq(T.meetings.meetingTypeId, typeId)));
}
const bornOn = (x: { meetingId: string | null; createdAt: Date }, ms: { id: string; date: string }[]) => ms.find((m) => m.id === x.meetingId)?.date ?? parisDay(x.createdAt);
const previous = (ms: { date: string }[], date: string) => ms.filter((m) => m.date < date).sort((a, b) => b.date.localeCompare(a.date))[0];

export async function decisionsSlides(k: DeckKit) {
  const { d } = k;
  const all = await db.select().from(T.decisions).where(eq(T.decisions.accountId, k.ctx.accountId)).orderBy(asc(T.decisions.order));
  const sets: { chapo: string; pending: DecisionRow[]; taken: DecisionRow[] }[] = [];
  for (const m of k.meetings.filter((x) => x.meetingType.blocks.includes("DECISIONS"))) {
    const ms = await meetingsOfType(k.ctx, m.meetingTypeId);
    const prev = previous(ms, m.date);
    const ofType = all.filter((x) => x.meetingTypeId === m.meetingTypeId);
    sets.push({
      chapo: `${m.meetingType.name} du ${frDate(m.date)}`,
      pending: ofType.filter((x) => x.status === "PENDING" && bornOn(x, ms) <= m.date),
      taken: ofType.filter((x) => x.status === "TAKEN" && (x.meetingId === m.id || (!x.meetingId && x.decidedOn && x.decidedOn <= m.date && (!prev || x.decidedOn > prev.date)))),
    });
  }
  if (!sets.length) {
    const since = parisDay(new Date(Date.now() - 30 * 86_400_000));
    sets.push({ chapo: "Décisions attendues et décisions prises ces 30 derniers jours", pending: all.filter((x) => x.status === "PENDING"), taken: all.filter((x) => x.status === "TAKEN" && (x.decidedOn ?? "") >= since) });
  }
  const filled = sets.filter((x) => x.taken.length || x.pending.length);
  for (const set of filled.length ? filled : sets.slice(0, 1)) {
    const rows: Cell[][] = [
      ...set.taken.map((x) => [
        { text: "Prise", options: { bold: true, color: C.teal } },
        { text: frDate(x.decidedOn) },
        { text: [{ text: x.title, options: { bold: true, breakLine: !!x.detail.trim() } }, ...(x.detail.trim() ? runs(x.detail, {}, 300) : [])] },
        { text: d.streamLabel(x.streamId, false) },
      ]),
      ...set.pending.map((x) => [
        { text: "Attendue", options: { bold: true, color: C.ocre } },
        { text: x.decidedOn ? `pour le ${frDate(x.decidedOn)}` : "" },
        { text: [{ text: x.title, options: { bold: true, breakLine: !!x.detail.trim() } }, ...(x.detail.trim() ? runs(x.detail, {}, 300) : [])] },
        { text: d.streamLabel(x.streamId, false) },
      ]),
    ] as Cell[][];
    if (!rows.length) rows.push([{ text: "" }, { text: "" }, { text: "Aucune décision." }, { text: "" }]);
    k.table("Registre des décisions", set.chapo, [k.head("Statut"), k.head("Date"), k.head("Décision"), k.head("Stream")], rows, [0.8, 1.0, 5.67, 1.7]);
  }
}

export async function actionsSlides(k: DeckKit) {
  const { d } = k;
  const all = await db.select().from(T.actions).where(eq(T.actions.accountId, k.ctx.accountId)).orderBy(asc(T.actions.order), asc(T.actions.createdAt));
  const sets: { chapo: string; list: ActionRow[] }[] = [];
  for (const m of k.meetings.filter((x) => x.meetingType.blocks.includes("ACTIONS"))) {
    const ms = await meetingsOfType(k.ctx, m.meetingTypeId);
    const prev = previous(ms, m.date);
    const list = all.filter((a) => a.meetingTypeId === m.meetingTypeId && bornOn(a, ms) <= m.date).filter((a) => a.status === "OPEN" || (a.closedAt && (!prev || parisDay(a.closedAt) > prev.date)));
    sets.push({ chapo: `${m.meetingType.name} du ${frDate(m.date)}. Une action ouverte est reprise d'une séance à l'autre jusqu'à sa clôture.`, list });
  }
  if (!sets.length) sets.push({ chapo: "Toutes les actions ouvertes, par échéance", list: all.filter((a) => a.status === "OPEN").sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9")) });
  const now = today();
  const filled = sets.filter((x) => x.list.length);
  for (const set of filled.length ? filled : sets.slice(0, 1)) {
    const withDue = set.list.some((a) => a.dueDate);
    const rows: Cell[][] = set.list.map((a, i) => {
      const late = a.status === "OPEN" && a.dueDate && a.dueDate < now;
      const owner = d.contactName(a.ownerId);
      return [
        { text: String(i + 1), options: { align: "center", color: C.muted } },
        { text: [{ text: partyLabel(d, a.party), options: { bold: true, color: a.party === "WIFIRST" ? C.blue : a.party === "CLIENT" ? C.ocre : C.teal, breakLine: !!owner } }, ...(owner ? [{ text: owner, options: { color: C.muted } }] : [])] },
        { text: d.streamLabel(a.streamId, false) },
        { text: a.title, options: a.status !== "OPEN" ? { color: C.muted, strike: "sngStrike" } : {} },
        ...(withDue ? [{ text: a.dueDate ? frDate(a.dueDate) : "", options: late ? { color: C.red, bold: true } : {} }] : []),
        { text: a.status === "DONE" ? "Faite" : a.status === "CANCELLED" ? "Abandonnée" : "Ouverte", options: { color: a.status === "DONE" ? C.teal : a.status === "CANCELLED" ? C.muted : C.text } },
      ] as Cell[];
    });
    if (!rows.length) rows.push([{ text: "" }, { text: "" }, { text: "" }, { text: "Aucune action." }, ...(withDue ? [{ text: "" }] : []), { text: "" }]);
    const header = [k.head("#"), k.head("Porteur"), k.head("Stream"), k.head("Action"), ...(withDue ? [k.head("Échéance")] : []), k.head("État")];
    k.table("Relevé des actions", set.chapo, header, rows, withDue ? [0.3, 1.3, 1.6, 4.27, 0.85, 0.85] : [0.3, 1.3, 1.6, 5.12, 0.85]);
  }
}

// ---------------------------------------------------------------------------
// Bilan de sprint
// ---------------------------------------------------------------------------

export async function sprintReviewSlides(k: DeckKit) {
  const { d, sprint } = k;
  if (!sprint) return;
  const r = await sprintReview(k.ctx, sprint.id);
  const pct = r.stats.total ? Math.round((r.stats.done / r.stats.total) * 100) : 0;
  const period = r.period.from !== "0000-01-01" ? `Du ${frDate(r.period.from)} au ${frDate(r.period.to)}` : `Jusqu'au ${frDate(r.period.to)}`;
  const s = k.newSlide(`Bilan du ${sprint.name}`, `${period}${sprint.objective.trim() ? `. Objectif : ${clip(sprint.objective, 160)}` : ""}`);
  const tiles: [string, string, string][] = [
    [String(r.stats.total), "livrables au périmètre", C.petrol],
    [`${r.stats.done} (${pct} %)`, "terminés", C.teal],
    [String(r.stats.carried), sprint.state === "DONE" && r.next ? `reportés au ${r.next.name}` : "restant à terminer", C.ocre],
    [String(r.stats.alerts), "en vigilance ou alerte", r.stats.alerts ? C.red : C.muted],
    [String(r.decisions.length), "décisions prises", C.blue],
  ];
  tiles.forEach(([v, l, col], i) => {
    const x = 0.42 + i * 1.85;
    s.addShape("rect", { x, y: 1.0, w: 1.75, h: 0.62, fill: { color: C.card }, line: { color: C.line, width: 0.5 } });
    s.addText(v, { x: x + 0.1, y: 1.04, w: 1.55, h: 0.32, fontFace: BODY_FONT, fontSize: 15, bold: true, color: col, margin: 0 });
    s.addText(l, { x: x + 0.1, y: 1.36, w: 1.6, h: 0.2, fontFace: BODY_FONT, fontSize: 6.5, color: C.muted, margin: 0 });
  });
  const line = (c: (typeof r.done)[number]) => `- ${clip(c.title, 70)}${c.streamId ? ` (${d.streamLabel(c.streamId, false)})` : ""}`;
  const col = (x: number, y: number, w: number, h: number, label: string, md: string, empty: string, color = C.blue) => {
    sectionHeader(s, x, y, w, label, color);
    s.addText(runs(md || empty, { fontFace: BODY_FONT, fontSize: 7, color: md ? C.text : C.faint }, Math.round(h * w * 115)), { x, y: y + 0.26, w, h: h - 0.3, margin: 0, valign: "top", paraSpaceAfter: 1 });
  };
  col(0.42, 1.8, 3.0, 3.25, "Livrables terminés", r.done.slice(0, 14).map(line).join("\n") + (r.done.length > 14 ? `\n- et ${r.done.length - 14} autre(s)` : ""), "Aucun livrable terminé.", C.teal);
  col(3.55, 1.8, 3.0, 3.25, sprint.state === "DONE" && r.next ? `Reportés au ${r.next.name}` : "Restant à terminer", r.carried.slice(0, 14).map((c) => (c.alertLevelId ? `- **${d.optLabel(c.alertLevelId, false)}** : ${line(c).slice(2)}` : line(c))).join("\n") + (r.carried.length > 14 ? `\n- et ${r.carried.length - 14} autre(s)` : ""), "Aucun livrable reporté.", C.ocre);
  col(6.68, 1.8, 2.91, 1.75, "Décisions prises", r.decisions.slice(0, 7).map((x) => `- ${x.decidedOn ? `${frDate(x.decidedOn).slice(0, 5)} : ` : ""}${clip(x.title, 90)}`).join("\n"), "Aucune décision consignée.");
  col(6.68, 3.65, 2.91, 1.4, "Actions", `- ${r.actionsClosed.length} close(s) pendant le sprint\n- ${r.actionsOpen.length} ouverte(s) à date${r.actionsOpen.filter((a) => a.party === "CLIENT").length ? `, dont ${r.actionsOpen.filter((a) => a.party === "CLIENT").length} côté ${d.account.clientShortName || d.account.clientName}` : ""}`, "");
}
