import { Fragment, type ReactNode } from "react";

/**
 * Rendu du balisage léger saisi dans WacMan (voir RichText.tsx) :
 *   **gras**, *italique*, __souligné__, ~~barré~~, ==surligné==, `code`, [lien](url) ;
 *   lignes « - » ou « • » (puces), « 1. » (liste numérotée), « [ ] » / « [x] » (cases à cocher), « ### » (intertitre).
 * Volontairement simple : le texte reste lisible tel quel dans les exports.
 */

const TOKEN = /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|==[^=]+==|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\*[^*\s](?:[^*]*[^*\s])?\*)/g;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  const re = new RegExp(TOKEN.source, "g");
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<Fragment key={`${key}-t${i++}`}>{text.slice(last, m.index)}</Fragment>);
    const tok = m[0];
    const k = `${key}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={k}>{inline(tok.slice(2, -2), k)}</strong>);
    else if (tok.startsWith("__")) out.push(<u key={k}>{inline(tok.slice(2, -2), k)}</u>);
    else if (tok.startsWith("~~")) out.push(<s key={k} className="opacity-75">{inline(tok.slice(2, -2), k)}</s>);
    else if (tok.startsWith("==")) out.push(<mark key={k} className="rounded-sm px-0.5 text-inherit" style={{ background: "color-mix(in srgb, var(--amber) 35%, transparent)" }}>{inline(tok.slice(2, -2), k)}</mark>);
    else if (tok.startsWith("`")) out.push(<code key={k} className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[0.85em]">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[")) {
      const lm = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(tok)!;
      const href = /^(https?:|mailto:)/.test(lm[2]) ? lm[2] : `https://${lm[2]}`;
      out.push(
        <a key={k} href={href} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>
          {inline(lm[1], k)}
        </a>,
      );
    } else out.push(<em key={k}>{inline(tok.slice(1, -1), k)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(<Fragment key={`${key}-e`}>{text.slice(last)}</Fragment>);
  return out;
}

type Block =
  | { t: "p"; line: string; i: number }
  | { t: "sp"; i: number }
  | { t: "h"; line: string; i: number }
  | { t: "ul"; items: { text: string; i: number }[] }
  | { t: "ol"; start: number; items: { text: string; i: number }[] }
  | { t: "check"; items: { text: string; done: boolean; i: number }[] };

export function Markdown({
  text,
  className = "",
  empty,
  onToggleCheck,
}: {
  text: string | null | undefined;
  className?: string;
  empty?: ReactNode;
  /** rend les cases à cocher cliquables : reçoit le numéro de la ligne à basculer */
  onToggleCheck?: (lineIndex: number) => void;
}) {
  const t = (text ?? "").replace(/\s+$/, "");
  if (!t.trim()) return empty ? <>{empty}</> : null;
  const lines = t.split("\n");
  const blocks: Block[] = [];
  const lastBlock = () => blocks[blocks.length - 1];
  lines.forEach((line, i) => {
    let m: RegExpExecArray | null;
    if ((m = /^\s*\[( |x|X)\]\s+(.*)$/.exec(line))) {
      const b = lastBlock();
      const item = { text: m[2], done: m[1] !== " ", i };
      if (b?.t === "check") b.items.push(item);
      else blocks.push({ t: "check", items: [item] });
    } else if ((m = /^\s*(?:•|-|\*)\s+(.*)$/.exec(line)) && !line.trim().startsWith("**")) {
      const b = lastBlock();
      if (b?.t === "ul") b.items.push({ text: m[1], i });
      else blocks.push({ t: "ul", items: [{ text: m[1], i }] });
    } else if ((m = /^\s*(\d+)[.)]\s+(.*)$/.exec(line))) {
      const b = lastBlock();
      if (b?.t === "ol") b.items.push({ text: m[2], i });
      else blocks.push({ t: "ol", start: Number(m[1]), items: [{ text: m[2], i }] });
    } else if ((m = /^\s*#{1,3}\s+(.*)$/.exec(line))) blocks.push({ t: "h", line: m[1], i });
    else if (!line.trim()) blocks.push({ t: "sp", i });
    else blocks.push({ t: "p", line, i });
  });
  return (
    <div className={`md whitespace-pre-wrap break-words ${className}`}>
      {blocks.map((b, bi) => {
        switch (b.t) {
          case "sp":
            return <div key={`sp${b.i}`} className="h-1.5" />;
          case "h":
            return (
              <p key={`h${b.i}`} className="mt-1 font-semibold text-ink">
                {inline(b.line, `h${b.i}`)}
              </p>
            );
          case "p":
            return <p key={`p${b.i}`}>{inline(b.line, `p${b.i}`)}</p>;
          case "ul":
            return (
              <ul key={`ul${bi}`} className="my-1 ml-4 list-disc space-y-0.5 marker:text-muted">
                {b.items.map((it) => (
                  <li key={it.i}>{inline(it.text, `li${it.i}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={`ol${bi}`} start={b.start} className="my-1 ml-5 list-decimal space-y-0.5 marker:text-muted">
                {b.items.map((it) => (
                  <li key={it.i}>{inline(it.text, `ol${it.i}`)}</li>
                ))}
              </ol>
            );
          case "check":
            return (
              <ul key={`ck${bi}`} className="my-1 space-y-0.5">
                {b.items.map((it) => (
                  <li key={it.i} className="flex items-start gap-2">
                    <button
                      type="button"
                      disabled={!onToggleCheck}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleCheck?.(it.i);
                      }}
                      className={`mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border text-[0.6rem] leading-none ${it.done ? "border-teal bg-teal text-white" : "border-muted"} ${onToggleCheck ? "cursor-pointer" : "cursor-default"}`}
                      aria-label={it.done ? "Décocher" : "Cocher"}
                      aria-pressed={it.done}
                    >
                      {it.done ? "✓" : ""}
                    </button>
                    <span className={it.done ? "text-muted line-through" : ""}>{inline(it.text, `ck${it.i}`)}</span>
                  </li>
                ))}
              </ul>
            );
        }
      })}
    </div>
  );
}

/** Bascule la case à cocher de la ligne donnée (« [ ] » vers « [x] » et inversement). */
export function toggleCheckLine(text: string, lineIndex: number): string {
  const lines = text.split("\n");
  const l = lines[lineIndex];
  if (l === undefined) return text;
  lines[lineIndex] = l.replace(/^(\s*)\[( |x|X)\]/, (_m, sp, c) => `${sp}[${c === " " ? "x" : " "}]`);
  return lines.join("\n");
}
