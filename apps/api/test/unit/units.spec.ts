import { redactUrl } from '../../src/common/all-exceptions.filter';
import { loadConfig } from '../../src/config/env';
import { generateChallenge, scoreMemory, scoreSubmission } from '../../src/minigames/generators';
import { periodKey } from '../../src/missions/period';
import { PIN_MAX_ATTEMPTS, pinFailure } from '../../src/auth/secrets';

describe('périodes de mission', () => {
  it('découpe selon le fuseau de la famille', () => {
    // 23h30 UTC le 1er octobre = 1h30 le 2 octobre à Paris.
    const date = new Date('2026-10-01T23:30:00Z');
    expect(periodKey('DAILY', date, 'Europe/Paris')).toBe('2026-10-02');
    expect(periodKey('DAILY', date, 'UTC')).toBe('2026-10-01');
    expect(periodKey('WEEKLY', date, 'Europe/Paris')).toBe('2026-W40');
    expect(periodKey('ONCE', date, 'Europe/Paris')).toBe('once');
  });
});

describe('verrouillage du PIN', () => {
  it('verrouille tous les 5 échecs, de plus en plus longtemps', () => {
    for (let i = 1; i < PIN_MAX_ATTEMPTS; i += 1) {
      const res = pinFailure(i, 0);
      expect(res.lockedUntil).toBeNull();
      expect(res.error.details?.remainingAttempts).toBe(PIN_MAX_ATTEMPTS - i);
    }
    expect(pinFailure(5, 0).lockedUntil?.getTime()).toBe(5 * 60_000);
    expect(pinFailure(6, 0).lockedUntil).toBeNull();
    expect(pinFailure(10, 0).lockedUntil?.getTime()).toBe(30 * 60_000);
    expect(pinFailure(15, 0).lockedUntil?.getTime()).toBe(24 * 3_600_000);
    expect(pinFailure(40, 0).lockedUntil?.getTime()).toBe(24 * 3_600_000);
  });
});

describe('mini-jeux', () => {
  it('le mémory rejoue les coups et pénalise doucement les essais', () => {
    const cards = ['a', 'b', 'a', 'b'];
    expect(scoreMemory(cards, [0, 2, 1, 3])).toMatchObject({ completed: true, score: 2 });
    // Beaucoup d'essais : le score baisse sans descendre sous 40 %.
    const many = [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 2, 1, 3];
    expect(scoreMemory(cards, many).score).toBe(1);
    expect(scoreMemory(cards, [0, 1])).toMatchObject({ completed: false });
    // Indices invalides ignorés.
    expect(scoreMemory(cards, [0, 0, 9, 1]).completed).toBe(false);
  });

  it('corrige le calcul mental à partir du défi stocké', () => {
    const stored = generateChallenge('math', 7, 'easy');
    const answers = stored.answers.map(Number);
    expect(scoreSubmission(stored, { kind: 'math', answers }).score).toBe(10);
    expect(
      scoreSubmission(stored, { kind: 'math', answers: answers.map((a) => a + 1) }).score,
    ).toBe(0);
  });

  it('génère des suites avec 4 choix dont la bonne réponse', () => {
    const stored = generateChallenge('sequence', 3, 'hard');
    if (stored.public.kind !== 'sequence') throw new Error('type');
    stored.public.questions.forEach((q, i) => {
      expect(q.choices.length).toBeGreaterThanOrEqual(2);
      expect(q.choices[Number(stored.answers[i])]).toBeDefined();
    });
    const answers = stored.answers.map(Number);
    expect(scoreSubmission(stored, { kind: 'sequence', answers }).score).toBe(
      stored.answers.length,
    );
  });
});

describe('configuration', () => {
  const base = { DATABASE_URL: 'postgresql://x', JWT_ACCESS_SECRET: 'a'.repeat(40) };
  it('refuse un secret JWT trop court', () => {
    expect(() => loadConfig({ ...base, JWT_ACCESS_SECRET: 'court' })).toThrow(/JWT_ACCESS_SECRET/);
  });
  it('exige des cookies sécurisés en production', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', COOKIE_SECURE: 'false' })).toThrow(
      /COOKIE_SECURE/,
    );
    expect(loadConfig({ ...base, NODE_ENV: 'production' }).cookieSecure).toBe(true);
  });
  it('Redis optionnel', () => {
    expect(loadConfig(base).redisUrl).toBeNull();
  });
});

describe('journalisation', () => {
  it('masque les jetons d’invitation dans les URL', () => {
    const token = 'A'.repeat(43);
    expect(redactUrl(`/api/invitations/${token}`)).toBe('/api/invitations/:token');
    expect(redactUrl(`/api/invitations/${token}/accept?x=1`)).toBe(
      '/api/invitations/:token/accept?x=1',
    );
    expect(redactUrl('/api/family/invitations')).toBe('/api/family/invitations');
  });
});
