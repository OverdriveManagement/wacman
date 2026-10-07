import { Fragment, type ReactNode } from "react";
import { parseLine, tokenizeInline, type MarkToken } from "@/lib/markup";

/**
 * Rendu du balisage léger (mêmes règles que WacMan, voir RichText.tsx) :
 *   **gras**, *italique*, __souligné__, ~~barré~~, ==surligné==, `code`, [lien](url) ;
 *   lignes « - » ou « • » (puces), « 1. » (liste numérotée), « [ ] » / « [x] » (cases à cocher), « ### » (intertitre).
 * Volontairement simple : le texte reste lisible tel quel dans les exports.
 */

function render(tokens: MarkToken[], key: string): ReactNode[] {
  return tokens.map((k, i) => {
    const kk = `${key}-${i}`;
    switch (k.t) {
      case "text":
        return <Fragment key={kk}>{k.v}</Fragment>;
      case "code":
        return (
          <code key={kk} className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[0.85em]">
            {k.v}
          </code>
        );
      case "link":
        return (
          <a key={kk} href={k.href} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>
            {render(k.children, kk)}
          </a>
        );
      case "b":
        return <strong key={kk}>{render(k.children, kk)}</strong>;
      case "i":
        return <em key={kk}>{render(k.children, kk)}</em>;
      case "u":
        return <u key={kk}>{render(k.children, kk)}</u>;
      case "s":
        return (
          <s key={kk} className="opacity-75">
            {render(k.children, kk)}
          </s>
        );
      case "mark":
        return (
          <mark key={kk} className="rounded-sm px-0.5 text-inherit" style={{ background: "color-mix(in srgb, var(--amber) 35%, transparent)" }}>
            {render(k.children, kk)}
          </mark>
        );
    }
  });
}

/** Rendu d'une ligne de texte : règles communes à l'affichage et aux exports (lib/markup.ts). */
function inline(text: string, key: string): ReactNode[] {
  return render(tokenizeInline(text), key);
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
    const l = parseLine(line);
    const b = lastBlock();
    if (l.kind === "check") {
      const item = { text: l.text, done: !!l.done, i };
      if (b?.t === "check") b.items.push(item);
      else blocks.push({ t: "check", items: [item] });
    } else if (l.kind === "bullet") {
      if (b?.t === "ul") b.items.push({ text: l.text, i });
      else blocks.push({ t: "ul", items: [{ text: l.text, i }] });
    } else if (l.kind === "number") {
      if (b?.t === "ol") b.items.push({ text: l.text, i });
      else blocks.push({ t: "ol", start: l.n ?? 1, items: [{ text: l.text, i }] });
    } else if (l.kind === "heading") blocks.push({ t: "h", line: l.text, i });
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
