import { AsyncLocalStorage } from 'node:async_hooks';
import { LOCALES, localize, type Locale, type LocalizedText } from '@mimo/game-data';
import type { NextFunction, Request, Response } from 'express';

const storage = new AsyncLocalStorage<Locale>();

/** Détermine la langue de la requête (en-tête `Accept-Language`), français par défaut. */
export function localeMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers['accept-language'] ?? '';
  const preferred = header
    .split(',')
    .map((part) => part.trim().slice(0, 2).toLowerCase())
    .find((code): code is Locale => (LOCALES as readonly string[]).includes(code));
  storage.run(preferred ?? 'fr', next);
}

export function currentLocale(): Locale {
  return storage.getStore() ?? 'fr';
}

/** Traduit un texte de contenu dans la langue de la requête courante. */
export function t(text: unknown): string {
  return localize(text as LocalizedText, currentLocale());
}
