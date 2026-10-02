import { describe, expect, it } from 'vitest';
import { safeNextPath, withNext } from './navigation';

describe('safeNextPath', () => {
  it('accepte un chemin interne simple', () => {
    expect(safeNextPath('/join-parent/AbC_-123')).toBe('/join-parent/AbC_-123');
  });

  it('refuse les redirections externes ou ambiguës', () => {
    for (const value of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      '/parent?x=1',
      '',
      null,
    ]) {
      expect(safeNextPath(value)).toBeNull();
    }
  });

  it('withNext n’ajoute le paramètre que pour un chemin sûr', () => {
    expect(withNext('/login', '/join-parent/abc')).toBe('/login?next=%2Fjoin-parent%2Fabc');
    expect(withNext('/login', '//evil.example')).toBe('/login');
  });
});
