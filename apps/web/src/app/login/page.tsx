'use client';

import { Button, buttonClassName } from '@mimo/ui';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { AuthShell } from '@/components/AuthShell';
import { Field } from '@/components/forms';
import { useI18n } from '@/i18n';
import { http } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { safeNextPath, withNext } from '@/lib/navigation';
import { resetSessionCache } from '@/lib/session';

export default function LoginPage() {
  // useSearchParams exige une frontière Suspense pour le rendu statique.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  // Retour vers la page d'origine (ex. invitation) après connexion.
  const next = safeNextPath(useSearchParams().get('next'));
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await http.post('/auth/login', { email: form.get('email'), password: form.get('password') });
      await resetSessionCache(client);
      router.push(next ?? '/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('auth.loginTitle')}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label={t('auth.email')} name="email" type="email" autoComplete="email" required />
        <Field
          label={t('auth.password')}
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        {error && (
          <p role="alert" className="rounded-xl bg-coral/10 p-3 text-sm font-semibold text-coral">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" block loading={busy}>
          {t('auth.submitLogin')}
        </Button>
      </form>
      <div className="mt-6 border-t border-slate-100 pt-5 text-center">
        <p className="mb-3 text-sm text-slate-600">{t('auth.noAccount')}</p>
        <Link
          href={withNext('/register', next)}
          className={buttonClassName({ variant: 'secondary', block: true })}
        >
          {t('auth.createFamily')}
        </Link>
      </div>
      {process.env.NODE_ENV !== 'production' && (
        <p className="mt-3 text-center text-xs text-slate-400">{t('auth.demoHint')}</p>
      )}
    </AuthShell>
  );
}
