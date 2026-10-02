'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { ToastProvider } from '@/components/Toast';
import { I18nProvider } from '@/i18n';
import { ApiError } from '@/lib/api';
import { RealtimeProvider } from '@/lib/realtime';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: true,
            // Les erreurs 4xx (droits, validation) ne sont pas réessayées.
            retry: (count, error) =>
              !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
              count < 2,
          },
        },
      }),
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error: unknown) => {
      console.warn('Service worker non enregistré', error);
    });
  }, []);

  return (
    <QueryClientProvider client={client}>
      <I18nProvider>
        {/* Respecte « réduire les animations » du système. */}
        <MotionConfig reducedMotion="user">
          <ToastProvider>
            <RealtimeProvider>{children}</RealtimeProvider>
          </ToastProvider>
        </MotionConfig>
      </I18nProvider>
    </QueryClientProvider>
  );
}
