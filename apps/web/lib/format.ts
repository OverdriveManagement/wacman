export function frDate(iso: string | null | undefined, withYear = true): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
}

export function longDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function relative(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7) return `il y a ${Math.floor(diff / 86400)} j`;
  return dateTime(iso);
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Jeton de couleur des options -> variable CSS */
export const tone: Record<string, string> = {
  blue: "var(--accent)",
  teal: "var(--teal)",
  ocre: "var(--ocre)",
  red: "var(--red)",
  amber: "var(--amber)",
  slate: "var(--slate)",
  violet: "var(--violet)",
  green: "var(--green)",
};

export const COLORS = Object.keys(tone);

export function isOverdue(iso: string | null | undefined) {
  if (!iso) return false;
  return iso.slice(0, 10) < todayIso();
}
