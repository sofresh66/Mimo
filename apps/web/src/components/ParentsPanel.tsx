'use client';

import type {
  CreatedParentInvitation,
  FamilyRole,
  FamilySettings,
  ParentInvitationView,
} from '@mimo/types';
import { Button, ParentPanel } from '@mimo/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { http } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { keys } from '@/lib/queries';
import { useToast } from './Toast';

const formatDate = (iso: string, locale: string) =>
  new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });

/** Chemin de la page d'acceptation selon le rôle proposé. */
const JOIN_PATH: Record<FamilyRole, string> = {
  PARENT: '/join-parent/',
  ADULT_PLAYER: '/join-player/',
};

/**
 * Membres adultes de la famille : les parents, puis les joueurs adultes (sans droits parent),
 * chacun avec son invitation par lien à usage unique.
 */
export function ParentsPanel({ settings }: { settings: FamilySettings }) {
  const { t } = useI18n();
  const invitations = useQuery({
    queryKey: keys.parent.invitations,
    queryFn: () => http.get<ParentInvitationView[]>('/family/invitations'),
  });
  const pending = (role: FamilyRole) => invitations.data?.filter((i) => i.role === role) ?? [];

  return (
    <>
      <MembersPanel
        role="PARENT"
        title={t('parentSettings.parents')}
        description={t('parentSettings.parentsHint')}
        inviteLabel={t('parentSettings.invite')}
        linkHintKey="parentSettings.inviteLinkHint"
        members={settings.parents}
        empty={null}
        pending={pending('PARENT')}
      />
      <MembersPanel
        role="ADULT_PLAYER"
        title={t('parentSettings.adultPlayers')}
        description={t('parentSettings.adultPlayersHint')}
        inviteLabel={t('parentSettings.inviteAdult')}
        linkHintKey="parentSettings.adultInviteLinkHint"
        members={settings.adultPlayers}
        empty={t('parentSettings.noAdultPlayers')}
        pending={pending('ADULT_PLAYER')}
        badge={t('parent.adultBadge')}
      />
    </>
  );
}

function MembersPanel({
  role,
  title,
  description,
  inviteLabel,
  linkHintKey,
  members,
  empty,
  pending,
  badge,
}: {
  role: FamilyRole;
  title: string;
  description: string;
  inviteLabel: string;
  linkHintKey: 'parentSettings.inviteLinkHint' | 'parentSettings.adultInviteLinkHint';
  members: Array<{ id: string; displayName: string; email: string }>;
  empty: string | null;
  pending: ParentInvitationView[];
  badge?: string;
}) {
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [created, setCreated] = useState<{ url: string; expiresAt: string } | null>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const refresh = () => void client.invalidateQueries({ queryKey: keys.parent.invitations });

  const invite = useMutation({
    mutationFn: () => http.post<CreatedParentInvitation>('/family/invitations', { role }),
    onSuccess: (invitation) => {
      // Le jeton n'est renvoyé qu'une fois : le lien est construit et affiché ici.
      setCreated({
        url: `${window.location.origin}${JOIN_PATH[role]}${invitation.token}`,
        expiresAt: invitation.expiresAt,
      });
      refresh();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => http.del(`/family/invitations/${id}`),
    onSuccess: () => {
      toast(t('parentSettings.revoked'), 'success');
      setCreated(null);
      refresh();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      toast(t('parentSettings.linkCopied'), 'success');
    } catch {
      // Presse-papiers indisponible : on sélectionne le lien pour une copie manuelle.
      linkRef.current?.select();
    }
  };
  const inputId = `invite-link-${role.toLowerCase()}`;

  return (
    <ParentPanel
      title={title}
      description={description}
      actions={
        <Button size="sm" onClick={() => invite.mutate()} loading={invite.isPending}>
          + {inviteLabel}
        </Button>
      }
    >
      {members.length === 0 && empty ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {members.map((p) => (
            <li key={p.id} className="py-2">
              <span className="font-medium text-slate-900">{p.displayName}</span>
              {badge && <AdultBadge label={badge} />}
              <span className="block text-slate-500">{p.email}</span>
            </li>
          ))}
        </ul>
      )}

      {created && (
        <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <label htmlFor={inputId} className="text-sm font-semibold text-slate-900">
            {t('parentSettings.inviteLinkTitle')}
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id={inputId}
              ref={linkRef}
              readOnly
              value={created.url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700"
            />
            <Button onClick={copy}>{t('parentSettings.copyLink')}</Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {t(linkHintKey, { date: formatDate(created.expiresAt, locale) })}
          </p>
        </div>
      )}

      {pending.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-slate-900">
            {t('parentSettings.pendingInvitations')}
          </p>
          <ul className="mt-1 divide-y divide-slate-100 text-sm">
            {pending.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                <span className="text-slate-600">
                  {t('parentSettings.invitationExpires', { date: formatDate(i.expiresAt, locale) })}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => revoke.mutate(i.id)}
                  loading={revoke.isPending && revoke.variables === i.id}
                >
                  {t('parentSettings.revoke')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ParentPanel>
  );
}

/** Pastille « Adulte joueur » (listes parent). */
export function AdultBadge({ label }: { label: string }) {
  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 align-middle text-xs font-semibold text-violet-800">
      {label}
    </span>
  );
}
