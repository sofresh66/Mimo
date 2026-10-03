'use client';

import type { AcceptedInvitation, ParentInvitationPreview } from '@mimo/types';
import { Button, Spinner, buttonClassName } from '@mimo/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AuthShell } from '@/components/AuthShell';
import { AVATARS, CHILD_COLORS, ChoiceGrid, Field } from '@/components/forms';
import { useI18n } from '@/i18n';
import { ApiError, http } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { withNext } from '@/lib/navigation';
import { resetSessionCache, useSession, useSessionActions } from '@/lib/session';

/**
 * Page ouverte depuis un lien d'invitation (parent ou adulte joueur). Le rôle affiché vient
 * TOUJOURS de l'aperçu serveur, jamais de l'URL : le serveur décide des droits accordés.
 */
export function JoinInvitation({ token, path }: { token: string; path: string }) {
  const { t } = useI18n();
  const { me, loading } = useSession();
  const preview = useQuery({
    // La réponse dépend de la session (« déjà membre ») : la clé inclut l'utilisateur.
    queryKey: ['invitation', token, me?.user.id ?? null],
    queryFn: () => http.get<ParentInvitationPreview>(`/invitations/${token}`),
    enabled: !loading,
    retry: false,
  });

  if (loading || preview.isPending) {
    return (
      <main className="kid-bg grid min-h-dvh place-items-center">
        <Spinner size={36} />
      </main>
    );
  }

  if (preview.isError || !preview.data) {
    const invalid = preview.error instanceof ApiError && preview.error.status === 404;
    return (
      <AuthShell title={invalid ? t('join.invalid') : t('errors.generic')}>
        {invalid && <p className="mb-5 text-sm text-slate-600">{t('join.invalidHint')}</p>}
        <Link href="/" className={buttonClassName({ variant: 'secondary', block: true })}>
          {t('join.backHome')}
        </Link>
      </AuthShell>
    );
  }

  const invitation = preview.data;
  const adult = invitation.role === 'ADULT_PLAYER';
  const title = !adult
    ? t('join.title', { family: invitation.familyName })
    : invitation.invitedBy
      ? t('join.adultTitle', { name: invitation.invitedBy, family: invitation.familyName })
      : t('join.adultTitleAnonymous', { family: invitation.familyName });

  return (
    <AuthShell title={title}>
      {!adult && invitation.invitedBy && (
        <p className="mb-2 text-sm font-semibold text-primary">
          {t('join.invitedBy', { name: invitation.invitedBy })}
        </p>
      )}
      {!me ? (
        <>
          <p className="mb-5 text-sm text-slate-600">
            {adult ? t('join.adultExplanation') : t('join.explanation')}
          </p>
          <div className="flex flex-col gap-3">
            <Link href={withNext('/login', path)} className={buttonClassName({ block: true })}>
              {t('join.haveAccount')}
            </Link>
            <Link
              href={withNext('/register', path)}
              className={buttonClassName({ variant: 'secondary', block: true })}
            >
              {t('join.createAccount')}
            </Link>
          </div>
        </>
      ) : invitation.alreadyMember ? (
        <>
          <p className="mb-5 text-slate-700">{t('join.alreadyMember')}</p>
          <Link href={adult ? '/' : '/parent'} className={buttonClassName({ block: true })}>
            {adult ? t('join.goToGame') : t('join.goToParent')}
          </Link>
        </>
      ) : me.family ? (
        <SwitchAccount message={t('join.otherFamily', { family: me.family.name })} next={path} />
      ) : me.mode !== 'PARENT' ? (
        <SwitchAccount message={t('join.reconnect')} next={path} />
      ) : adult ? (
        <ConfirmAdultJoin
          token={token}
          familyName={invitation.familyName}
          email={me.user.email}
          defaultName={me.user.displayName}
        />
      ) : (
        <ConfirmParentJoin
          token={token}
          familyName={invitation.familyName}
          email={me.user.email}
          needsPin={!me.hasParentPin}
        />
      )}
    </AuthShell>
  );
}

function useAccept(token: string, destination: string) {
  const router = useRouter();
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const accept = async (body: Record<string, string>) => {
    setBusy(true);
    setError(null);
    try {
      await http.post<AcceptedInvitation>(`/invitations/${token}/accept`, body);
      // La session a changé côté serveur (famille, et mode PLAYER pour un adulte joueur).
      await resetSessionCache(client);
      router.replace(destination);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };
  return { accept, error, busy };
}

function ErrorMessage({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-xl bg-coral/10 p-3 text-sm font-semibold text-coral">
      {error}
    </p>
  );
}

function ConfirmParentJoin({
  token,
  familyName,
  email,
  needsPin,
}: {
  token: string;
  familyName: string;
  email: string;
  needsPin: boolean;
}) {
  const { t } = useI18n();
  // L'espace parent exige le PIN (choisi à l'instant) : arrivée directe sur le pavé PIN.
  const { accept, error, busy } = useAccept(token, '/?parent=1');

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const pin = String(new FormData(e.currentTarget).get('parentPin') ?? '');
    void accept(needsPin ? { parentPin: pin } : {});
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <p className="text-lg font-semibold text-slate-900">
        {t('join.confirm', { family: familyName })}
      </p>
      <p className="text-sm text-slate-500">{t('join.connectedAs', { email })}</p>
      {needsPin && (
        <Field
          label={t('join.pinLabel')}
          name="parentPin"
          hint={t('join.pinHint')}
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          autoComplete="off"
          required
        />
      )}
      <ErrorMessage error={error} />
      <Button type="submit" size="lg" block loading={busy}>
        {t('join.submit')}
      </Button>
    </form>
  );
}

/** Confirmation + configuration du profil de jeu, puis adoption d'une créature. */
function ConfirmAdultJoin({
  token,
  familyName,
  email,
  defaultName,
}: {
  token: string;
  familyName: string;
  email: string;
  defaultName: string;
}) {
  const { t } = useI18n();
  const { accept, error, busy } = useAccept(token, '/play/adopt');
  const [avatar, setAvatar] = useState<(typeof AVATARS)[number]>('🦉');
  const [color, setColor] = useState<(typeof CHILD_COLORS)[number]>(CHILD_COLORS[0]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const displayName = String(new FormData(e.currentTarget).get('displayName') ?? '').trim();
    void accept({ displayName, avatar, color });
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <p className="text-lg font-semibold text-slate-900">
        {t('join.adultConfirm', { family: familyName })}
      </p>
      <p className="text-sm text-slate-500">{t('join.connectedAs', { email })}</p>
      <Field
        label={t('join.adultProfileName')}
        name="displayName"
        defaultValue={defaultName.slice(0, 24)}
        maxLength={24}
        required
      />
      <ChoiceGrid
        label={t('join.adultAvatar')}
        options={AVATARS}
        value={avatar}
        onChange={setAvatar}
        render={(a) => a}
      />
      <ChoiceGrid
        label={t('join.adultColor')}
        options={CHILD_COLORS}
        value={color}
        onChange={setColor}
        render={(c) => (
          <span className="size-7 rounded-full" style={{ background: c }} aria-label={c} />
        )}
      />
      <ErrorMessage error={error} />
      <Button type="submit" size="lg" block loading={busy}>
        {t('join.adultSubmit')}
      </Button>
    </form>
  );
}

/** Compte déjà rattaché ailleurs ou session sans mot de passe récent : se déconnecter puis se reconnecter. */
function SwitchAccount({ message, next }: { message: string; next: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const { logout } = useSessionActions();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <p className="mb-5 text-slate-700">{message}</p>
      <Button
        block
        variant="secondary"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          await logout();
          router.replace(withNext('/login', next));
        }}
      >
        {t('join.useOtherAccount')}
      </Button>
    </>
  );
}
