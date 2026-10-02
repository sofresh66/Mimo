import en from './en';
import fr, { type Messages } from './fr';
import type { DeepPartial, Leaves } from './types';

/** Fonctions de traduction utilisables côté serveur comme côté client. */
export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export type MessageKey = Leaves<Messages>;
export type Vars = Record<string, string | number>;

const dictionaries: Record<Locale, DeepPartial<Messages>> = { fr, en };
export const STORAGE_KEY = 'mimo.locale';

function lookup(dict: unknown, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export function translate(locale: Locale, key: MessageKey | string, vars?: Vars): string {
  const template = lookup(dictionaries[locale], key) ?? lookup(fr, key) ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

export function getStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'fr';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return (LOCALES as readonly string[]).includes(stored ?? '') ? (stored as Locale) : 'fr';
  } catch {
    return 'fr';
  }
}
