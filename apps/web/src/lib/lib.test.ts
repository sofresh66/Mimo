import type { GameEventView } from '@mimo/types';
import { describe, expect, it } from 'vitest';
import en from '@/i18n/en';
import fr from '@/i18n/fr';
import { translate } from '@/i18n/core';
import { formatDuration } from './creature';
import { eventText } from './events';

describe('i18n', () => {
  it('remplace les variables et retombe sur le français', () => {
    expect(translate('fr', 'child.hello', { name: 'Haylie' })).toBe('Bonjour Haylie 👋');
    expect(translate('en', 'child.hello', { name: 'Haylie' })).toBe('Hello Haylie 👋');
    expect(translate('en', 'missions.title')).toBe(fr.missions.title);
  });

  it('la traduction anglaise ne contient que des clés existantes en français', () => {
    const check = (partial: object, reference: object, path: string) => {
      for (const [key, value] of Object.entries(partial)) {
        const ref = (reference as Record<string, unknown>)[key];
        expect(ref, `${path}${key}`).toBeDefined();
        if (typeof value === 'object') check(value as object, ref as object, `${path}${key}.`);
      }
    };
    check(en, fr, '');
  });

  it('ne contient aucun message culpabilisant pour les humeurs', () => {
    for (const text of Object.values(fr.moods)) {
      expect(text).not.toMatch(/triste|malade|mourir|faute|abandonn/i);
    }
  });
});

describe('formatDuration', () => {
  it('affiche des durées lisibles', () => {
    expect(formatDuration(15)).toBe('15 s');
    expect(formatDuration(90)).toBe('1 min 30 s');
    expect(formatDuration(3600)).toBe('1 h 00');
  });
});

describe('historique', () => {
  it('formate un événement de mission validée', () => {
    const event: GameEventView = {
      id: '1',
      type: 'MISSION_COMPLETED',
      child: { id: 'c', displayName: 'Jude', avatar: '🐼' },
      payload: { missionTitle: 'Lire 15 minutes', xp: 20 },
      createdAt: new Date().toISOString(),
    };
    expect(eventText(event, (k, v) => translate('fr', k, v))).toBe(
      'Jude : mission « Lire 15 minutes » validée (+20 XP)',
    );
  });
});
