'use client';

import { Avatar, Button } from '@mimo/ui';
import { useState, type FormEvent } from 'react';
import { useI18n } from '@/i18n';
import { http } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { AVATARS, CHILD_COLORS, ChoiceGrid, Field } from './forms';

type AvatarOption = (typeof AVATARS)[number];
type ColorOption = (typeof CHILD_COLORS)[number];

/** Création d'un profil enfant : prénom/pseudo, avatar, couleur et code secret. */
export function ChildForm({
  onCreated,
  submitLabel,
}: {
  onCreated: () => void;
  submitLabel?: string;
}) {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const [avatar, setAvatar] = useState<AvatarOption>(AVATARS[0]);
  const [color, setColor] = useState<ColorOption>(CHILD_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    setBusy(true);
    setError(null);
    try {
      await http.post('/children', {
        displayName: String(form.get('displayName') ?? ''),
        pin: String(form.get('pin') ?? ''),
        avatar,
        color,
      });
      formEl.reset();
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar emoji={avatar} color={color} size={56} />
        <Field
          label={t('parentChildren.name')}
          name="displayName"
          maxLength={24}
          required
          className="flex-1"
        />
      </div>
      <ChoiceGrid
        label={t('parentChildren.avatar')}
        options={AVATARS}
        value={avatar}
        onChange={setAvatar}
        render={(a) => a}
      />
      <ChoiceGrid
        label={t('parentChildren.color')}
        options={CHILD_COLORS}
        value={color}
        onChange={setColor}
        render={(c) => (
          <span className="size-7 rounded-full" style={{ background: c }} aria-label={c} />
        )}
      />
      <Field
        label={t('parentChildren.pin')}
        name="pin"
        inputMode="numeric"
        pattern="\d{4}"
        maxLength={4}
        autoComplete="off"
        required
      />
      <p className="text-xs text-slate-500">{t('parentChildren.privacy')}</p>
      {error && (
        <p role="alert" className="rounded-xl bg-coral/10 p-3 text-sm font-semibold text-coral">
          {error}
        </p>
      )}
      <Button type="submit" loading={busy} block>
        {submitLabel ?? t('parentChildren.add')}
      </Button>
    </form>
  );
}
