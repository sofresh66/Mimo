import Link from 'next/link';
import type { ReactNode } from 'react';

/** Titre de page enfant avec retour à l'accueil. */
export function PageHeader({
  title,
  subtitle,
  emoji,
  action,
}: {
  title: string;
  subtitle?: string;
  emoji?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-4 flex items-start gap-3">
      <Link
        href="/play"
        aria-label="Retour"
        className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-xl shadow-sm focus-visible:outline-4 focus-visible:outline-primary/50"
      >
        ←
      </Link>
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-2xl font-bold leading-tight">
          {emoji && (
            <span aria-hidden="true" className="mr-1">
              {emoji}
            </span>
          )}
          {title}
        </h1>
        {subtitle && <p className="text-ink/70">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
