"use client";

import { forwardRef, useImperativeHandle, useRef, type KeyboardEvent, type TextareaHTMLAttributes } from "react";
import { Markdown } from "./Markdown";
import { tokenizeInline, tokensToText } from "@/lib/markup";

/**
 * Zone de texte avec barre de mise en forme, sur le modèle des éditeurs du marché (Notion, Jira, Teams).
 * Le texte reste stocké en balisage léger, lisible tel quel et repris dans les exports :
 *   **gras**  *italique*  __souligné__  ~~barré~~  ==surligné==  `code`  [lien](https://…)
 *   lignes : « - » puces, « 1. » liste numérotée, « [ ] » / « [x] » case à cocher, « ### » intertitre.
 * Raccourcis : Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Maj+X (barré), Ctrl+K (lien), Ctrl+Maj+8 (puces), Ctrl+Maj+7 (numérotée).
 */

type Wrap = { kind: "wrap"; before: string; after: string; placeholder: string };
type Line = { kind: "line"; prefix: string | ((i: number) => string); match: RegExp };
type Tool = { id: string; label: string; icon: React.ReactNode; key?: string; action: Wrap | Line | { kind: "link" } | { kind: "clear" } };

const LINE_PREFIX = /^(\s*)(?:[-•*]\s+|\d+[.)]\s+|\[[ xX]\]\s+|#{1,3}\s+)/;

export const TOOLS: Tool[] = [
  { id: "bold", label: "Gras (Ctrl+B)", key: "b", icon: <b className="font-bold">G</b>, action: { kind: "wrap", before: "**", after: "**", placeholder: "texte en gras" } },
  { id: "italic", label: "Italique (Ctrl+I)", key: "i", icon: <i className="font-serif italic">I</i>, action: { kind: "wrap", before: "*", after: "*", placeholder: "texte en italique" } },
  { id: "underline", label: "Souligné (Ctrl+U)", key: "u", icon: <span className="underline">S</span>, action: { kind: "wrap", before: "__", after: "__", placeholder: "texte souligné" } },
  { id: "strike", label: "Barré (Ctrl+Maj+X)", icon: <span className="line-through">ab</span>, action: { kind: "wrap", before: "~~", after: "~~", placeholder: "texte barré" } },
  { id: "mark", label: "Surligner", icon: <span className="rounded-sm bg-amber/40 px-0.5">Su</span>, action: { kind: "wrap", before: "==", after: "==", placeholder: "texte surligné" } },
  { id: "code", label: "Code ou référence", icon: <span className="font-mono text-[0.7rem]">{"<>"}</span>, action: { kind: "wrap", before: "`", after: "`", placeholder: "code" } },
  { id: "bullets", label: "Liste à puces (Ctrl+Maj+8)", icon: <BulletIcon />, action: { kind: "line", prefix: "- ", match: /^\s*[-•*]\s+/ } },
  { id: "numbers", label: "Liste numérotée (Ctrl+Maj+7)", icon: <NumberIcon />, action: { kind: "line", prefix: (i) => `${i + 1}. `, match: /^\s*\d+[.)]\s+/ } },
  { id: "check", label: "Liste de cases à cocher", icon: <CheckIcon />, action: { kind: "line", prefix: "[ ] ", match: /^\s*\[[ xX]\]\s+/ } },
  { id: "heading", label: "Intertitre", icon: <span className="text-[0.72rem] font-bold">T</span>, action: { kind: "line", prefix: "### ", match: /^\s*#{1,3}\s+/ } },
  { id: "link", label: "Lien (Ctrl+K)", key: "k", icon: <LinkIcon />, action: { kind: "link" } },
  { id: "clear", label: "Effacer la mise en forme", icon: <ClearIcon />, action: { kind: "clear" } },
];

/** Applique un outil au texte et à la sélection ; renvoie le nouveau texte et la nouvelle sélection. */
export function applyTool(value: string, start: number, end: number, tool: Tool): { value: string; start: number; end: number } {
  const a = tool.action;
  if (a.kind === "wrap") {
    const sel = value.slice(start, end);
    const mk = a.before[0];
    // un marqueur n'est « exactement » celui de l'outil que s'il n'est pas prolongé par le même caractère
    // (l'italique « * » ne doit pas défaire le gras « ** », ni l'inverse)
    const exactBefore = value.slice(start - a.before.length, start) === a.before && value[start - a.before.length - 1] !== mk;
    const exactAfter = value.slice(end, end + a.after.length) === a.after && value[end + a.after.length] !== mk;
    const innerOf = (x: string) => x.slice(a.before.length, x.length - a.after.length);
    const wrapsWhole =
      sel.length > a.before.length + a.after.length &&
      sel.startsWith(a.before) &&
      sel.endsWith(a.after) &&
      sel[a.before.length] !== mk &&
      sel[sel.length - a.after.length - 1] !== mk &&
      !innerOf(sel).includes(a.before); // « **A** et **B** » n'est pas un seul bloc gras
    // déjà entouré : on retire la mise en forme
    if (sel && exactBefore && exactAfter) {
      const v = value.slice(0, start - a.before.length) + sel + value.slice(end + a.after.length);
      return { value: v, start: start - a.before.length, end: end - a.before.length };
    }
    if (wrapsWhole) {
      const inner = innerOf(sel);
      return { value: value.slice(0, start) + inner + value.slice(end), start, end: start + inner.length };
    }
    // les espaces en bord de sélection restent hors des marqueurs
    const lead = sel.match(/^\s*/)![0].length;
    const trail = sel.match(/\s*$/)![0].length;
    // sélection en partie mise en forme (« **A** et **B** ») : tout passe dans le même style, comme dans les éditeurs du marché
    const strip = a.before === "*" ? /(?<!\*)\*(?!\*)/g : new RegExp(a.before.replace(/[*=~`]/g, "\\$&"), "g");
    const core = sel.slice(lead, sel.length - trail).replace(strip, "") || a.placeholder;
    const s = start + lead;
    const v = value.slice(0, s) + a.before + core + a.after + value.slice(s + (sel.length - lead - trail));
    return { value: v, start: s + a.before.length, end: s + a.before.length + core.length };
  }
  if (a.kind === "line") {
    const ls = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
    const leRaw = value.indexOf("\n", Math.max(end - (end > start && value[end - 1] === "\n" ? 1 : 0), start));
    const le = leRaw === -1 ? value.length : leRaw;
    const lines = value.slice(ls, le).split("\n");
    // « déjà en liste » seulement si au moins une ligne porte le préfixe : sur une ligne vide, le bouton ajoute le préfixe
    const all = lines.some((l) => l.trim()) && lines.every((l) => !l.trim() || a.match.test(l));
    const out = lines.map((l, i) => {
      if (!l.trim() && lines.length > 1) return l;
      const bare = l.replace(LINE_PREFIX, "$1");
      if (all) return bare;
      const indent = bare.match(/^\s*/)![0];
      return indent + (typeof a.prefix === "function" ? a.prefix(i) : a.prefix) + bare.slice(indent.length);
    });
    const block = out.join("\n");
    return { value: value.slice(0, ls) + block + value.slice(le), start: ls, end: ls + block.length };
  }
  if (a.kind === "link") {
    const sel = value.slice(start, end).trim();
    const isUrl = /^https?:\/\//.test(sel);
    const text = isUrl ? "lien" : sel || "texte du lien";
    const url = isUrl ? sel : "https://";
    const ins = `[${text}](${url})`;
    const v = value.slice(0, start) + ins + value.slice(end);
    // sélectionne l'adresse à compléter (ou le texte si l'adresse est déjà fournie)
    return isUrl ? { value: v, start: start + 1, end: start + 1 + text.length } : { value: v, start: start + text.length + 3, end: start + text.length + 3 + url.length };
  }
  // effacer la mise en forme de la sélection (ou de la ligne courante)
  let s = start;
  let e = end;
  if (s === e) {
    s = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
    const n = value.indexOf("\n", start);
    e = n === -1 ? value.length : n;
  }
  const cleaned = value
    .slice(s, e)
    .split("\n")
    .map((l) => tokensToText(tokenizeInline(l.replace(LINE_PREFIX, "$1"))))
    .join("\n");
  return { value: value.slice(0, s) + cleaned + value.slice(e), start: s, end: s + cleaned.length };
}

/** Prolonge une liste à la touche Entrée (puces, numéros, cases) ; une ligne de liste vide termine la liste. */
function continueList(value: string, pos: number): { value: string; pos: number } | null {
  const ls = pos === 0 ? 0 : value.lastIndexOf("\n", pos - 1) + 1;
  const line = value.slice(ls, pos);
  const m = line.match(/^(\s*)([-•*]\s+|(\d+)([.)])\s+|\[[ xX]\]\s+)/);
  if (!m) return null;
  if (line.trim() === m[0].trim()) {
    // élément vide : on sort de la liste
    const v = value.slice(0, ls) + value.slice(pos);
    return { value: v, pos: ls };
  }
  const next = m[3] ? `${m[1]}${Number(m[3]) + 1}${m[4]} ` : m[2].startsWith("[") ? `${m[1]}[ ] ` : `${m[1]}${m[2]}`;
  const v = `${value.slice(0, pos)}\n${next}${value.slice(pos)}`;
  return { value: v, pos: pos + 1 + next.length };
}

export function FormatToolbar({ onTool, compact = false }: { onTool: (t: Tool) => void; compact?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-lg border border-b-0 border-line bg-surface-2/80 px-1 py-0.5" role="toolbar" aria-label="Mise en forme">
      {TOOLS.filter((t) => !compact || ["bold", "italic", "underline", "strike", "bullets", "numbers", "link"].includes(t.id)).map((t, i) => (
        <span key={t.id} className="contents">
          {(t.id === "bullets" || t.id === "link") && <span className="mx-0.5 h-4 w-px bg-line" aria-hidden />}
          <button
            type="button"
            tabIndex={-1}
            className="inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-sm text-ink-2 transition hover:bg-surface-3 hover:text-ink"
            title={t.label}
            aria-label={t.label}
            // garde le focus dans la zone de texte (sinon l'édition se fermerait)
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onTool(t)}
            data-i={i}
          >
            {t.icon}
          </button>
        </span>
      ))}
    </div>
  );
}

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onChange: (v: string) => void;
  autoGrow?: boolean;
  compact?: boolean;
};

/** Zone de texte multi-ligne avec barre de mise en forme et raccourcis clavier. */
export const RichTextarea = forwardRef<HTMLTextAreaElement, Props>(function RichTextarea({ value, onChange, autoGrow = true, compact, className = "", onKeyDown, ...rest }, ref) {
  const el = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => el.current!);

  const grow = () => {
    if (autoGrow && el.current) {
      el.current.style.height = "auto";
      el.current.style.height = `${el.current.scrollHeight + 2}px`;
    }
  };
  const set = (v: string, s: number, e: number) => {
    onChange(v);
    requestAnimationFrame(() => {
      if (!el.current) return;
      el.current.focus();
      el.current.setSelectionRange(s, e);
      grow();
    });
  };
  const tool = (t: Tool) => {
    const ta = el.current;
    if (!ta) return;
    const r = applyTool(value, ta.selectionStart, ta.selectionEnd, t);
    set(r.value, r.start, r.end);
  };
  const keys = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    let t: Tool | undefined;
    if (mod && !e.shiftKey) t = TOOLS.find((x) => x.key === k);
    else if (mod && e.shiftKey && k === "x") t = TOOLS.find((x) => x.id === "strike");
    else if (mod && e.shiftKey && (e.key === "*" || e.code === "Digit8")) t = TOOLS.find((x) => x.id === "bullets");
    else if (mod && e.shiftKey && (e.key === "&" || e.code === "Digit7")) t = TOOLS.find((x) => x.id === "numbers");
    if (t) {
      e.preventDefault();
      tool(t);
      return;
    }
    if (e.key === "Enter" && !mod && !e.shiftKey && el.current && el.current.selectionStart === el.current.selectionEnd) {
      const r = continueList(value, el.current.selectionStart);
      if (r) {
        e.preventDefault();
        set(r.value, r.pos, r.pos);
        return;
      }
    }
    onKeyDown?.(e);
  };
  return (
    <div>
      <FormatToolbar onTool={tool} compact={compact} />
      <textarea
        ref={el}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          grow();
        }}
        onKeyDown={keys}
        onFocus={grow}
        className={`input !rounded-t-none ${className}`}
        {...rest}
      />
    </div>
  );
});

function BulletIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <circle cx="4.5" cy="6.5" r="1" fill="currentColor" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" />
      <circle cx="4.5" cy="17.5" r="1" fill="currentColor" />
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
    </svg>
  );
}
function NumberIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <path d="M10 6.5h10M10 12h10M10 17.5h10" />
      <text x="2" y="9" fontSize="7" fill="currentColor" stroke="none" fontFamily="Inter, sans-serif">1</text>
      <text x="2" y="14.5" fontSize="7" fill="currentColor" stroke="none" fontFamily="Inter, sans-serif">2</text>
      <text x="2" y="20" fontSize="7" fill="currentColor" stroke="none" fontFamily="Inter, sans-serif">3</text>
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="7" height="7" rx="1.5" />
      <path d="M4.8 7.5l1.5 1.5 2.5-3" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M13 7.5h8M13 17.5h8" />
    </svg>
  );
}
function LinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </svg>
  );
}
function ClearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 5h12M12 5l-3 14" />
      <path d="M15 15l5 5M20 15l-5 5" />
    </svg>
  );
}

/** Champ de formulaire riche : éditeur avec barre de mise en forme, ou rendu en lecture seule. */
export function RichField({ value, onChange, disabled, rows = 4, placeholder, compact }: { value: string; onChange: (v: string) => void; disabled?: boolean; rows?: number; placeholder?: string; compact?: boolean }) {
  if (disabled)
    return (
      <div className="min-h-[2.5rem] rounded-lg border border-line-soft px-3 py-2 text-sm text-ink-2">
        <Markdown text={value} empty={<span className="text-muted">-</span>} />
      </div>
    );
  return <RichTextarea rows={rows} value={value} onChange={onChange} placeholder={placeholder} compact={compact} />;
}
