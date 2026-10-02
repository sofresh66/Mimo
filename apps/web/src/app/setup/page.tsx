'use client';

import { Avatar, Button, Spinner } from '@mimo/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { AuthShell } from '@/components/AuthShell';
import { ChildForm } from '@/components/ChildForm';
import { Field } from '@/components/forms';
import { useI18n } from '@/i18n';
import { http } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { keys, useProfiles } from '@/lib/queries';
import { ME_KEY, useSession } from '@/lib/session';

/** Parcours d'accueil d'un nouveau parent : famille + PIN parent, puis profils enfants. */
export default function SetupPage() {
  const { me, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !me) router.replace('/login');
  }, [loading, me, router]);

  if (loading || !me) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <Spinner size={36} />
      </main>
    );
  }
  return me.family ? <ChildrenStep /> : <FamilyStep />;
}

function FamilyStep() {
  const { t } = useI18n();
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
      await http.post('/family', { name: form.get('name'), parentPin: form.get('parentPin') });
      await client.invalidateQueries({ queryKey: ME_KEY });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('setup.title')}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field
          label={t('setup.familyName')}
          name="name"
          placeholder={t('setup.familyNamePlaceholder')}
          maxLength={40}
          required
        />
        <Field
          label={t('setup.parentPin')}
          name="parentPin"
          hint={t('setup.parentPinHint')}
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          autoComplete="off"
          required
        />
        {error && (
          <p role="alert" className="rounded-xl bg-coral/10 p-3 text-sm font-semibold text-coral">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" block loading={busy}>
          {t('setup.create')}
        </Button>
      </form>
    </AuthShell>
  );
}

function ChildrenStep() {
  const { t } = useI18n();
  const router = useRouter();
  const client = useQueryClient();
  const { data: profiles } = useProfiles();

  return (
    <AuthShell title={t('setup.childrenTitle')}>
      <p className="mb-4 text-sm text-slate-600">{t('setup.childrenHint')}</p>
      {profiles && profiles.length > 0 && (
        <ul className="mb-5 flex flex-wrap gap-2">
          {profiles.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-full bg-slate-100 py-1 pl-1 pr-3 text-sm font-semibold"
            >
              <Avatar emoji={p.avatar} color={p.color} size={30} />
              {p.displayName}
            </li>
          ))}
        </ul>
      )}
      <ChildForm onCreated={() => client.invalidateQueries({ queryKey: keys.profiles })} />
      <Button
        size="lg"
        variant="secondary"
        block
        className="mt-6"
        disabled={!profiles || profiles.length === 0}
        onClick={() => router.push('/')}
      >
        {t('setup.done')}
      </Button>
    </AuthShell>
  );
}
