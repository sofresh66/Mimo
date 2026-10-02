import type { Rarity, XpCategory } from '@mimo/types';

/** Couleurs et icônes partagées (les libellés traduits restent dans l'application). */
export const RARITY_COLORS: Record<Rarity, string> = {
  COMMON: '#8a94a6',
  RARE: '#3fb6e8',
  EPIC: '#a06cd5',
  LEGENDARY: '#f5a524',
};

export const CATEGORY_META: Record<XpCategory, { color: string; emoji: string }> = {
  LOGIC: { color: '#3a86ff', emoji: '🧩' },
  CREATIVITY: { color: '#ff5d8f', emoji: '🎨' },
  READING: { color: '#a06cd5', emoji: '📖' },
  ADVENTURE: { color: '#2bb673', emoji: '🧭' },
  HELPING: { color: '#ff8a5c', emoji: '🤝' },
  SPORT: { color: '#f5a524', emoji: '⚽' },
};

export const STAT_COLORS = {
  xp: 'linear-gradient(90deg, #7c5cff, #b18cff)',
  happiness: 'linear-gradient(90deg, #ff7aa2, #ffb3c9)',
  energy: 'linear-gradient(90deg, #ffc145, #ffe08a)',
  curiosity: 'linear-gradient(90deg, #3fb6e8, #8fdcff)',
} as const;
