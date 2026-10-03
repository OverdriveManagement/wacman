import { Fragment, type ReactNode } from "react";

/**
 * Rendu d'un balisage léger : **gras**, [lien](url), retours à la ligne et puces « • » ou « - ».
 * Volontairement minimal : le contenu reste lisible tel quel dans les exports.
 */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<Fragment key={`${key}-t${i++}`}>{text.slice(last, m.index)}</Fragment>);
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={`${key}-b${i++}`}>{tok.slice(2, -2)}</strong>);
    else {
      const lm = /\[([^\]]+)\]\(([^)]+)\)/.exec(tok)!;
      const href = /^https?:\/\//.test(lm[2]) ? lm[2] : `https://${lm[2]}`;
      out.push(
        <a key={`${key}-a${i++}`} href={href} target="_blank" rel="noreferrer noopener">
          {lm[1]}
        </a>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(<Fragment key={`${key}-e`}>{text.slice(last)}</Fragment>);
  return out;
}

export function Markdown({ text, className = "", empty }: { text: string | null | undefined; className?: string; empty?: ReactNode }) {
  const t = (text ?? "").trim();
  if (!t) return empty ? <>{empty}</> : null;
  const lines = t.split("\n");
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = (k: number) => {
    if (list.length) {
      blocks.push(
        <ul key={`ul${k}`} className="my-1 ml-4 list-disc space-y-0.5 marker:text-muted">
          {list.map((l, i) => (
            <li key={i}>{inline(l, `li${k}-${i}`)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  lines.forEach((line, i) => {
    const b = /^\s*(?:•|-|\*)\s+(.*)$/.exec(line);
    if (b && !line.trim().startsWith("**")) {
      list.push(b[1]);
      return;
    }
    flush(i);
    if (!line.trim()) blocks.push(<div key={`sp${i}`} className="h-1.5" />);
    else blocks.push(<p key={`p${i}`}>{inline(line, `p${i}`)}</p>);
  });
  flush(lines.length);
  return <div className={`md whitespace-pre-wrap break-words ${className}`}>{blocks}</div>;
}
