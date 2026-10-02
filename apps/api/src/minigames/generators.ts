import { createRng, randomInt, shuffle, type Rng } from '@mimo/game-data';
import type { MathDifficulty, MiniGameChallenge, MiniGameSubmission } from '@mimo/types';

/**
 * Génération et correction des mini-jeux, entièrement côté serveur :
 * le client ne reçoit jamais les réponses, et le score est recalculé ici.
 */

export const MEMORY_SYMBOLS = [
  '🍎',
  '⭐',
  '🌙',
  '🍄',
  '🐚',
  '💎',
  '🎈',
  '🌸',
  '🍓',
  '🪁',
  '🧸',
  '🔥',
];
export const MEMORY_PAIRS = 8;
export const MATH_QUESTIONS = 10;
export const SEQUENCE_QUESTIONS = 6;

/** Défi complet (stocké en base) : vue publique + réponses attendues. */
export interface StoredChallenge {
  public: MiniGameChallenge;
  answers: string[];
}

export function generateChallenge(
  key: string,
  seed: number,
  difficulty: MathDifficulty,
): StoredChallenge {
  const rng = createRng(seed);
  switch (key) {
    case 'memory':
      return memory(rng);
    case 'math':
      return math(rng, difficulty);
    case 'sequence':
      return sequence(rng, difficulty);
    default:
      throw new Error(`Mini-jeu inconnu : ${key}`);
  }
}

function memory(rng: Rng): StoredChallenge {
  const symbols = shuffle(rng, MEMORY_SYMBOLS).slice(0, MEMORY_PAIRS);
  const cards = shuffle(rng, [...symbols, ...symbols]);
  return { public: { kind: 'memory', cards }, answers: cards };
}

function math(rng: Rng, difficulty: MathDifficulty): StoredChallenge {
  const questions: Array<{ text: string }> = [];
  const answers: string[] = [];
  for (let i = 0; i < MATH_QUESTIONS; i += 1) {
    const { text, answer } = mathQuestion(rng, difficulty);
    questions.push({ text });
    answers.push(String(answer));
  }
  return { public: { kind: 'math', difficulty, questions }, answers };
}

function mathQuestion(rng: Rng, difficulty: MathDifficulty): { text: string; answer: number } {
  const op = randomInt(rng, 0, difficulty === 'easy' ? 1 : 3);
  const max = difficulty === 'easy' ? 10 : difficulty === 'medium' ? 50 : 100;
  if (op === 0) {
    const a = randomInt(rng, 1, max);
    const b = randomInt(rng, 1, max);
    return { text: `${a} + ${b}`, answer: a + b };
  }
  if (op === 1) {
    const a = randomInt(rng, 2, max * (difficulty === 'easy' ? 2 : 1));
    const b = randomInt(rng, 1, a);
    return { text: `${a} − ${b}`, answer: a - b };
  }
  const tableMax = difficulty === 'hard' ? 12 : 10;
  const a = randomInt(rng, 2, tableMax);
  const b = randomInt(rng, 2, tableMax);
  if (op === 2) return { text: `${a} × ${b}`, answer: a * b };
  return { text: `${a * b} ÷ ${a}`, answer: b };
}

type SequenceBuilder = (rng: Rng) => { items: string[]; answer: string; distractors: string[] };

const SHAPES = ['🔴', '🔵', '🟡', '🟢', '🟣', '🟠', '⭐', '🔺'];

const arithmetic: SequenceBuilder = (rng) => {
  const start = randomInt(rng, 1, 20);
  const step = randomInt(rng, 2, 9);
  const items = [0, 1, 2, 3].map((i) => String(start + step * i));
  const answer = start + step * 4;
  return {
    items,
    answer: String(answer),
    distractors: [answer + 1, answer - step + 1, answer + step].map(String),
  };
};

const decreasing: SequenceBuilder = (rng) => {
  const step = randomInt(rng, 2, 6);
  const start = step * 5 + randomInt(rng, 5, 30);
  const items = [0, 1, 2, 3].map((i) => String(start - step * i));
  const answer = start - step * 4;
  return {
    items,
    answer: String(answer),
    distractors: [answer - 1, answer + step, answer - step].map(String),
  };
};

const doubling: SequenceBuilder = (rng) => {
  const start = randomInt(rng, 1, 5);
  const items = [0, 1, 2, 3].map((i) => String(start * 2 ** i));
  const answer = start * 16;
  return {
    items,
    answer: String(answer),
    distractors: [start * 12, start * 10, start * 18].map(String),
  };
};

const alternating: SequenceBuilder = (rng) => {
  const a = randomInt(rng, 1, 5);
  const b = randomInt(rng, 6, 10);
  let value = randomInt(rng, 1, 10);
  const values = [value];
  for (let i = 1; i < 6; i += 1) {
    value += i % 2 === 1 ? a : b;
    values.push(value);
  }
  const answer = values.pop() as number;
  return {
    items: values.map(String),
    answer: String(answer),
    distractors: [answer + 1, answer - a, answer + a].map(String),
  };
};

const shapePattern: SequenceBuilder = (rng) => {
  const picked = shuffle(rng, SHAPES).slice(0, 3);
  const patterns = [
    [0, 1, 0, 1, 0, 1],
    [0, 1, 2, 0, 1, 2],
    [0, 0, 1, 1, 0, 0],
    [0, 1, 1, 0, 1, 1],
  ];
  const pattern = patterns[randomInt(rng, 0, patterns.length - 1)] as number[];
  const seq = pattern.map((i) => picked[i] as string);
  const answer = seq.pop() as string;
  const others = SHAPES.filter((s) => s !== answer);
  return { items: seq, answer, distractors: shuffle(rng, others).slice(0, 3) };
};

const squares: SequenceBuilder = (rng) => {
  const start = randomInt(rng, 1, 4);
  const items = [0, 1, 2, 3].map((i) => String((start + i) ** 2));
  const answer = (start + 4) ** 2;
  return {
    items,
    answer: String(answer),
    distractors: [answer - 2, answer + 3, (start + 3) ** 2 + 4].map(String),
  };
};

function sequence(rng: Rng, difficulty: MathDifficulty): StoredChallenge {
  const pool: SequenceBuilder[] =
    difficulty === 'easy'
      ? [shapePattern, arithmetic, shapePattern, doubling]
      : difficulty === 'medium'
        ? [shapePattern, arithmetic, decreasing, doubling, alternating]
        : [arithmetic, decreasing, doubling, alternating, squares, shapePattern];
  const questions: Array<{ items: string[]; choices: string[] }> = [];
  const answers: string[] = [];
  for (let i = 0; i < SEQUENCE_QUESTIONS; i += 1) {
    const builder = pool[i % pool.length] as SequenceBuilder;
    const { items, answer, distractors } = builder(rng);
    const unique = [...new Set(distractors.filter((d) => d !== answer))].slice(0, 3);
    const choices = shuffle(rng, [answer, ...unique]);
    questions.push({ items, choices });
    answers.push(String(choices.indexOf(answer)));
  }
  return { public: { kind: 'sequence', questions }, answers };
}

export interface ScoredSubmission {
  score: number;
  maxScore: number;
  completed: boolean;
  corrections: Array<{ expected: string; given: string | null; correct: boolean }>;
}

/** Corrige une soumission à partir du défi stocké. */
export function scoreSubmission(
  stored: StoredChallenge,
  submission: MiniGameSubmission,
): ScoredSubmission {
  const challenge = stored.public;
  if (challenge.kind === 'memory' && submission.kind === 'memory') {
    return scoreMemory(challenge.cards, submission.flips);
  }
  if (challenge.kind === 'math' && submission.kind === 'math') {
    const corrections = stored.answers.map((expected, i) => {
      const value = submission.answers[i];
      const given = value === null || value === undefined ? null : String(value);
      return { expected, given, correct: given === expected };
    });
    const score = corrections.filter((c) => c.correct).length;
    return { score, maxScore: stored.answers.length, completed: true, corrections };
  }
  if (challenge.kind === 'sequence' && submission.kind === 'sequence') {
    const corrections = stored.answers.map((expectedIndex, i) => {
      const question = challenge.questions[i];
      const givenIndex = submission.answers[i];
      const expected = question?.choices[Number(expectedIndex)] ?? '';
      const given =
        givenIndex === null || givenIndex === undefined
          ? null
          : (question?.choices[givenIndex] ?? null);
      return { expected, given, correct: given === expected };
    });
    const score = corrections.filter((c) => c.correct).length;
    return { score, maxScore: stored.answers.length, completed: true, corrections };
  }
  throw new Error('Soumission incompatible avec le mini-jeu');
}

/**
 * Rejoue les retournements de cartes du mémory. Le score dépend du nombre de coups :
 * 8 coups = parfait, puis -1 point tous les 3 coups supplémentaires (au moins 40 % si terminé).
 */
export function scoreMemory(cards: string[], flips: number[]): ScoredSubmission {
  const matched = new Set<number>();
  let moves = 0;
  for (let i = 0; i + 1 < flips.length; i += 2) {
    const a = flips[i] as number;
    const b = flips[i + 1] as number;
    const valid =
      Number.isInteger(a) &&
      Number.isInteger(b) &&
      a !== b &&
      a >= 0 &&
      b >= 0 &&
      a < cards.length &&
      b < cards.length;
    if (!valid || matched.has(a) || matched.has(b)) continue;
    moves += 1;
    if (cards[a] === cards[b]) {
      matched.add(a);
      matched.add(b);
    }
  }
  const pairs = cards.length / 2;
  const found = matched.size / 2;
  const completed = found === pairs;
  const penalty = Math.floor(Math.max(0, moves - pairs) / 3);
  const floor = Math.ceil(pairs * 0.4);
  const score = completed
    ? Math.min(pairs, Math.max(floor, pairs - penalty))
    : Math.floor(found / 2);
  return {
    score,
    maxScore: pairs,
    completed,
    corrections: [{ expected: String(pairs), given: String(found), correct: completed }],
  };
}
