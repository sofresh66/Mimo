'use client';

import { COMPANION_ACTIONS, type CompanionAction, type FamilySettings } from '@mimo/types';
import { Button, ParentPanel, Spinner } from '@mimo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Field, SelectField } from '@/components/forms';
import { useToast } from '@/components/Toast';
import { LOCALES, useI18n, type Locale, type MessageKey } from '@/i18n';
import { http } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { keys, useFamilySettings } from '@/lib/queries';
import { useSessionActions } from '@/lib/session';
import { setSoundEnabled, useSoundEnabled } from '@/lib/sound';

const ACTION_LABELS: Record<CompanionAction, MessageKey> = {
  story: 'companion.story',
  riddle: 'companion.riddle',
  math: 'companion.math',
  fact: 'companion.fact',
  joke: 'companion.joke',
};

export default function ParentSettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const { data: settings, isPending } = useFamilySettings();
  const sound = useSoundEnabled();

  if (isPending || !settings) return <Spinner size={36} />;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <FamilyPanel settings={settings} />
      <SecurityPanel />
      <ParentPanel title={t('parentSettings.language')}>
        <div className="flex flex-col gap-3">
          <SelectField
            label={t('parentSettings.language')}
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {l === 'fr' ? 'Français' : 'English'}
              </option>
            ))}
          </SelectField>
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              className="size-5 accent-primary"
              checked={sound}
              onChange={(e) => setSoundEnabled(e.target.checked)}
            />
            {t('parentSettings.sounds')}
          </label>
        </div>
      </ParentPanel>
      <ParentPanel title={t('parentSettings.privacy')}>
        <p className="text-sm leading-relaxed text-slate-600">{t('parentSettings.privacyText')}</p>
        <p className="mt-3 text-sm font-medium">{t('parentSettings.parents')}</p>
        <ul className="text-sm text-slate-600">
          {settings.parents.map((p) => (
            <li key={p.id}>
              {p.displayName} — {p.email}
            </li>
          ))}
        </ul>
      </ParentPanel>
    </div>
  );
}

function FamilyPanel({ settings }: { settings: FamilySettings }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [enabled, setEnabled] = useState(settings.companionEnabled);
  const [actions, setActions] = useState<CompanionAction[]>(settings.companionAllowedActions);
  const save = useMutation({
    mutationFn: (name: string) =>
      http.patch<FamilySettings>('/family', {
        name,
        companionEnabled: enabled,
        companionAllowedActions: actions,
      }),
    onSuccess: (data) => {
      client.setQueryData(keys.parent.settings, data);
      toast(t('parentSettings.saved'), 'success');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    save.mutate(String(new FormData(e.currentTarget).get('name') ?? ''));
  };
  return (
    <ParentPanel title={t('parentSettings.family')}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label={t('parentSettings.familyName')}
          name="name"
          defaultValue={settings.name}
          maxLength={40}
          required
        />
        <fieldset className="rounded-xl border border-slate-200 p-3">
          <legend className="px-1 text-sm font-semibold">{t('parentSettings.companion')}</legend>
          <p className="mb-2 text-xs text-slate-500">{t('parentSettings.companionHint')}</p>
          <label className="flex min-h-10 items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              className="size-5 accent-primary"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            {t('parentSettings.companionEnabled')}
          </label>
          <p className="mt-2 text-sm font-medium">{t('parentSettings.actions')}</p>
          {COMPANION_ACTIONS.map((a) => (
            <label key={a} className="flex min-h-10 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-primary"
                disabled={!enabled}
                checked={actions.includes(a)}
                onChange={(e) =>
                  setActions((list) =>
                    e.target.checked ? [...list, a] : list.filter((x) => x !== a),
                  )
                }
              />
              {t(ACTION_LABELS[a])}
            </label>
          ))}
        </fieldset>
        <Button type="submit" loading={save.isPending}>
          {t('common.save')}
        </Button>
      </form>
    </ParentPanel>
  );
}

function SecurityPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const { logout } = useSessionActions();

  const run = useMutation({
    mutationFn: async ({
      kind,
      form,
    }: {
      kind: 'pin' | 'password' | 'logoutAll';
      form?: FormData;
    }) => {
      if (kind === 'pin')
        await http.put('/family/parent-pin', {
          currentPassword: form?.get('currentPassword'),
          pin: form?.get('pin'),
        });
      if (kind === 'password')
        await http.post('/auth/password', {
          currentPassword: form?.get('currentPassword'),
          newPassword: form?.get('newPassword'),
        });
      if (kind === 'logoutAll') await http.post('/auth/logout-all');
      return kind;
    },
    onSuccess: async (kind) => {
      if (kind === 'logoutAll') {
        await logout();
        router.replace('/');
        return;
      }
      toast(t('parentSettings.saved'), 'success');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const submit = (kind: 'pin' | 'password') => (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    run.mutate({ kind, form: new FormData(formEl) }, { onSuccess: () => formEl.reset() });
  };

  return (
    <ParentPanel title={t('parentSettings.security')}>
      <form onSubmit={submit('pin')} className="flex flex-col gap-3 border-b border-slate-100 pb-4">
        <p className="text-sm font-semibold">{t('parentSettings.parentPin')}</p>
        <Field
          label={t('parentSettings.currentPassword')}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
        <Field
          label={t('parentSettings.newPin')}
          name="pin"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          autoComplete="off"
          required
        />
        <Button
          type="submit"
          variant="secondary"
          loading={run.isPending && run.variables?.kind === 'pin'}
        >
          {t('common.save')}
        </Button>
      </form>
      <form
        onSubmit={submit('password')}
        className="flex flex-col gap-3 border-b border-slate-100 py-4"
      >
        <p className="text-sm font-semibold">{t('parentSettings.changePassword')}</p>
        <Field
          label={t('parentSettings.currentPassword')}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
        <Field
          label={t('parentSettings.newPassword')}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
        <Button
          type="submit"
          variant="secondary"
          loading={run.isPending && run.variables?.kind === 'password'}
        >
          {t('common.save')}
        </Button>
      </form>
      <div className="pt-4">
        <p className="mb-2 text-sm text-slate-500">{t('parentSettings.logoutAllHint')}</p>
        <Button
          variant="danger"
          onClick={() => run.mutate({ kind: 'logoutAll' })}
          loading={run.isPending && run.variables?.kind === 'logoutAll'}
        >
          {t('parentSettings.logoutAll')}
        </Button>
      </div>
    </ParentPanel>
  );
}
