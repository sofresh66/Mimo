import { translate } from '@/i18n/core';

export const metadata = { title: translate('fr', 'offline.title') };

/** Page servie par le service worker quand le réseau est indisponible. */
export default function OfflinePage() {
  return (
    <main
      id="main"
      className="kid-bg flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <span className="text-7xl" aria-hidden="true">
        🌙
      </span>
      <h1 className="font-display text-3xl font-bold">{translate('fr', 'offline.title')}</h1>
      <p className="max-w-sm text-lg text-ink/70">{translate('fr', 'offline.text')}</p>
      {/* Rechargement complet volontaire : la navigation côté client échouerait hors ligne. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/"
        className="rounded-2xl bg-primary px-6 py-3 font-display text-lg font-semibold text-white"
      >
        {translate('fr', 'common.retry')}
      </a>
    </main>
  );
}
