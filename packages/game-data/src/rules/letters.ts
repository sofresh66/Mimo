/** Nombre maximal de caractères visibles (graphèmes : un emoji compte pour un) d'une lettre. */
export const LETTER_MAX_GRAPHEMES = 500;
/** Nombre maximal de lignes d'une lettre (évite les lettres « étirées » à l'infini). */
export const LETTER_MAX_LINES = 30;
/** Borne brute (unités UTF-16) acceptée avant normalisation : emojis composés compris. */
export const LETTER_MAX_RAW_LENGTH = 4000;

export type LetterContentError = 'EMPTY' | 'TOO_LONG' | 'INVALID_CHARACTERS';

export type LetterContentResult =
  { ok: true; content: string; length: number } | { ok: false; error: LetterContentError };

const segmenter = new Intl.Segmenter('fr', { granularity: 'grapheme' });

/** Nombre de caractères visibles (graphèmes) d'un texte. */
export function graphemeCount(text: string): number {
  return Array.from(segmenter.segment(text)).length;
}

// Demi-paires UTF-16 isolées (emoji tronqué ou invalide).
const LONE_SURROGATE = /\p{Cs}/u;
// Caractères de contrôle, sauf le retour à la ligne (les tabulations deviennent des espaces).
// eslint-disable-next-line no-control-regex -- filtrage volontaire des caractères de contrôle
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u2028\u2029]/g;

/**
 * Normalise et valide le texte d'une lettre (règle partagée API / interface) : NFC, fins de
 * ligne unifiées, caractères de contrôle retirés, lignes vides en série réduites, espaces de
 * début et de fin supprimés. Refuse un texte vide (ou fait d'espaces), trop long ou contenant
 * un emoji invalide. Le texte n'est jamais interprété : aucun lien n'est rendu cliquable.
 */
export function normalizeLetterContent(raw: string): LetterContentResult {
  if (raw.length > LETTER_MAX_RAW_LENGTH) return { ok: false, error: 'TOO_LONG' };
  if (LONE_SURROGATE.test(raw)) return { ok: false, error: 'INVALID_CHARACTERS' };
  const content = raw
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(CONTROL, '')
    .replace(/[ \u00A0]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (content.length === 0) return { ok: false, error: 'EMPTY' };
  const length = graphemeCount(content);
  if (length > LETTER_MAX_GRAPHEMES || content.split('\n').length > LETTER_MAX_LINES) {
    return { ok: false, error: 'TOO_LONG' };
  }
  return { ok: true, content, length };
}
