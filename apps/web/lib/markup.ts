/**
 * Balisage léger de WacMan : découpage d'une ligne en segments mis en forme.
 * Source unique des règles, partagée par l'affichage, le compte rendu e-mail, les exports texte et PowerPoint.
 * ATTENTION : ce fichier existe en double (packages/core/src/markup.ts et apps/web/lib/markup.ts) ;
 * le test tools/check_markup_sync.sh vérifie qu'ils restent identiques.
 *
 *   **gras**  ***gras italique***  *italique*  __souligné__  ~~barré~~  ==surligné==  `code`  [lien](https://…)
 *
 * Règles de bord : un astérisque, un souligné double ou un double égal collé à une lettre ou un chiffre
 * n'ouvre pas de mise en forme (2*x + 3*y, nom__de__fichier, a==b restent du texte) ; les liens sont lus
 * en premier, si bien que les adresses ne sont jamais réinterprétées, y compris avec des parenthèses équilibrées.
 */

export type MarkStyle = "b" | "i" | "u" | "s" | "mark";
export type MarkToken =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "link"; href: string; children: MarkToken[] }
  | { t: MarkStyle; children: MarkToken[] };

const RULES =
  "`([^`\\n]+)`" + // 1 code
  "|\\[([^\\]\\n]+)\\]\\(((?:[^()\\s]|\\([^()\\s]*\\))+)\\)" + // 2 texte, 3 adresse
  "|\\*\\*\\*(?![\\s*])([^*\\n]+?)(?<![\\s*])\\*\\*\\*" + // 4 gras italique
  "|\\*\\*(?![\\s*])((?:[^*\\n]|\\*(?!\\*))+?)(?<!\\s)\\*\\*(?!\\*)" + // 5 gras (peut contenir de l'italique)
  "|(?<![\\p{L}\\p{N}_])__(?![\\s_])([^_\\n]+?)(?<!\\s)__(?![\\p{L}\\p{N}_])" + // 6 souligné
  "|~~(?![\\s~])([^~\\n]+?)(?<!\\s)~~" + // 7 barré
  "|(?<![=\\p{L}\\p{N}])==(?![\\s=])([^=\\n]+?)(?<!\\s)==(?![=\\p{L}\\p{N}])" + // 8 surligné
  "|(?<![\\p{L}\\p{N}_*])\\*(?![\\s*])([^*\\n]+?)(?<![\\s*])\\*(?![\\p{L}\\p{N}_*])"; // 9 italique

/** Découpe une ligne (sans retour à la ligne) en segments. */
export function tokenizeInline(text: string): MarkToken[] {
  const out: MarkToken[] = [];
  const re = new RegExp(RULES, "gu");
  let last = 0;
  let m: RegExpExecArray | null;
  const pushText = (v: string) => {
    if (!v) return;
    const prev = out[out.length - 1];
    if (prev && prev.t === "text") prev.v += v;
    else out.push({ t: "text", v });
  };
  while ((m = re.exec(text))) {
    pushText(text.slice(last, m.index));
    if (m[1] !== undefined) out.push({ t: "code", v: m[1] });
    else if (m[2] !== undefined) out.push({ t: "link", href: safeHref(m[3]), children: tokenizeInline(m[2]) });
    else if (m[4] !== undefined) out.push({ t: "b", children: [{ t: "i", children: tokenizeInline(m[4]) }] });
    else if (m[5] !== undefined) out.push({ t: "b", children: tokenizeInline(m[5]) });
    else if (m[6] !== undefined) out.push({ t: "u", children: tokenizeInline(m[6]) });
    else if (m[7] !== undefined) out.push({ t: "s", children: tokenizeInline(m[7]) });
    else if (m[8] !== undefined) out.push({ t: "mark", children: tokenizeInline(m[8]) });
    else if (m[9] !== undefined) out.push({ t: "i", children: tokenizeInline(m[9]) });
    last = m.index + m[0].length;
  }
  pushText(text.slice(last));
  return out;
}

/** Adresse sûre : http(s) et mailto conservés, le reste préfixé par https:// (jamais de javascript:). */
export function safeHref(url: string): string {
  return /^(https?:\/\/|mailto:)/i.test(url) ? url : `https://${url.replace(/^\/+/, "")}`;
}

/** Texte brut d'une suite de segments ; withUrls ajoute l'adresse des liens entre parenthèses. */
export function tokensToText(tokens: MarkToken[], withUrls = false): string {
  return tokens
    .map((k) => {
      if (k.t === "text" || k.t === "code") return k.v;
      if (k.t === "link") {
        const label = tokensToText(k.children, withUrls);
        return withUrls && label !== k.href ? `${label} (${k.href})` : label;
      }
      return tokensToText(k.children, withUrls);
    })
    .join("");
}

/** Préfixe de ligne : liste à puces, numérotée, case à cocher ou intertitre. */
export type LineKind = { kind: "bullet" | "number" | "check" | "heading" | "text"; indent: string; text: string; done?: boolean; n?: number };

export function parseLine(line: string): LineKind {
  let m: RegExpExecArray | null;
  if ((m = /^(\s*)\[( |x|X)\]\s+(.*)$/.exec(line))) return { kind: "check", indent: m[1], text: m[3], done: m[2] !== " " };
  if ((m = /^(\s*)#{1,3}\s+(.*)$/.exec(line))) return { kind: "heading", indent: m[1], text: m[2] };
  // « * » en début de ligne n'est une puce que s'il est suivi d'une espace et n'ouvre pas du gras
  if ((m = /^(\s*)(?:[-•]|\*(?!\*))\s+(.*)$/.exec(line))) return { kind: "bullet", indent: m[1], text: m[2] };
  if ((m = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line))) return { kind: "number", indent: m[1], text: m[3], n: Number(m[2]) };
  return { kind: "text", indent: "", text: line };
}

/** Texte brut d'un contenu complet (exports texte) : mise en forme retirée, listes et cases lisibles. */
export function markupToPlain(md: string | null | undefined, opts: { withUrls?: boolean; checks?: [string, string] } = {}): string {
  const [todo, done] = opts.checks ?? ["☐", "☑"];
  return (md ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => {
      const l = parseLine(line);
      const body = tokensToText(tokenizeInline(l.text), opts.withUrls ?? true);
      if (l.kind === "check") return `${l.indent}${l.done ? done : todo} ${body}`;
      if (l.kind === "bullet") return `${l.indent}- ${body}`;
      if (l.kind === "number") return `${l.indent}${l.n}. ${body}`;
      return `${l.indent}${body}`;
    })
    .join("\n")
    .replace(/[ \t]+$/gm, "");
}
