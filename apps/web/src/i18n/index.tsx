'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  STORAGE_KEY,
  getStoredLocale,
  translate,
  type Locale,
  type MessageKey,
  type Vars,
} from './core';

export { LOCALES, getStoredLocale, translate, type Locale, type MessageKey } from './core';

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Vars) => string;
  /** Pour les clés dynamiques (codes d'erreur, types d'événements…). */
  tx: (key: string, vars?: Vars) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function I18nProvider({ children }: { children: ReactNode }) {
  // Préférence enregistrée sur l'appareil ; « fr » pendant le rendu serveur (hydratation sûre).
  const locale = useSyncExternalStore(subscribe, getStoredLocale, () => 'fr' as Locale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // stockage indisponible : la préférence ne sera pas conservée
    }
    listeners.forEach((l) => l());
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
      tx: (key, vars) => translate(locale, key, vars),
    }),
    [locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n doit être utilisé dans <I18nProvider>');
  return ctx;
}
