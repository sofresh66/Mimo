'use client';

import { useCallback } from 'react';
import { useI18n } from '@/i18n';
import { ApiError } from './api';

/** Message simple et bienveillant pour une erreur (jamais de détail technique). */
export function useErrorMessage() {
  const { tx, t } = useI18n();
  return useCallback(
    (error: unknown): string => {
      if (error instanceof ApiError) {
        if (error.code === 'NETWORK') return t('errors.network');
        if (error.code === 'PIN_INVALID' && typeof error.details?.remainingAttempts === 'number') {
          return t('welcome.pinInvalid', { count: error.details.remainingAttempts });
        }
        if (error.code === 'PIN_LOCKED' && typeof error.details?.retryInSeconds === 'number') {
          return t('welcome.pinLocked', { seconds: error.details.retryInSeconds });
        }
        const translated = tx(`errors.${error.code}`);
        if (translated !== `errors.${error.code}`) return translated;
      }
      return t('errors.generic');
    },
    [t, tx],
  );
}
