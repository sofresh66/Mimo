'use client';

import { MailboxPanel } from '@/components/Mail';
import { PageHeader } from '@/components/PageHeader';
import { useI18n } from '@/i18n';

/** 📬 Boîte aux lettres familiale du joueur. */
export default function MailPage() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('mail.title')} subtitle={t('mail.subtitle')} emoji="📬" />
      <MailboxPanel reader="player" />
    </div>
  );
}
