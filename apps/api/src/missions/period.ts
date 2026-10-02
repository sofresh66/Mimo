import type { MissionRecurrence } from '@prisma/client';
import { isoWeekKey } from '@mimo/game-data';

/** Date locale (AAAA-MM-JJ) dans le fuseau de la famille. */
export function localDate(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Clé de période d'une mission : une réalisation par jour (DAILY), par semaine ISO (WEEKLY)
 * ou une seule fois (ONCE).
 */
export function periodKey(recurrence: MissionRecurrence, now: Date, timezone: string): string {
  if (recurrence === 'ONCE') return 'once';
  const day = localDate(now, timezone);
  if (recurrence === 'DAILY') return day;
  return isoWeekKey(new Date(`${day}T12:00:00Z`));
}
