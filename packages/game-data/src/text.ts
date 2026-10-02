import type { Locale, LocalizedText } from './types';

/** Retourne le texte dans la langue demandée, avec repli sur le français. */
export function localize(text: LocalizedText, locale: Locale = 'fr'): string {
  return text[locale] ?? text.fr;
}
