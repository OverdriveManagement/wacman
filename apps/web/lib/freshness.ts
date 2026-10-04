import type { FreshnessLevel, FreshnessSettings } from "./types";

export const DEFAULT_FRESHNESS: FreshnessSettings = {
  enabled: true,
  hideDone: true,
  levels: [
    { maxDays: 7, emoji: "🟢", color: "green", label: "À jour" },
    { maxDays: 14, emoji: "🟠", color: "amber", label: "À relancer" },
    { maxDays: null, emoji: "🔴", color: "red", label: "Ancienne" },
  ],
};

/** Jour calendaire à Paris (AAAA-MM-JJ) d'un instant. */
function parisDay(d: Date) {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}

/** Nombre de jours calendaires (heure de Paris) écoulés depuis un instant. */
export function daysSince(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const a = Date.parse(`${parisDay(then)}T00:00:00Z`);
  const b = Date.parse(`${parisDay(now)}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** Palier correspondant à un nombre de jours. */
export function freshnessLevel(days: number, f: FreshnessSettings): { level: FreshnessLevel; index: number } {
  const i = f.levels.findIndex((l) => l.maxDays === null || days <= l.maxDays);
  const index = i === -1 ? f.levels.length - 1 : i;
  return { level: f.levels[index], index };
}

export function daysLabel(days: number) {
  return days === 0 ? "auj." : `${days} j`;
}

/** Libellé d'un palier pour l'aide : « 7 jours ou moins », « de 8 à 14 jours », « plus de 14 jours ». */
export function rangeLabel(levels: FreshnessLevel[], i: number) {
  const prev = i > 0 ? levels[i - 1].maxDays : null;
  const cur = levels[i].maxDays;
  if (cur === null) return prev === null ? "toujours" : `plus de ${prev} jours`;
  if (prev === null) return `${cur} jour${cur > 1 ? "s" : ""} ou moins`;
  return `de ${prev + 1} à ${cur} jours`;
}

/** Contrôle des paliers avant enregistrement (mêmes règles que l'API). */
export function freshnessError(f: FreshnessSettings): string | null {
  if (!f.levels.length) return "Au moins un palier.";
  for (let i = 0; i < f.levels.length - 1; i++) {
    const m = f.levels[i].maxDays;
    if (m === null || !Number.isInteger(m) || m < 0) return `Palier ${i + 1} : nombre de jours manquant.`;
    if (i > 0 && m <= (f.levels[i - 1].maxDays as number)) return "Les nombres de jours doivent être croissants.";
  }
  return null;
}
