'use client';

import type { ParentInvitationPreview } from '@mimo/types';
import { Button, Spinner, buttonClassName } from '@mimo/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AuthShell } from '@/components/AuthShell';
import { Field } from '@/components/forms';
import { useI18n } from '@/i18n';
import { ApiError, http } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { withNext } from '@/lib/navigation';
import { resetSessionCache, useSession, useSessionActions } from '@/lib/session';

/** Page ouverte par le parent invité depuis le lien partagé. */
export default function JoinParentPage() {
  const { token } = useParams<{ token: string }>();
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
  const next = `/join-parent/${token}`;
  return (
    <AuthShell title={t('join.title', { family: invitation.familyName })}>
      {invitation.invitedBy && (
        <p className="mb-2 text-sm font-semibold text-primary">
          {t('join.invitedBy', { name: invitation.invitedBy })}
        </p>
      )}
      {!me ? (
        <>
          <p className="mb-5 text-sm text-slate-600">{t('join.explanation')}</p>
          <div className="flex flex-col gap-3">
            <Link href={withNext('/login', next)} className={buttonClassName({ block: true })}>
              {t('join.haveAccount')}
            </Link>
            <Link
              href={withNext('/register', next)}
              className={buttonClassName({ variant: 'secondary', block: true })}
            >
              {t('join.createAccount')}
            </Link>
          </div>
        </>
      ) : invitation.alreadyMember ? (
        <>
          <p className="mb-5 text-slate-700">{t('join.alreadyMember')}</p>
          <Link href="/parent" className={buttonClassName({ block: true })}>
            {t('join.goToParent')}
          </Link>
        </>
      ) : me.family ? (
        <SwitchAccount message={t('join.otherFamily', { family: me.family.name })} next={next} />
      ) : me.mode !== 'PARENT' ? (
        <SwitchAccount message={t('join.reconnect')} next={next} />
      ) : (
        <ConfirmJoin
          token={token}
          familyName={invitation.familyName}
          email={me.user.email}
          needsPin={!me.hasParentPin}
        />
      )}
    </AuthShell>
  );
}

function ConfirmJoin({
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
  const router = useRouter();
  const client = useQueryClient();
  const errorMessage = useErrorMessage();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const pin = String(new FormData(e.currentTarget).get('parentPin') ?? '');
    setBusy(true);
    setError(null);
    try {
      await http.post(`/invitations/${token}/accept`, needsPin ? { parentPin: pin } : {});
      await resetSessionCache(client);
      router.replace('/parent');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
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
      {error && (
        <p role="alert" className="rounded-xl bg-coral/10 p-3 text-sm font-semibold text-coral">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" block loading={busy}>
        {t('join.submit')}
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
