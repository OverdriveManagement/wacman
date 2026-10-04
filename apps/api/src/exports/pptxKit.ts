import type PptxGenJS from "pptxgenjs";
import { markupToPlain, parseLine, tokenizeInline, type MarkToken } from "@wacman/core";

/** Briques communes des exports PowerPoint : palette, polices, texte mis en forme, tableaux paginés. */

export const C = {
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
export const COLOR_TOKENS: Record<string, string> = {
  blue: C.blue,
  teal: C.teal,
  ocre: C.ocre,
  red: C.red,
  amber: C.amber,
  slate: C.muted,
  violet: "7C3AED",
  green: "16A34A",
};
export const TITLE_FONT = "Hind Madurai";
export const BODY_FONT = "Inter";
export const W = 10;

export type Run = { text: string; options?: PptxGenJS.TextPropsOptions };

/**
 * Convertit le balisage léger en segments de texte PowerPoint :
 * **gras**, *italique*, __souligné__, ~~barré~~, ==surligné==, `code`, [lien](url) ;
 * puces « - », cases « [ ] » / « [x] », intertitres « ### ».
 */
export const STYLE: Record<string, PptxGenJS.TextPropsOptions> = {
  b: { bold: true },
  i: { italic: true },
  u: { underline: { style: "sng" } },
  s: { strike: "sngStrike" },
  mark: { highlight: "FDE68A" },
};

function tokenRuns(tokens: MarkToken[], opts: PptxGenJS.TextPropsOptions, out: Run[]) {
  for (const k of tokens) {
    if (k.t === "text") out.push({ text: k.v, options: opts });
    else if (k.t === "code") out.push({ text: k.v, options: { ...opts, fontFace: "Consolas" } });
    else if (k.t === "link") tokenRuns(k.children, { ...opts, color: C.blue }, out);
    else tokenRuns(k.children, { ...opts, ...STYLE[k.t] }, out);
  }
}

/** Segments PowerPoint d'un texte saisi, avec mise en forme ; max coupe proprement au-delà de max caractères. */
export function runs(md: string, base: PptxGenJS.TextPropsOptions = {}, max = Infinity): Run[] {
  const out: Run[] = [];
  const lines = (md ?? "").replace(/\r/g, "").replace(/\s+$/, "").split("\n");
  let used = 0;
  for (let li = 0; li < lines.length && used < max; li++) {
    const l = parseLine(lines[li]);
    const lineOpts: PptxGenJS.TextPropsOptions = { ...base, ...(l.kind === "heading" ? { bold: true } : {}) };
    const prefix = l.kind === "bullet" ? "• " : l.kind === "check" ? (l.done ? "☑ " : "☐ ") : l.kind === "number" ? `${l.n}. ` : "";
    const parts: Run[] = [];
    if (prefix) parts.push({ text: l.indent + prefix, options: lineOpts });
    tokenRuns(tokenizeInline(l.kind === "text" ? lines[li] : l.text), lineOpts, parts);
    if (!parts.length) parts.push({ text: " ", options: lineOpts });
    for (const p of parts) {
      if (used >= max) break;
      if (used + p.text.length > max) {
        out.push({ text: `${p.text.slice(0, Math.max(0, max - used - 1)).trimEnd()}…`, options: p.options });
        used = max;
        break;
      }
      out.push(p);
      used += p.text.length;
    }
    if (used < max && li < lines.length - 1) {
      out[out.length - 1].options = { ...out[out.length - 1].options, breakLine: true };
      used += 1;
    }
  }
  if (!out.length) out.push({ text: " ", options: { ...base } });
  return out;
}

/** Texte brut tronqué (titres, libellés courts). */
export const clip = (s: string, n: number) => {
  const t = markupToPlain(s ?? "").replace(/\s+\n/g, "\n").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

export type Cell = { text: string | Run[]; options?: PptxGenJS.TableCellProps };

/** Estime la hauteur (pouces) d'une ligne de tableau à 7 pt, pour paginer sans couper une ligne. */
export function rowHeight(row: Cell[], colW: number[]) {
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
export function paginate(header: Cell[], rows: Cell[][], colW: number[], available = 4.05) {
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
