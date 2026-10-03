'use client';

import { LETTER_MAX_GRAPHEMES, graphemeCount, normalizeLetterContent } from '@mimo/game-data';
import type {
  LetterBox,
  LetterRecipientView,
  LetterView,
  SendLetterInput,
  StationeryView,
} from '@mimo/types';
import { Avatar, Button, EmptyState, Modal, Spinner, Tabs, cx } from '@mimo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/i18n';
import { http } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { keys, useLetterCompose, useLetterPages } from '@/lib/queries';
import { playSound } from '@/lib/sound';

/** Lecteur de la boîte : joueur (enfant, adulte joueur) ou parent (espace parent). */
type Reader = 'player' | 'parent';
const baseOf = (reader: Reader) => (reader === 'parent' ? '/parent/letters' : '/me/letters');
const boxKey = (reader: Reader, box: LetterBox) =>
  reader === 'parent' ? keys.parent.letterBox(box) : keys.letterBox(box);

function newRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// ─── Boîte aux lettres dans la scène ─────────────────────────────────────────

/** Petite boîte aux lettres de la scène : discrète, puis animée et badgée s'il y a du courrier. */
export function MailboxButton({ unread }: { unread: number }) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const hasMail = unread > 0;
  return (
    <Link
      href="/play/mail"
      data-testid="mailbox"
      aria-label={hasMail ? t('mail.openUnread', { count: unread }) : t('mail.open')}
      className={cx(
        'relative grid h-11 w-11 place-items-center rounded-full text-2xl shadow-sm transition focus-visible:outline-4 focus-visible:outline-primary/50',
        hasMail ? 'bg-white' : 'bg-white/70 opacity-80 hover:opacity-100',
      )}
    >
      <motion.span
        aria-hidden="true"
        animate={hasMail && !reduce ? { rotate: [0, -12, 10, -6, 0] } : { rotate: 0 }}
        transition={hasMail && !reduce ? { duration: 1.2, repeat: Infinity, repeatDelay: 2.5 } : {}}
        className={cx(hasMail && 'drop-shadow-[0_0_6px_rgba(255,200,80,0.9)]')}
      >
        {hasMail ? '📬' : '📪'}
      </motion.span>
      {hasMail && (
        <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-coral px-1 text-xs font-bold text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  );
}

// ─── Lettre ──────────────────────────────────────────────────────────────────

function paperStyle(paper: StationeryView) {
  return {
    background: `linear-gradient(180deg, ${paper.scene.sky[0]}, ${paper.scene.sky[1]})`,
    borderColor: paper.scene.ground,
  };
}

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

/** Lettre présentée sur son papier. Le texte n'est jamais interprété (aucun lien cliquable). */
export function LetterPaper({ letter }: { letter: LetterView }) {
  const { t, locale } = useI18n();
  const from = letter.creatureName
    ? t('mail.fromWithCreature', { name: letter.from.name, creature: letter.creatureName })
    : t('mail.from', { name: letter.from.name });
  return (
    <article
      className="overflow-hidden rounded-2xl border-4 p-4 text-ink shadow-inner"
      style={paperStyle(letter.stationery)}
      data-testid="letter-paper"
    >
      <header className="mb-3 flex items-start gap-2 pr-8">
        <span className="text-3xl" aria-hidden="true">
          {letter.from.avatar}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display font-bold">{from}</span>
          <span className="block text-xs text-ink/60">
            {t('mail.to', { name: letter.to.name })} · {formatDate(letter.createdAt, locale)}
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-lg opacity-60">
          {letter.stationery.scene.particles.join(' ')}
        </span>
      </header>
      <p className="whitespace-pre-wrap break-words font-display text-lg leading-relaxed">
        {letter.content}
      </p>
    </article>
  );
}

function LetterRow({ letter, onOpen }: { letter: LetterView; onOpen: () => void }) {
  const { t, locale } = useI18n();
  const unread = !letter.mine && !letter.readAt;
  const other = letter.mine ? letter.to : letter.from;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        'flex w-full items-center gap-3 rounded-2xl border-l-8 bg-white p-3 text-left shadow-sm transition hover:shadow focus-visible:outline-4 focus-visible:outline-primary/50',
        unread && 'ring-2 ring-coral/60',
      )}
      style={{ borderLeftColor: letter.stationery.scene.ground }}
    >
      <span className="text-3xl" aria-hidden="true">
        {unread ? '💌' : other.avatar}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-display font-bold">
          <span className="truncate">
            {letter.mine
              ? t('mail.to', { name: other.name })
              : t('mail.from', { name: other.name })}
          </span>
          {unread && (
            <span className="rounded-full bg-coral px-2 text-xs text-white">
              {t('mail.unread')}
            </span>
          )}
          {letter.cherishedAt && <span aria-label={t('mail.cherished')}>⭐</span>}
        </span>
        <span className="block truncate text-sm text-ink/70">{letter.content}</span>
        <span className="block text-xs text-ink/50">{formatDate(letter.createdAt, locale)}</span>
      </span>
    </button>
  );
}

/** Liste paginée (20 par page) avec « Lettres plus anciennes ». */
function LetterList({
  queryKey,
  base,
  params,
  empty,
  onOpen,
}: {
  queryKey: readonly unknown[];
  base: string;
  params: Record<string, string>;
  empty: string;
  onOpen: (letter: LetterView) => void;
}) {
  const { t } = useI18n();
  const query = useLetterPages(queryKey, base, params);
  if (query.isPending) return <Spinner size={32} label={t('common.loading')} />;
  const letters = query.data?.pages.flatMap((p) => p.letters) ?? [];
  if (letters.length === 0) return <EmptyState emoji="📭" title={empty} />;
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2" data-testid="letters">
        {letters.map((letter) => (
          <li key={letter.id}>
            <LetterRow letter={letter} onOpen={() => onOpen(letter)} />
          </li>
        ))}
      </ul>
      {query.hasNextPage && (
        <Button
          variant="soft"
          size="sm"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t('mail.loadMore')}
        </Button>
      )}
    </div>
  );
}

// ─── Boîte aux lettres complète ──────────────────────────────────────────────

/** Onglets Reçues / Envoyées / Souvenirs, lecture et écriture. */
export function MailboxPanel({ reader }: { reader: Reader }) {
  const { t } = useI18n();
  const [box, setBox] = useState<LetterBox>('received');
  const [reading, setReading] = useState<LetterView | null>(null);
  const [writing, setWriting] = useState(false);
  const empty = {
    received: t('mail.emptyInbox'),
    sent: t('mail.emptySent'),
    cherished: t('mail.emptyCherished'),
  }[box];
  return (
    <div className="flex flex-col gap-3">
      <Button size="lg" block onClick={() => setWriting(true)} data-testid="write-letter">
        ✏️ {t('mail.write')}
      </Button>
      <Tabs
        label={t('mail.tabsLabel')}
        value={box}
        onChange={setBox}
        items={[
          { key: 'received', label: t('mail.inbox'), icon: '📥' },
          { key: 'sent', label: t('mail.sent'), icon: '✉️' },
          { key: 'cherished', label: t('mail.cherished'), icon: '⭐' },
        ]}
      />
      <LetterList
        key={box}
        queryKey={boxKey(reader, box)}
        base={baseOf(reader)}
        params={{ box }}
        empty={empty}
        onOpen={setReading}
      />
      {reading && (
        <LetterReader letter={reading} reader={reader} onClose={() => setReading(null)} />
      )}
      <LetterComposer reader={reader} open={writing} onClose={() => setWriting(false)} />
    </div>
  );
}

function LetterReader({
  letter: initial,
  reader,
  onClose,
}: {
  letter: LetterView;
  reader: Reader;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [letter, setLetter] = useState(initial);
  const base = baseOf(reader);
  const refresh = () => {
    const list = reader === 'parent' ? [keys.parent.letters] : [keys.letters, keys.home];
    list.forEach((queryKey) => void client.invalidateQueries({ queryKey }));
  };

  // Ouverture d'une lettre reçue non lue : passage non lu → lu (serveur, idempotent).
  const markRead = useMutation({
    mutationFn: () => http.post<LetterView>(`${base}/${initial.id}/read`),
    onSuccess: (view) => {
      setLetter(view);
      refresh();
    },
  });
  const { mutate: read } = markRead;
  useEffect(() => {
    if (!initial.mine && !initial.readAt) read();
  }, [initial, read]);

  const cherish = useMutation({
    mutationFn: (keep: boolean) =>
      keep
        ? http.put<LetterView>(`${base}/${letter.id}/cherish`)
        : http.del<LetterView>(`${base}/${letter.id}/cherish`),
    onSuccess: (view) => {
      setLetter(view);
      if (view.cherishedAt) {
        playSound('success');
        toast(t('mail.cherishedToast'), 'success');
      }
      refresh();
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={t('mail.readerTitle', { name: letter.from.name })}
      hideTitle
      footer={
        letter.mine ? undefined : (
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant={letter.cherishedAt ? 'secondary' : 'soft'}
              loading={cherish.isPending}
              aria-pressed={Boolean(letter.cherishedAt)}
              onClick={() => cherish.mutate(!letter.cherishedAt)}
            >
              {letter.cherishedAt ? t('mail.uncherish') : t('mail.cherish')}
            </Button>
          </div>
        )
      }
    >
      <LetterPaper letter={letter} />
    </Modal>
  );
}

// ─── Écriture ────────────────────────────────────────────────────────────────

/** Écrire une lettre : destinataire → papier → texte → envoyer. */
export function LetterComposer({
  reader,
  open,
  onClose,
}: {
  reader: Reader;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const textId = useId();
  const { data, isPending } = useLetterCompose(reader === 'parent', open);
  const [to, setTo] = useState<LetterRecipientView | null>(null);
  const [paper, setPaper] = useState<string | null>(null);
  const [content, setContent] = useState('');
  // Conservé entre deux essais : un nouvel envoi après une coupure réseau ne crée pas de doublon.
  const [requestId, setRequestId] = useState(newRequestId);

  const paperId =
    paper ?? data?.stationery.find((s) => s.owned)?.item.id ?? data?.stationery[0]?.item.id;
  const check = normalizeLetterContent(content);
  const length = graphemeCount(content.trim());

  const send = useMutation({
    mutationFn: (input: SendLetterInput) => http.post<LetterView>(baseOf(reader), input),
    onSuccess: (letter) => {
      playSound('success');
      toast(t('mail.sentToast', { name: letter.to.name }), 'success');
      setContent('');
      setTo(null);
      setRequestId(newRequestId());
      const list = reader === 'parent' ? [keys.parent.letters] : [keys.letters];
      list.forEach((queryKey) => void client.invalidateQueries({ queryKey }));
      onClose();
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const submit = () => {
    if (!to || !paperId || !check.ok) return;
    send.mutate({ to: { kind: to.kind, id: to.id }, content, stationeryId: paperId, requestId });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('mail.composeTitle')}
      size="lg"
      footer={
        <Button
          block
          size="lg"
          loading={send.isPending}
          disabled={!to || !paperId || !check.ok}
          onClick={submit}
          data-testid="send-letter"
        >
          {t('mail.send')}
        </Button>
      }
    >
      {isPending || !data ? (
        <Spinner size={32} label={t('common.loading')} />
      ) : (
        <div className="flex flex-col gap-4">
          <fieldset>
            <legend className="mb-2 font-display font-bold">{t('mail.recipient')}</legend>
            {data.recipients.length === 0 ? (
              <p className="text-ink/60">{t('mail.noRecipients')}</p>
            ) : (
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {data.recipients.map((r) => {
                  const selected = to?.id === r.id && to.kind === r.kind;
                  return (
                    <button
                      key={`${r.kind}-${r.id}`}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setTo(r)}
                      className={cx(
                        'flex min-h-11 items-center gap-2 rounded-full border-2 bg-white py-1 pl-1 pr-3 font-semibold transition focus-visible:outline-4 focus-visible:outline-primary/50',
                        selected ? 'border-primary shadow' : 'border-transparent shadow-sm',
                      )}
                    >
                      <Avatar emoji={r.avatar} color={r.color} size={36} />
                      {r.name}
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-2 font-display font-bold">{t('mail.paper')}</legend>
            <div className="flex gap-2 overflow-x-auto pb-1" role="radiogroup">
              {data.stationery.map((s) => {
                const selected = paperId === s.item.id;
                return (
                  <button
                    key={s.item.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!s.owned}
                    title={s.owned ? s.item.name : t('mail.paperLocked', { name: s.item.name })}
                    aria-label={
                      s.owned ? s.item.name : t('mail.paperLocked', { name: s.item.name })
                    }
                    onClick={() => setPaper(s.item.id)}
                    className={cx(
                      'grid h-16 w-14 shrink-0 place-items-center rounded-xl border-4 text-2xl transition focus-visible:outline-4 focus-visible:outline-primary/50',
                      selected ? 'scale-105 shadow-md' : 'shadow-sm',
                      !s.owned && 'cursor-not-allowed opacity-40 grayscale',
                    )}
                    style={{
                      ...paperStyle(s.item),
                      borderColor: selected ? 'var(--color-primary, #7c5cff)' : s.item.scene.ground,
                    }}
                  >
                    <span aria-hidden="true">{s.owned ? s.item.emoji : '🔒'}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={textId} className="font-display font-bold">
              {t('mail.message')}
            </label>
            <textarea
              id={textId}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              maxLength={4000}
              placeholder={t('mail.placeholder')}
              aria-describedby={`${textId}-count`}
              className="min-h-36 w-full resize-y rounded-2xl border-4 p-3 font-display text-lg text-ink outline-none focus:ring-4 focus:ring-primary/20"
              style={
                paperId
                  ? paperStyle(
                      data.stationery.find((s) => s.item.id === paperId)?.item ??
                        data.stationery[0]!.item,
                    )
                  : undefined
              }
              data-testid="letter-text"
            />
            <p
              id={`${textId}-count`}
              className={cx(
                'text-right text-xs',
                length > LETTER_MAX_GRAPHEMES ? 'font-bold text-coral' : 'text-ink/50',
              )}
            >
              {t('mail.counter', { count: length, max: LETTER_MAX_GRAPHEMES })}
            </p>
            {reader === 'player' && (
              <p className="text-xs text-ink/60">🔒 {t('mail.privacyChild')}</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Supervision parentale ───────────────────────────────────────────────────

/** Courriers d'un enfant, en lecture seule (ne marque jamais une lettre comme lue). */
export function ChildLetters({ childId, name }: { childId: string; name: string }) {
  const { t } = useI18n();
  const [box, setBox] = useState<'received' | 'sent'>('received');
  const [reading, setReading] = useState<LetterView | null>(null);
  return (
    <section className="flex flex-col gap-2" data-testid="child-letters">
      <h2 className="font-display text-xl font-bold">💌 {t('mail.supervision', { name })}</h2>
      <p className="text-sm text-ink/60">{t('mail.supervisionHint')}</p>
      <Tabs
        label={t('mail.tabsLabel')}
        value={box}
        onChange={setBox}
        items={[
          { key: 'received', label: t('mail.inbox'), icon: '📥' },
          { key: 'sent', label: t('mail.sent'), icon: '✉️' },
        ]}
      />
      <LetterList
        key={box}
        queryKey={keys.parent.childLetters(childId, box)}
        base={`/parent/children/${childId}/letters`}
        params={{ box }}
        empty={t('mail.supervisionEmpty')}
        onOpen={setReading}
      />
      {reading && (
        <Modal
          open
          onClose={() => setReading(null)}
          title={t('mail.readerTitle', { name: reading.from.name })}
          hideTitle
        >
          <LetterPaper letter={reading} />
        </Modal>
      )}
    </section>
  );
}
