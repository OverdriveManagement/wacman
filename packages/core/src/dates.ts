/** Dates « jour » stockées en @db.Date : on manipule des chaînes AAAA-MM-JJ côté API. */
export function toDate(v: string | null | undefined): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) throw new Error(`Date invalide : ${v}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export function fromDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

/** 2026-10-05 -> 05/10/2026 */
export function frDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const s = typeof d === "string" ? d : d.toISOString().slice(0, 10);
  const [y, m, j] = s.slice(0, 10).split("-");
  return `${j}/${m}/${y}`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
