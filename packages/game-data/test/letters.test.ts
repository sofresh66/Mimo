import { describe, expect, it } from 'vitest';
import {
  CatalogIndex,
  LETTER_MAX_GRAPHEMES,
  defaultCatalog,
  graphemeCount,
  normalizeLetterContent,
} from '../src';

describe('texte des lettres', () => {
  it('refuse un texte vide ou fait uniquement d’espaces', () => {
    expect(normalizeLetterContent('')).toEqual({ ok: false, error: 'EMPTY' });
    expect(normalizeLetterContent('   \n\t   ')).toEqual({ ok: false, error: 'EMPTY' });
    expect(normalizeLetterContent('\u0000\u0007')).toEqual({ ok: false, error: 'EMPTY' });
  });

  it('accepte les emojis composés, comptés comme un seul caractère', () => {
    const family = '👨‍👩‍👧‍👦';
    expect(graphemeCount(family)).toBe(1);
    const result = normalizeLetterContent(`  Coucou Mamie ${family}💌🇫🇷  `);
    expect(result).toEqual({ ok: true, content: `Coucou Mamie ${family}💌🇫🇷`, length: 16 });
    // 500 emojis composés : longueur visible autorisée même si la chaîne brute est longue.
    expect(normalizeLetterContent('😀'.repeat(LETTER_MAX_GRAPHEMES)).ok).toBe(true);
  });

  it('refuse un texte trop long', () => {
    expect(normalizeLetterContent('a'.repeat(LETTER_MAX_GRAPHEMES)).ok).toBe(true);
    expect(normalizeLetterContent('a'.repeat(LETTER_MAX_GRAPHEMES + 1))).toEqual({
      ok: false,
      error: 'TOO_LONG',
    });
    expect(normalizeLetterContent('a\n'.repeat(40))).toEqual({ ok: false, error: 'TOO_LONG' });
    expect(normalizeLetterContent('👨‍👩‍👧‍👦'.repeat(400)).ok).toBe(false);
  });

  it('refuse un emoji invalide (demi-paire isolée)', () => {
    expect(normalizeLetterContent('coucou \uD83D')).toEqual({
      ok: false,
      error: 'INVALID_CHARACTERS',
    });
  });

  it('nettoie les caractères de contrôle et les lignes vides en série', () => {
    expect(normalizeLetterContent('Bonjour\r\n\r\n\r\n\r\nà toi\u0007 !')).toEqual({
      ok: true,
      content: 'Bonjour\n\nà toi !',
      length: 16,
    });
  });
});

describe('papiers à lettres', () => {
  const index = new CatalogIndex(defaultCatalog);

  it('ont un papier par défaut, uniques, jamais vendus', () => {
    expect(index.defaultStationery().key).toBe('paper_mimo');
    const papers = index.stationery();
    expect(papers.length).toBeGreaterThanOrEqual(8);
    for (const paper of papers) {
      expect(paper.unique).toBe(true);
      expect(paper.price).toBeUndefined();
      expect(paper.scene?.unlock.length).toBeGreaterThan(0);
    }
    expect(index.unlockables().length).toBe(papers.length + index.backgrounds().length);
  });

  it('ne sont jamais dans un coffre', () => {
    const papers = new Set(index.stationery().map((p) => p.key));
    for (const item of defaultCatalog.items) {
      for (const entry of item.loot?.entries ?? []) {
        if (entry.kind === 'item') expect(papers.has(entry.item)).toBe(false);
      }
    }
  });
});
