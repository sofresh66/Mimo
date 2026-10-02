import type { GameEventView } from '@mimo/types';

type Tx = (key: string, vars?: Record<string, string | number>) => string;

/** Phrase lisible pour un événement de l'historique. */
export function eventText(event: GameEventView, tx: Tx): string {
  const p = event.payload;
  const str = (key: string) =>
    typeof p[key] === 'string' || typeof p[key] === 'number' ? String(p[key]) : '';
  const vars = {
    child: event.child?.displayName ?? '',
    creature: str('creatureName'),
    mission: str('missionTitle'),
    xp: str('xp'),
    level: str('level'),
    form: str('toName'),
    name: str('name'),
    zone: str('zoneName'),
    score: str('score'),
    max: str('maxScore'),
    points: str('points'),
    title: str('title'),
  };
  const text = tx(`events.${event.type}`, vars);
  return text === `events.${event.type}` ? tx('events.fallback') : text;
}

export function eventEmoji(event: GameEventView): string {
  const p = event.payload;
  if (typeof p.icon === 'string') return p.icon;
  if (typeof p.emoji === 'string') return p.emoji;
  const map: Record<string, string> = {
    LEVEL_UP: '⭐',
    EVOLUTION: '✨',
    CREATURE_HATCHED: '🐣',
    CREATURE_ADOPTED: '🥚',
    GAME_PLAYED: '🎲',
    FAMILY_MISSION_COMPLETED: '🤝',
  };
  return map[event.type] ?? '•';
}

/** Date relative courte (« il y a 5 min »). */
export function relativeTime(iso: string, locale = 'fr'): string {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}
