import type { Metadata, Viewport } from 'next';
import { Fredoka, Nunito } from 'next/font/google';
import type { ReactNode } from 'react';
import { brand } from '@mimo/config';
import { Providers } from './providers';
import './globals.css';

const nunito = Nunito({ subsets: ['latin'], variable: '--font-nunito', display: 'swap' });
const fredoka = Fredoka({ subsets: ['latin'], variable: '--font-fredoka', display: 'swap' });

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? brand.appName;

export const metadata: Metadata = {
  title: { default: appName, template: `%s · ${appName}` },
  description: brand.description,
  applicationName: appName,
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: appName, statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: brand.themeColor,
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${nunito.variable} ${fredoka.variable}`}>
      {/* Des extensions de navigateur (ex. ColorZilla) ajoutent des attributs à <body> avant
          l'hydratation. Ne concerne que les attributs de cet élément, pas ses enfants. */}
      <body suppressHydrationWarning>
        <a
          href="#main"
          className="sr-only-focusable fixed left-3 top-3 z-[80] rounded-xl bg-primary px-4 py-2 font-bold text-white"
        >
          Aller au contenu
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
