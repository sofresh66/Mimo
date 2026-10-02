const DAY_MS = 86_400_000;

/** Clé de semaine ISO (ex. « 2026-W40 »), utilisée pour les missions familiales hebdomadaires. */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Début (lundi 00:00 UTC) et fin de la semaine ISO contenant `date`. */
export function isoWeekRange(date: Date): { start: Date; end: Date } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  const start = new Date(d.getTime() - (day - 1) * DAY_MS);
  return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
}

/** Début de la journée (UTC), utilisé pour les plafonds quotidiens. */
export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
