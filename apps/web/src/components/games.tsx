'use client';

import { Button, Card, ProgressBar, cx } from '@mimo/ui';
import { motion } from 'motion/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useI18n } from '@/i18n';
import { playSound } from '@/lib/sound';

// ─── Mémoire ─────────────────────────────────────────────────────────────────

export function MemoryGame({
  cards,
  onFinish,
}: {
  cards: string[];
  onFinish: (flips: number[]) => void;
}) {
  const { t } = useI18n();
  const [flips, setFlips] = useState<number[]>([]);
  const [open, setOpen] = useState<number[]>([]);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const finished = useRef(false);

  const flip = (index: number) => {
    if (open.length === 2 || open.includes(index) || matched.has(index)) return;
    playSound('pop');
    const nextOpen = [...open, index];
    setOpen(nextOpen);
    setFlips((f) => [...f, index]);
    if (nextOpen.length === 2) {
      const [a, b] = nextOpen as [number, number];
      if (cards[a] === cards[b]) {
        window.setTimeout(() => {
          playSound('coin');
          setMatched((m) => new Set([...m, a, b]));
          setOpen([]);
        }, 350);
      } else {
        window.setTimeout(() => setOpen([]), 850);
      }
    }
  };

  useEffect(() => {
    if (!finished.current && matched.size === cards.length && cards.length > 0) {
      finished.current = true;
      window.setTimeout(() => onFinish(flips), 400);
    }
  }, [matched, cards.length, flips, onFinish]);

  return (
    <div>
      <p className="mb-3 flex justify-between font-semibold text-ink/70">
        <span>{t('games.memoryHint')}</span>
        <span aria-live="polite">{t('games.moves', { count: Math.floor(flips.length / 2) })}</span>
      </p>
      <ul className="mx-auto grid max-w-md grid-cols-4 gap-2">
        {cards.map((symbol, i) => {
          const visible = open.includes(i) || matched.has(i);
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => flip(i)}
                aria-label={visible ? symbol : `Carte ${i + 1}`}
                className="block aspect-square w-full [perspective:600px] focus-visible:outline-4 focus-visible:outline-primary/50"
                disabled={matched.has(i)}
              >
                <motion.span
                  className={cx(
                    'grid size-full place-items-center rounded-2xl text-3xl shadow-sm sm:text-4xl',
                    visible ? 'bg-white' : 'bg-gradient-to-br from-primary to-[#b18cff] text-white',
                    matched.has(i) && 'ring-4 ring-mint',
                  )}
                  animate={{ rotateY: visible ? 0 : 180 }}
                  transition={{ duration: 0.3 }}
                >
                  {visible ? symbol : '?'}
                </motion.span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Calcul mental ───────────────────────────────────────────────────────────

export function MathGame({
  questions,
  onFinish,
}: {
  questions: Array<{ text: string }>;
  onFinish: (answers: Array<number | null>) => void;
}) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Array<number | null>>([]);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const question = questions[index];

  useEffect(() => inputRef.current?.focus(), [index]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = value.trim() === '' ? null : Number.parseInt(value, 10);
    const next = [...answers, Number.isNaN(parsed) ? null : parsed];
    playSound('pop');
    setValue('');
    if (index + 1 >= questions.length) onFinish(next);
    else {
      setAnswers(next);
      setIndex(index + 1);
    }
  };

  if (!question) return null;
  return (
    <Card className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
      <ProgressBar
        label={t('games.question', { current: index + 1, total: questions.length })}
        value={index}
        max={questions.length}
      />
      <motion.p
        key={index}
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="font-display text-5xl font-bold"
      >
        {question.text} = ?
      </motion.p>
      <form onSubmit={submit} className="flex w-full gap-2">
        <label htmlFor="math-answer" className="sr-only">
          {t('games.answer')}
        </label>
        <input
          id="math-answer"
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^0-9-]/g, '').slice(0, 5))}
          inputMode="numeric"
          autoComplete="off"
          className="min-h-14 flex-1 rounded-2xl border-2 border-ink/15 bg-white px-4 text-center font-display text-3xl font-bold outline-none focus:border-primary"
        />
        <Button type="submit" size="lg">
          {index + 1 >= questions.length ? t('games.validate') : t('games.next')}
        </Button>
      </form>
    </Card>
  );
}

// ─── Suite logique ───────────────────────────────────────────────────────────

export function SequenceGame({
  questions,
  onFinish,
}: {
  questions: Array<{ items: string[]; choices: string[] }>;
  onFinish: (answers: Array<number | null>) => void;
}) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Array<number | null>>([]);
  const question = questions[index];

  const choose = (choice: number) => {
    playSound('pop');
    const next = [...answers, choice];
    if (index + 1 >= questions.length) onFinish(next);
    else {
      setAnswers(next);
      setIndex(index + 1);
    }
  };

  if (!question) return null;
  return (
    <Card className="mx-auto flex max-w-lg flex-col items-center gap-5 text-center">
      <ProgressBar
        label={t('games.question', { current: index + 1, total: questions.length })}
        value={index}
        max={questions.length}
      />
      <p className="font-semibold text-ink/70">{t('games.sequenceHint')}</p>
      <motion.div
        key={index}
        initial={{ x: 30, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="flex flex-wrap items-center justify-center gap-2"
      >
        {question.items.map((item, i) => (
          <span
            key={i}
            className="grid min-w-14 place-items-center rounded-2xl bg-cream px-3 py-2 font-display text-3xl font-bold"
          >
            {item}
          </span>
        ))}
        <span className="grid min-w-14 place-items-center rounded-2xl border-4 border-dashed border-primary/40 px-3 py-2 font-display text-3xl font-bold text-primary">
          ?
        </span>
      </motion.div>
      <div className="grid w-full grid-cols-2 gap-3">
        {question.choices.map((choice, i) => (
          <Button key={`${index}-${i}`} size="xl" variant="secondary" onClick={() => choose(i)}>
            {choice}
          </Button>
        ))}
      </div>
    </Card>
  );
}
