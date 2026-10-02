import Link from 'next/link';
import type { ReactNode } from 'react';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'Mimo';

/** Mise en page sobre des écrans de compte parent. */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main id="main" className="kid-bg flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-6 block text-center font-display text-3xl font-bold text-primary"
        >
          {APP_NAME}
        </Link>
        <div className="rounded-3xl bg-white p-6 shadow-xl ring-1 ring-slate-100 sm:p-8">
          <h1 className="mb-6 text-2xl font-bold text-slate-900">{title}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}
