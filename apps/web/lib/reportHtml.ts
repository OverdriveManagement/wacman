/**
 * Compte rendu de séance en HTML, prêt à coller dans Gmail (ou Outlook) avec sa mise en forme.
 * Reprend la présentation du CR COPROJ envoyé le 03/10/2026 : Arial 14 px, titres de section numérotés
 * en bleu soulignés, tableaux à en-tête bleu, lignes alternées, statuts sur fond coloré.
 * Uniquement des styles en ligne et des attributs bgcolor : les messageries ignorent les feuilles de style.
 */

import type { AccountCtx } from "./hooks";
import type { Card, Meeting, MeetingType } from "./types";

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

/** Balisage léger d'une ligne vers HTML en ligne (texte déjà échappé). */
function inline(s: string) {
  return s
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/g, `<a href="$2" style="color:${BLUE}">$1</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/__([^_]+)__/g, "<u>$1</u>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>")
    .replace(/==([^=]+)==/g, `<span style="background-color:#fef08a">$1</span>`)
    .replace(/`([^`]+)`/g, `<code style="font-family:Consolas,monospace;font-size:12px;background-color:#f3f4f6;padding:0 3px">$1</code>`)
    .replace(/(^|[^*\w])\*([^*\s](?:[^*]*[^*\s])?)\*/g, "$1<i>$2</i>");
}

/** Texte saisi (balisage léger WacMan) vers HTML d'e-mail compact : listes, cases, titres, retours à la ligne. */
export function mdToHtml(src: string | null | undefined): string {
  const lines = esc((src ?? "").replace(/\r/g, "").trim()).split("\n");
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
    const ul = line.match(/^\s*(?:[-•*])\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      const tag = ul ? "ul" : "ol";
      if (!list || list.tag !== tag) {
        flush();
        list = { tag, items: [] };
      }
      list.items.push(inline((ul ?? ol)![1]));
      continue;
    }
    flush();
    const box = line.match(/^\s*\[([ xX])\]\s+(.*)$/);
    const h = line.match(/^\s*#{1,3}\s+(.*)$/);
    if (box) push(`${box[1] === " " ? "☐" : "☑"} ${inline(box[2])}`);
    else if (h) push(`<b>${inline(h[1])}</b>`);
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
}

/** Corps HTML complet du compte rendu. */
export function meetingReportHtml(meeting: Meeting, type: MeetingType, acc: AccountCtx, opts: ReportOptions = {}): string {
  const st = type.settings ?? {};
  const parts: string[] = [];
  let n = 0;

  parts.push(`<p>Bonjour,</p>`);
  parts.push(`<p>Vous trouverez ci-dessous le compte rendu du ${esc(type.name)} du ${mailDate(meeting.date)}.</p>`);

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
              lines(`<b>${inline(esc(h.title))}</b>`, h.detail.trim() && mdToHtml(h.detail)),
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
                `<b>${inline(esc(t.title))}</b>`,
                t.description.trim() && mdToHtml(t.description),
                t.decisionRequest.trim() && `<span style="color:#9a3412"><b>${esc(st.decisionLabel || "Arbitrage demandé")} :</b></span> ${mdToHtml(t.decisionRequest)}`,
              ),
            ];
          }),
        ),
      );
  }

  if (meeting.notes?.trim()) {
    parts.push(h3(++n, "Notes"));
    parts.push(`<p>${mdToHtml(meeting.notes)}</p>`);
  }

  parts.push(`<p style="margin-top:22px">N'hésitez pas à revenir vers moi pour tout complément.</p>`);
  parts.push(`<p>Bonne journée,${opts.signature ? `<br>${esc(opts.signature)}` : ""}</p>`);

  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.45;max-width:800px">\n${parts.join("\n")}\n</div>`;
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
