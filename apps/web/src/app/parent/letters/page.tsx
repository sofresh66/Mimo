'use client';

import { MailboxPanel } from '@/components/Mail';
import { useI18n } from '@/i18n';

/** Courrier personnel du parent (espace parent déverrouillé). */
export default function ParentLettersPage() {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">💌 {t('mail.parentTitle')}</h1>
      <MailboxPanel reader="parent" />
    </div>
  );
}
