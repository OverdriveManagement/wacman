/**
 * Compte rendu de séance en HTML, prêt à coller dans Gmail (ou Outlook) avec sa mise en forme.
 * Reprend la présentation du CR COPROJ envoyé le 03/10/2026 : Arial 14 px, titres de section numérotés
 * en bleu soulignés, tableaux à en-tête bleu, lignes alternées, statuts sur fond coloré.
 * Uniquement des styles en ligne et des attributs bgcolor : les messageries ignorent les feuilles de style.
 */

import type { AccountCtx } from "./hooks";
import type { Action, Card, Decision, Meeting, MeetingType, ReviewCard, SprintReview } from "./types";
import { fillTemplate, partyLabel, stripDecisions } from "./followup";
import { frDate } from "./format";
import { parseLine, tokenizeInline, type MarkToken } from "./markup";

const BLUE = "#1d4ed8";
const BORDER = "#e5e7eb";
const ZEBRA = "#f9fafb";
const MUTED = "#6b7280";

/** Couleur d'une valeur de liste WacMan : fond clair et texte foncé, lisibles sur fond blanc. */
const PAIRS: Record<string, { bg: string; fg: string }> = {
  green: { bg: "#dcfce7", fg: "#166534" },
  teal: { bg: "#dcfce7", fg: "#166534" },
  ocre: { bg: "#ffedd5", fg: "#9a3412" },
  amber: { bg: "#ffedd5", fg: "#9a3412" },
  red: { bg: "#fee2e2", fg: "#991b1b" },
  blue: { bg: "#dbeafe", fg: "#1e40af" },
  violet: { bg: "#ede9fe", fg: "#5b21b6" },
  slate: { bg: "#f3f4f6", fg: "#374151" },
};
const pair = (color?: string | null) => PAIRS[color ?? ""] ?? PAIRS.slate;

export function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Segments mis en forme vers HTML d'e-mail ; tout texte saisi est échappé. */
function tokensHtml(tokens: MarkToken[]): string {
  return tokens
    .map((k) => {
      switch (k.t) {
        case "text":
          return esc(k.v);
        case "code":
          return `<code style="font-family:Consolas,monospace;font-size:12px;background-color:#f3f4f6;padding:0 3px">${esc(k.v)}</code>`;
        case "link":
          return `<a href="${esc(k.href)}" style="color:${BLUE}">${tokensHtml(k.children)}</a>`;
        case "b":
          return `<b>${tokensHtml(k.children)}</b>`;
        case "i":
          return `<i>${tokensHtml(k.children)}</i>`;
        case "u":
          return `<u>${tokensHtml(k.children)}</u>`;
        case "s":
          return `<s>${tokensHtml(k.children)}</s>`;
        case "mark":
          return `<span style="background-color:#fef08a">${tokensHtml(k.children)}</span>`;
      }
    })
    .join("");
}

/** Balisage léger d'une ligne (texte brut saisi) vers HTML en ligne. */
function inline(s: string) {
  return tokensHtml(tokenizeInline(s));
}

/** Texte saisi (balisage léger WacMan) vers HTML d'e-mail compact : listes, cases, titres, retours à la ligne. */
export function mdToHtml(src: string | null | undefined): string {
  const lines = (src ?? "").replace(/\r/g, "").trim().split("\n");
  const out: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    out.push(`<${list.tag} style="margin:2px 0;padding-left:20px">${list.items.map((i) => `<li style="margin:1px 0">${i}</li>`).join("")}</${list.tag}>`);
    list = null;
  };
  const push = (html: string) => {
    if (out.length && !/^<(ul|ol)/.test(out[out.length - 1])) out.push("<br>");
    out.push(html);
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const l = parseLine(line);
    if (l.kind === "bullet" || l.kind === "number") {
      const tag = l.kind === "bullet" ? "ul" : "ol";
      if (!list || list.tag !== tag) {
        flush();
        list = { tag, items: [] };
      }
      list.items.push(inline(l.text));
      continue;
    }
    flush();
    if (l.kind === "check") push(`${l.done ? "☑" : "☐"} ${inline(l.text)}`);
    else if (l.kind === "heading") push(`<b>${inline(l.text)}</b>`);
    else push(inline(line.trim()));
  }
  flush();
  return out.join("");
}

// ------------------------------------------------------------------ briques de mise en page

/** Enchaîne des morceaux HTML avec un retour à la ligne, sauf après une liste (déjà un bloc). */
function lines(...parts: (string | false | null | undefined)[]) {
  return parts
    .filter((p): p is string => !!p)
    .reduce((acc, p) => (!acc ? p : /<\/(ul|ol)>$/.test(acc) ? acc + p : `${acc}<br>${p}`), "");
}

const h3 = (n: number, title: string) =>
  `<h3 style="color:${BLUE};font-size:16px;margin:22px 0 8px;border-bottom:2px solid ${BLUE};padding-bottom:4px">${n}. ${esc(title)}</h3>`;

const th = (label: string, width?: string) =>
  `<th align="left"${width ? ` width="${width}"` : ""} bgcolor="${BLUE}" style="background-color:${BLUE};color:#ffffff;padding:8px">${esc(label)}</th>`;

/** Tableau pleine largeur à en-tête bleu et lignes alternées. */
function table(head: [string, string?][], rows: string[][]) {
  const body = rows
    .map((cells, i) => {
      const z = i % 2 === 1;
      const td = (c: string) => `<td${z ? ` bgcolor="${ZEBRA}"` : ""} style="${z ? `background-color:${ZEBRA};` : ""}border-bottom:1px solid ${BORDER};padding:8px">${c}</td>`;
      return `<tr valign="top">${cells.map(td).join("")}</tr>`;
    })
    .join("\n");
  return `<table cellpadding="8" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;font-size:13px">
<tbody><tr>${head.map(([l, w]) => th(l, w)).join("")}</tr>
${body}
</tbody></table>`;
}

const tag = (label: string, color?: string | null) => `<span style="color:${pair(color).fg};font-size:12px">${esc(label)}</span>`;

/** « 1er octobre 2026 », « 8 octobre 2026 ». */
export function mailDate(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  const day = d.getUTCDate();
  return `${day === 1 ? "1er" : day} ${d.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })}`;
}

export interface ReportOptions {
  cards?: Card[]; // pour le bloc « cartes en vigilance ou en alerte »
  signature?: string; // prénom pour la formule finale
  actions?: Action[]; // relevé des actions de la séance (déjà filtré)
  decisions?: { pending: Decision[]; taken: Decision[] }; // décisions de la séance (déjà filtrées)
}

/** Variables des gabarits d'e-mail d'une séance. */
export function mailVars(meeting: Meeting, type: MeetingType, acc: AccountCtx) {
  const a = acc.data!.account;
  return { type: type.name, date: frDate(meeting.date), dateLongue: mailDate(meeting.date), compte: a.name, client: a.clientName };
}

/** Objet de l'e-mail du compte rendu (gabarit du type de séance, sinon « CR <type> du <date> »). */
export function mailSubject(meeting: Meeting, type: MeetingType, acc: AccountCtx) {
  return fillTemplate(type.settings?.mailSubject?.trim() || "CR {type} du {date}", mailVars(meeting, type, acc));
}

/** Corps HTML complet du compte rendu. */
export function meetingReportHtml(meeting: Meeting, type: MeetingType, acc: AccountCtx, opts: ReportOptions = {}): string {
  const st = type.settings ?? {};
  const parts: string[] = [];
  let n = 0;

  const vars = mailVars(meeting, type, acc);
  parts.push(`<p>Bonjour,</p>`);
  const intro = st.mailIntro?.trim() ? fillTemplate(st.mailIntro, vars) : `Vous trouverez ci-dessous le compte rendu du ${type.name} du ${vars.dateLongue}.`;
  parts.push(`<p>${mdToHtml(intro)}</p>`);

  // ------------------------------------------------ faits marquants
  if (type.blocks.includes("HIGHLIGHTS")) {
    parts.push(h3(++n, "Faits marquants"));
    if (!meeting.highlights.length) parts.push(`<p style="color:${MUTED}">Aucun fait marquant.</p>`);
    else
      parts.push(
        table(
          [["Type", "18%"], ["Stream", "22%"], ["Fait marquant"]],
          meeting.highlights.map((h) => {
            const t = h.typeId ? acc.opt.get(h.typeId) : null;
            const s = h.streamId ? acc.str.get(h.streamId) : null;
            return [
              t ? `<b style="color:${pair(t.color).fg}">${esc(`${t.emoji ? `${t.emoji} ` : ""}${t.label}`)}</b>` : "",
              s ? esc(s.name) : `<span style="color:${MUTED}">Transverse</span>`,
              lines(`<b>${inline(h.title)}</b>`, h.detail.trim() && mdToHtml(h.detail)),
            ];
          }),
        ),
      );
  }

  // ------------------------------------------------ cartes en vigilance ou en alerte
  if (type.blocks.includes("ALERT_CARDS") && opts.cards) {
    const levels = acc.byKind("ALERT_LEVEL");
    const rank = (id: string | null) => -levels.findIndex((l) => l.id === id);
    const list = opts.cards.filter((c) => c.alertLevelId && !c.archived && !acc.isDone(c.statusId)).sort((a, b) => rank(a.alertLevelId) - rank(b.alertLevelId) || a.ref - b.ref);
    parts.push(h3(++n, "Cartes en vigilance ou en alerte"));
    if (!list.length) parts.push(`<p style="color:${MUTED}">Aucune carte en vigilance ou en alerte.</p>`);
    else
      parts.push(
        table(
          [["Niveau", "14%"], ["Stream", "20%"], ["Livrable"], ["Porteur", "16%"]],
          list.map((c) => {
            const l = c.alertLevelId ? acc.opt.get(c.alertLevelId) : null;
            const s = c.streamId ? acc.str.get(c.streamId) : null;
            const owner = c.ownerId ? acc.ctc.get(c.ownerId)?.name : "";
            const due = c.dueDate && `<span style="color:${MUTED};font-size:12px">Échéance ${c.dueDate.slice(8, 10)}/${c.dueDate.slice(5, 7)}</span>`;
            return [
              l ? `<span style="color:${pair(l.color).fg};font-weight:bold;white-space:nowrap">${esc(l.label)}</span>` : "",
              s ? esc(s.name) : "",
              lines(`<b>${esc(c.title)}</b>`, c.alertsNote.trim() && mdToHtml(c.alertsNote), due),
              esc(owner ?? ""),
            ];
          }),
        ),
      );
  }

  // ------------------------------------------------ statut des streams : vue d'ensemble puis synthèse
  if (type.blocks.includes("STREAM_STATUS")) {
    const rows = meeting.statuses.filter((r) => r.streamId || r.progress.trim() || r.alerts.trim());
    const name = (id: string | null) => (id ? acc.str.get(id)?.name ?? "Stream" : "Sans stream");
    const statuses = acc.byKind("STREAM_STATUS");

    parts.push(h3(++n, "Vue d'ensemble"));
    if (!rows.length) parts.push(`<p style="color:${MUTED}">Aucun statut renseigné.</p>`);
    else {
      const overview = statuses.map((o) => {
        const p = pair(o.color);
        const streams = rows.filter((r) => r.statusIds.includes(o.id)).map((r) => name(r.streamId));
        return `<tr><td bgcolor="${p.bg}" style="background-color:${p.bg};color:${p.fg};font-weight:bold;white-space:nowrap;padding:6px 10px">${esc(o.label)}</td><td style="padding:6px 10px">${streams.length ? esc(streams.join(", ")) : "Aucun"}</td></tr>`;
      });
      const none = rows.filter((r) => !r.statusIds.some((id) => statuses.some((o) => o.id === id))).map((r) => name(r.streamId));
      if (none.length) overview.push(`<tr><td bgcolor="#f3f4f6" style="background-color:#f3f4f6;color:#374151;font-weight:bold;white-space:nowrap;padding:6px 10px">Non renseigné</td><td style="padding:6px 10px">${esc(none.join(", "))}</td></tr>`);
      parts.push(`<table cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;font-size:13px">
<tbody><tr><th align="left" bgcolor="${BLUE}" style="background-color:${BLUE};color:#ffffff;padding:6px 10px">Statut</th><th align="left" bgcolor="${BLUE}" style="background-color:${BLUE};color:#ffffff;padding:6px 10px">Streams</th></tr>
${overview.join("\n")}
</tbody></table>`);

      parts.push(h3(++n, "Synthèse par stream"));
      const alertsLabel = st.alertsLabel || "Alertes";
      parts.push(
        table(
          [["Stream", "24%"], ["Synthèse"]],
          rows.map((r) => {
            const opts = r.statusIds.map((id) => acc.opt.get(id)).filter((o): o is NonNullable<typeof o> => !!o);
            const worst = opts.some((o) => o.color === "red") ? "red" : "ocre";
            const left = `<b>${esc(name(r.streamId))}</b>${opts.length ? `<br>${opts.map((o) => tag(o.label, o.color)).join(", ")}` : ""}`;
            let right = mdToHtml(r.progress);
            if (r.alerts.trim()) {
              // un texte d'alerte qui porte déjà son propre libellé en gras n'est pas préfixé
              const labelled = /^\s*(?:\S{1,3}\s+)?\*\*[^*]+\*\*/.test(r.alerts);
              const alerts = mdToHtml(r.alerts);
              right = lines(right, labelled ? alerts : `<span style="color:${pair(worst).fg}"><b>${esc(alertsLabel)} :</b></span> ${alerts}`);
            }
            return [left, right || `<span style="color:${MUTED}">Rien à signaler.</span>`];
          }),
        ),
      );
    }
  }

  // ------------------------------------------------ sujets
  // avec le registre des décisions, les lignes « Décision : … » d'un sujet sont présentées dans la section Décisions
  const request = (txt: string) => (type.blocks.includes("DECISIONS") ? stripDecisions(txt) : txt);
  if (type.blocks.includes("TOPICS")) {
    parts.push(h3(++n, "Sujets"));
    if (!meeting.topics.length) parts.push(`<p style="color:${MUTED}">Aucun sujet.</p>`);
    else
      parts.push(
        table(
          [["#", "5%"], ["Nature", "18%"], ["Sujet"]],
          meeting.topics.map((t, i) => {
            const theme = t.themeId ? acc.opt.get(t.themeId) : null;
            const nature = t.natureId ? acc.opt.get(t.natureId) : null;
            const tags = [theme, nature].filter((o): o is NonNullable<typeof o> => !!o);
            return [
              String(i + 1),
              tags.map((o) => `<span style="color:${pair(o.color).fg};font-weight:bold">${esc(o.label)}</span>`).join("<br>"),
              lines(
                `<b>${inline(t.title)}</b>`,
                t.description.trim() && mdToHtml(t.description),
                request(t.decisionRequest).trim() && `<span style="color:#9a3412"><b>${esc(st.decisionLabel || "Arbitrage demandé")} :</b></span> ${mdToHtml(request(t.decisionRequest))}`,
              ),
            ];
          }),
        ),
      );
  }

  // ------------------------------------------------ décisions
  if (type.blocks.includes("DECISIONS") && opts.decisions && (opts.decisions.taken.length || opts.decisions.pending.length)) {
    parts.push(h3(++n, "Décisions"));
    const sname = (id: string | null) => (id ? esc(acc.str.get(id)?.name ?? "") : "");
    const row = (d: Decision) => [d.decidedOn ? frDate(d.decidedOn) : "", lines(`<b>${inline(d.title)}</b>`, d.detail.trim() && mdToHtml(d.detail)), sname(d.streamId)];
    if (opts.decisions.taken.length) parts.push(table([["Date", "12%"], ["Décision prise"], ["Stream", "22%"]], opts.decisions.taken.map(row)));
    if (opts.decisions.pending.length) {
      if (opts.decisions.taken.length) parts.push(`<div style="height:10px"></div>`);
      parts.push(table([["Pour le", "12%"], ["Décision attendue"], ["Stream", "22%"]], opts.decisions.pending.map(row)));
    }
  }

  // ------------------------------------------------ relevé des actions (présentation du CR COPROJ du 03/10/2026)
  if (type.blocks.includes("ACTIONS") && opts.actions && opts.actions.length) {
    parts.push(h3(++n, "Relevé des actions"));
    const withDue = opts.actions.some((a) => a.dueDate);
    parts.push(
      table(
        [["#", "5%"], ["Porteur", "13%"], ["Stream", "24%"], ["Action"], ...(withDue ? ([["Échéance", "11%"]] as [string, string][]) : [])],
        opts.actions.map((a, i) => {
          const owner = a.ownerId ? acc.ctc.get(a.ownerId)?.name : "";
          const state = a.status === "DONE" ? ` <span style="color:#166534;font-size:12px">(fait)</span>` : a.status === "CANCELLED" ? ` <span style="color:${MUTED};font-size:12px">(abandonnée)</span>` : "";
          return [
            String(i + 1),
            esc(partyLabel(a.party, acc)) + (owner ? `<br><span style="color:${MUTED};font-size:12px">${esc(owner)}</span>` : ""),
            a.streamId ? esc(acc.str.get(a.streamId)?.name ?? "") : "",
            `${inline(a.title)}${state}`,
            ...(withDue ? [a.dueDate ? frDate(a.dueDate) : ""] : []),
          ];
        }),
      ),
    );
  }

  if (meeting.notes?.trim()) {
    parts.push(h3(++n, "Notes"));
    parts.push(`<p>${mdToHtml(meeting.notes)}</p>`);
  }

  const outro = st.mailOutro?.trim() ? fillTemplate(st.mailOutro, vars) : "N'hésitez pas à revenir vers moi pour tout complément.";
  parts.push(`<p style="margin-top:22px">${mdToHtml(outro)}</p>`);
  parts.push(`<p>Bonne journée,${opts.signature ? `<br>${esc(opts.signature)}` : ""}</p>`);

  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.45;max-width:800px">\n${parts.join("\n")}\n</div>`;
}

// ------------------------------------------------------------------ bilan de sprint (B9)

/** Objet de l'e-mail du bilan de sprint. */
export function sprintReviewSubject(r: SprintReview, acc: AccountCtx) {
  return `${acc.data!.account.name} : bilan du ${r.sprint.name}`;
}

function sprintFacts(r: SprintReview) {
  const pct = r.stats.total ? Math.round((r.stats.done / r.stats.total) * 100) : 0;
  const period = r.period.from !== "0000-01-01" ? `du ${frDate(r.period.from)} au ${frDate(r.period.to)}` : `jusqu'au ${frDate(r.period.to)}`;
  return { pct, period };
}

/** Bilan d'un sprint en HTML d'e-mail, dans la présentation du compte rendu de séance. */
export function sprintReviewHtml(r: SprintReview, acc: AccountCtx, signature?: string): string {
  const parts: string[] = [];
  let n = 0;
  const { pct, period } = sprintFacts(r);
  const sname = (id: string | null) => (id ? esc(acc.str.get(id)?.name ?? "") : `<span style="color:${MUTED}">Transverse</span>`);
  const cardCell = (c: ReviewCard, note?: string) => lines(`<b>${esc(`#${c.ref} ${c.title}`)}</b>`, note?.trim() && mdToHtml(note), c.dueDate && `<span style="color:${MUTED};font-size:12px">Échéance ${frDate(c.dueDate)}</span>`);
  const byStream = (list: ReviewCard[]) => [...list].sort((a, b) => (acc.str.get(a.streamId ?? "")?.order ?? 999) - (acc.str.get(b.streamId ?? "")?.order ?? 999) || a.ref - b.ref);

  parts.push(`<p>Bonjour,</p>`);
  parts.push(`<p>Voici le bilan du ${esc(r.sprint.name)} (${period}).</p>`);

  parts.push(h3(++n, "Synthèse"));
  const facts = [
    `<b>${r.stats.done}</b> livrable${r.stats.done > 1 ? "s" : ""} terminé${r.stats.done > 1 ? "s" : ""} sur <b>${r.stats.total}</b> (${pct} %)`,
    r.sprint.state === "DONE"
      ? r.stats.carried
        ? `<b>${r.stats.carried}</b> reporté${r.stats.carried > 1 ? "s" : ""}${r.next ? ` au ${esc(r.next.name)}` : ""}`
        : "aucun livrable reporté"
      : `<b>${r.stats.carried}</b> restant${r.stats.carried > 1 ? "s" : ""} à terminer`,
    r.stats.alerts ? `<b>${r.stats.alerts}</b> en vigilance ou en alerte` : "aucun livrable en alerte",
    `${r.decisions.length} décision${r.decisions.length > 1 ? "s" : ""} prise${r.decisions.length > 1 ? "s" : ""}, ${r.actionsClosed.length} action${r.actionsClosed.length > 1 ? "s" : ""} close${r.actionsClosed.length > 1 ? "s" : ""}`,
  ];
  parts.push(`<ul style="margin:2px 0;padding-left:20px">${facts.map((f) => `<li style="margin:1px 0">${f}</li>`).join("")}</ul>`);
  if (r.sprint.objective.trim()) parts.push(`<p><b>Objectif du sprint :</b> ${mdToHtml(r.sprint.objective)}</p>`);
  if (r.sprint.clientMilestone.trim()) parts.push(`<p><b>Échéance ${esc(acc.data!.account.clientName)} :</b> ${mdToHtml(r.sprint.clientMilestone)}</p>`);

  parts.push(h3(++n, "Livrables terminés"));
  parts.push(r.done.length ? table([["Stream", "24%"], ["Livrable"]], byStream(r.done).map((c) => [sname(c.streamId), cardCell(c)])) : `<p style="color:${MUTED}">Aucun livrable terminé.</p>`);

  if (r.carried.length) {
    parts.push(h3(++n, r.sprint.state === "DONE" && r.next ? `Livrables reportés au ${r.next.name}` : "Livrables restant à terminer"));
    parts.push(
      table(
        [["Stream", "24%"], ["Livrable"], ["Alerte", "14%"]],
        byStream(r.carried).map((c) => {
          const l = c.alertLevelId ? acc.opt.get(c.alertLevelId) : null;
          return [sname(c.streamId), cardCell(c), l ? `<span style="color:${pair(l.color).fg};font-weight:bold">${esc(l.label)}</span>` : ""];
        }),
      ),
    );
  }

  if (r.alerts.length) {
    parts.push(h3(++n, "Points de vigilance"));
    parts.push(
      table(
        [["Niveau", "14%"], ["Stream", "20%"], ["Livrable"]],
        r.alerts.map((c) => {
          const l = c.alertLevelId ? acc.opt.get(c.alertLevelId) : null;
          return [l ? `<span style="color:${pair(l.color).fg};font-weight:bold;white-space:nowrap">${esc(l.label)}</span>` : "", sname(c.streamId), cardCell(c, c.alertsNote)];
        }),
      ),
    );
  }

  if (r.decisions.length) {
    parts.push(h3(++n, "Décisions prises pendant le sprint"));
    parts.push(table([["Date", "12%"], ["Décision"], ["Stream", "22%"]], r.decisions.map((d) => [d.decidedOn ? frDate(d.decidedOn) : "", lines(`<b>${inline(d.title)}</b>`, d.detail.trim() && mdToHtml(d.detail)), d.streamId ? sname(d.streamId) : ""])));
  }

  if (r.actionsOpen.length) {
    parts.push(h3(++n, "Actions ouvertes"));
    const withDue = r.actionsOpen.some((a) => a.dueDate);
    parts.push(
      table(
        [["Porteur", "14%"], ["Stream", "22%"], ["Action"], ...(withDue ? ([["Échéance", "11%"]] as [string, string][]) : [])],
        r.actionsOpen.map((a) => {
          const owner = a.ownerId ? acc.ctc.get(a.ownerId)?.name : "";
          return [
            esc(partyLabel(a.party, acc)) + (owner ? `<br><span style="color:${MUTED};font-size:12px">${esc(owner)}</span>` : ""),
            a.streamId ? sname(a.streamId) : "",
            inline(a.title),
            ...(withDue ? [a.dueDate ? frDate(a.dueDate) : ""] : []),
          ];
        }),
      ),
    );
  }

  if (r.next) {
    parts.push(h3(++n, `Suite : ${r.next.name}`));
    const bits = [
      r.next.startDate && `Du ${frDate(r.next.startDate)} au ${frDate(r.next.endDate)}.`,
      r.next.objective.trim() && `<b>Objectif :</b> ${mdToHtml(r.next.objective)}`,
      r.next.clientMilestone.trim() && `<b>Échéance ${esc(acc.data!.account.clientName)} :</b> ${mdToHtml(r.next.clientMilestone)}`,
    ];
    parts.push(`<p>${lines(...bits) || "Le sprint suivant démarre."}</p>`);
  }

  parts.push(`<p style="margin-top:22px">N'hésitez pas à revenir vers moi pour tout complément.</p>`);
  parts.push(`<p>Bonne journée,${signature ? `<br>${esc(signature)}` : ""}</p>`);
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.45;max-width:800px">\n${parts.join("\n")}\n</div>`;
}

/** Version texte du bilan de sprint (secours de la copie). */
export function sprintReviewText(r: SprintReview, acc: AccountCtx, signature?: string): string {
  const { pct, period } = sprintFacts(r);
  const sn = (id: string | null) => (id ? acc.str.get(id)?.name ?? "" : "Transverse");
  const out: string[] = ["Bonjour,", "", `Voici le bilan du ${r.sprint.name} (${period}).`, ""];
  const done = r.sprint.state === "DONE";
  out.push("SYNTHÈSE", `- ${r.stats.done} livrables terminés sur ${r.stats.total} (${pct} %)`, `- ${r.stats.carried} ${done ? `reportés${r.next ? ` au ${r.next.name}` : ""}` : "restant à terminer"}`, `- ${r.stats.alerts} en vigilance ou en alerte`, "");
  const sec = (title: string, rows: string[]) => rows.length && out.push(title, ...rows, "");
  sec("LIVRABLES TERMINÉS", r.done.map((c) => `- ${sn(c.streamId)} : #${c.ref} ${c.title}`));
  sec(done && r.next ? `REPORTÉS AU ${r.next.name.toUpperCase()}` : "RESTANT À TERMINER", r.carried.map((c) => `- ${sn(c.streamId)} : #${c.ref} ${c.title}`));
  sec("POINTS DE VIGILANCE", r.alerts.map((c) => `- ${sn(c.streamId)} : #${c.ref} ${c.title}${c.alertsNote.trim() ? ` (${c.alertsNote.trim().replace(/\s+/g, " ").slice(0, 200)})` : ""}`));
  sec("DÉCISIONS PRISES", r.decisions.map((d) => `- ${d.decidedOn ? frDate(d.decidedOn) + " : " : ""}${d.title}`));
  sec("ACTIONS OUVERTES", r.actionsOpen.map((a) => `- ${partyLabel(a.party, acc)} : ${a.title}${a.dueDate ? ` (échéance ${frDate(a.dueDate)})` : ""}`));
  out.push("Bonne journée,", ...(signature ? [signature] : []));
  return out.join("\n");
}

/**
 * Copie en texte enrichi (HTML) avec une version texte en secours.
 * Les contenus sont passés en promesses pour que Safari accepte la copie après un chargement.
 */
export async function copyRich(html: Promise<string> | string, text: Promise<string> | string) {
  const h = Promise.resolve(html);
  const t = Promise.resolve(text);
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": h.then((s) => new Blob([s], { type: "text/html" })),
          "text/plain": t.then((s) => new Blob([s], { type: "text/plain" })),
        }),
      ]);
      return "rich" as const;
    } catch {
      /* repli ci-dessous */
    }
  }
  // repli : sélection d'un bloc HTML caché et commande de copie du navigateur
  const [hs, ts] = await Promise.all([h, t]);
  const box = document.createElement("div");
  box.contentEditable = "true";
  box.style.cssText = "position:fixed;left:-10000px;top:0;opacity:0";
  box.innerHTML = hs;
  document.body.appendChild(box);
  const range = document.createRange();
  range.selectNodeContents(box);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  sel?.removeAllRanges();
  box.remove();
  if (ok) return "rich" as const;
  await navigator.clipboard.writeText(ts);
  return "text" as const;
}
