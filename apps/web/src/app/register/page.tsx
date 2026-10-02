'use client';

import { Button } from '@mimo/ui';
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

export default function RegisterPage() {
  // useSearchParams exige une frontière Suspense pour le rendu statique.
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const { t } = useI18n();
  const router = useRouter();
  // Parent invité : après inscription, retour au lien d'invitation au lieu de créer une famille.
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
      await http.post('/auth/register', {
        email: form.get('email'),
        password: form.get('password'),
        displayName: form.get('displayName'),
      });
      await resetSessionCache(client);
      router.push(next ?? '/setup');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('auth.registerTitle')}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field
          label={t('auth.displayName')}
          name="displayName"
          placeholder={t('auth.displayNamePlaceholder')}
          maxLength={30}
          required
        />
        <Field label={t('auth.email')} name="email" type="email" autoComplete="email" required />
        <Field
          label={t('auth.password')}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          hint={t('auth.passwordHint')}
          required
        />
        {error && (
          <p role="alert" className="rounded-xl bg-coral/10 p-3 text-sm font-semibold text-coral">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" block loading={busy}>
          {t('auth.submitRegister')}
        </Button>
      </form>
      <p className="mt-4 text-center text-xs text-slate-500">{t('auth.privacyNote')}</p>
      <p className="mt-4 text-center text-sm text-slate-600">
        {t('auth.hasAccount')}{' '}
        <Link
          href={withNext('/login', next)}
          className="font-semibold text-primary underline-offset-2 hover:underline"
        >
          {t('welcome.login')}
        </Link>
      </p>
    </AuthShell>
  );
}
