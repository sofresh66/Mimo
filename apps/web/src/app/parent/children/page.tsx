'use client';

import type { PlayerProfile } from '@mimo/types';
import { Avatar, Button, Modal, ParentPanel, Spinner } from '@mimo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ChildForm } from '@/components/ChildForm';
import { AdultBadge } from '@/components/ParentsPanel';
import { AVATARS, CHILD_COLORS, ChoiceGrid, Field } from '@/components/forms';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/i18n';
import { http } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { keys, useProfiles } from '@/lib/queries';

type Dialog = { kind: 'edit' | 'pin' | 'delete'; child: PlayerProfile } | { kind: 'add' } | null;

export default function ParentChildrenPage() {
  const { t } = useI18n();
  const client = useQueryClient();
  const { data: profiles, isPending } = useProfiles();
  const [dialog, setDialog] = useState<Dialog>(null);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: keys.profiles });
    void client.invalidateQueries({ queryKey: keys.parent.dashboard });
  };
  const close = () => setDialog(null);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('parentChildren.title')}</h1>
        <Button onClick={() => setDialog({ kind: 'add' })}>+ {t('parentChildren.add')}</Button>
      </div>
      <ParentPanel title={t('parentChildren.title')} description={t('parentChildren.privacy')}>
        {isPending ? (
          <Spinner size={28} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {profiles?.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                <Avatar emoji={p.avatar} color={p.color} size={44} />
                <div className="min-w-0 flex-1 basis-48">
                  <Link href={`/parent/children/${p.id}`} className="font-medium hover:underline">
                    {p.displayName}
                  </Link>
                  {p.type === 'ADULT' && <AdultBadge label={t('parent.adultBadge')} />}
                  <p className="text-sm text-slate-500">
                    {p.creature
                      ? `${p.creature.name} · ${t('parent.level', { level: p.creature.level })}`
                      : t('parent.noCreature')}
                    {p.locked ? ' · 🔒' : ''}
                  </p>
                </div>
                {/* Le profil d'un adulte joueur appartient à son compte : ni PIN, ni édition, ni suppression ici. */}
                {p.type === 'CHILD' && (
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setDialog({ kind: 'edit', child: p })}
                    >
                      {t('common.edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setDialog({ kind: 'pin', child: p })}
                    >
                      🔑 {t('parentChildren.changePin')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDialog({ kind: 'delete', child: p })}
                      aria-label={`${t('common.delete')} ${p.displayName}`}
                    >
                      🗑
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </ParentPanel>

      <Modal open={dialog?.kind === 'add'} onClose={close} title={t('parentChildren.add')}>
        <ChildForm
          onCreated={() => {
            refresh();
            close();
          }}
        />
      </Modal>
      {dialog && dialog.kind !== 'add' && (
        <ChildDialog dialog={dialog} onClose={close} onDone={refresh} />
      )}
    </div>
  );
}

function ChildDialog({
  dialog,
  onClose,
  onDone,
}: {
  dialog: { kind: 'edit' | 'pin' | 'delete'; child: PlayerProfile };
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { child } = dialog;
  const [avatar, setAvatar] = useState(child.avatar as (typeof AVATARS)[number]);
  const [color, setColor] = useState(child.color as (typeof CHILD_COLORS)[number]);
  const [confirmName, setConfirmName] = useState('');

  const action = useMutation({
    mutationFn: async (form: FormData) => {
      if (dialog.kind === 'edit') {
        await http.patch(`/children/${child.id}`, {
          displayName: form.get('displayName'),
          avatar,
          color,
        });
        return t('parentChildren.saved');
      }
      if (dialog.kind === 'pin') {
        await http.put(`/children/${child.id}/pin`, { pin: form.get('pin') });
        return t('parentChildren.pinChanged');
      }
      await http.del(`/children/${child.id}`);
      return null;
    },
    onSuccess: (message) => {
      if (message) toast(message, 'success');
      onDone();
      onClose();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    action.mutate(new FormData(e.currentTarget));
  };

  const title =
    dialog.kind === 'edit'
      ? `${t('common.edit')} — ${child.displayName}`
      : dialog.kind === 'pin'
        ? `${t('parentChildren.changePin')} — ${child.displayName}`
        : t('parentChildren.deleteTitle', { name: child.displayName });

  return (
    <Modal open onClose={onClose} title={title}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {dialog.kind === 'edit' && (
          <>
            <Field
              label={t('parentChildren.name')}
              name="displayName"
              defaultValue={child.displayName}
              maxLength={24}
              required
            />
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
          </>
        )}
        {dialog.kind === 'pin' && (
          <Field
            label={t('parentChildren.pin')}
            name="pin"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            autoComplete="off"
            required
          />
        )}
        {dialog.kind === 'delete' && (
          <>
            <p className="text-sm text-slate-600">{t('parentChildren.deleteWarning')}</p>
            <Field
              label={t('parentChildren.deleteConfirmLabel')}
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              autoComplete="off"
            />
          </>
        )}
        <Button
          type="submit"
          variant={dialog.kind === 'delete' ? 'danger' : 'primary'}
          loading={action.isPending}
          disabled={dialog.kind === 'delete' && confirmName.trim() !== child.displayName}
          block
        >
          {dialog.kind === 'delete' ? t('common.delete') : t('common.save')}
        </Button>
      </form>
    </Modal>
  );
}
