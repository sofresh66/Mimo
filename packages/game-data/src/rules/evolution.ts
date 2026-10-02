import {
  EVOLUTION_STAGES,
  XP_CATEGORIES,
  type EvolutionFormDefinition,
  type EvolutionStage,
  type XpCategory,
} from '../types';

export type CategoryXp = Record<XpCategory, number>;

export const STAGE_MIN_LEVEL: Record<Exclude<EvolutionStage, 'SPECIAL'>, number> = {
  EGG: 1,
  BABY: 2,
  YOUNG: 6,
  ADULT: 12,
};

/** Part minimale de l'XP totale pour qu'une catégorie soit considérée dominante. */
export const DOMINANT_SHARE = 0.25;

export interface EvolutionInput {
  species: string;
  currentFormKey: string | null;
  level: number;
  categoryXp: CategoryXp;
  recipesDiscovered: number;
  explorationsCompleted: number;
  missionsCompleted: number;
}

export function emptyCategoryXp(): CategoryXp {
  return Object.fromEntries(XP_CATEGORIES.map((c) => [c, 0])) as CategoryXp;
}

export function stageRank(stage: EvolutionStage): number {
  return EVOLUTION_STAGES.indexOf(stage);
}

export function stageForLevel(level: number): Exclude<EvolutionStage, 'SPECIAL'> {
  if (level >= STAGE_MIN_LEVEL.ADULT) return 'ADULT';
  if (level >= STAGE_MIN_LEVEL.YOUNG) return 'YOUNG';
  if (level >= STAGE_MIN_LEVEL.BABY) return 'BABY';
  return 'EGG';
}

/**
 * Catégorie dominante parmi `candidates` : la plus élevée, si elle représente au moins
 * DOMINANT_SHARE de toute l'XP et qu'elle est strictement devant les autres candidates.
 */
export function dominantCategory(
  categoryXp: CategoryXp,
  candidates: readonly XpCategory[] = XP_CATEGORIES,
): XpCategory | null {
  const total = XP_CATEGORIES.reduce((sum, c) => sum + categoryXp[c], 0);
  if (total <= 0 || candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => categoryXp[b] - categoryXp[a]);
  const [top, second] = sorted;
  if (!top) return null;
  if (second && categoryXp[top] === categoryXp[second]) return null;
  return categoryXp[top] / total >= DOMINANT_SHARE ? top : null;
}

export function meetsConditions(form: EvolutionFormDefinition, input: EvolutionInput): boolean {
  const c = form.conditions;
  if (input.level < c.minLevel) return false;
  if (c.categoryXp) {
    for (const [cat, min] of Object.entries(c.categoryXp) as Array<[XpCategory, number]>) {
      if (input.categoryXp[cat] < min) return false;
    }
  }
  if (c.recipesDiscovered !== undefined && input.recipesDiscovered < c.recipesDiscovered) {
    return false;
  }
  if (
    c.explorationsCompleted !== undefined &&
    input.explorationsCompleted < c.explorationsCompleted
  ) {
    return false;
  }
  if (c.missionsCompleted !== undefined && input.missionsCompleted < c.missionsCompleted) {
    return false;
  }
  return true;
}

/**
 * Détermine la forme que doit avoir une créature. Règles :
 * - jamais de régression (une créature ne « dé-évolue » pas) ;
 * - une branche adulte, une fois choisie, est définitive ;
 * - une forme spéciale est atteinte si ses conditions sont réunies (dès le stade adulte).
 */
export function resolveEvolution(
  forms: readonly EvolutionFormDefinition[],
  input: EvolutionInput,
): EvolutionFormDefinition {
  const speciesForms = forms.filter((f) => f.species === input.species);
  const current = input.currentFormKey
    ? speciesForms.find((f) => f.key === input.currentFormKey)
    : undefined;
  if (current?.stage === 'SPECIAL') return current;

  const targetStage = stageForLevel(input.level);

  if (targetStage === 'ADULT') {
    const special = speciesForms.find((f) => f.stage === 'SPECIAL' && meetsConditions(f, input));
    if (special) return special;
    if (current?.stage === 'ADULT') return current;

    const branches = speciesForms.filter((f) => f.stage === 'ADULT' && f.conditions.dominant);
    const categories = branches.map((f) => f.conditions.dominant as XpCategory);
    const dominant = dominantCategory(input.categoryXp, categories);
    const branch = dominant ? branches.find((f) => f.conditions.dominant === dominant) : undefined;
    const balanced = speciesForms.find((f) => f.stage === 'ADULT' && !f.conditions.dominant);
    const chosen = branch ?? balanced;
    if (!chosen) throw new Error(`Aucune forme adulte pour ${input.species}`);
    return chosen;
  }

  const form = speciesForms.find((f) => f.stage === targetStage);
  if (!form) throw new Error(`Aucune forme ${targetStage} pour ${input.species}`);
  if (current && stageRank(current.stage) > stageRank(form.stage)) return current;
  return form;
}
