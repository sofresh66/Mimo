import type { RecipeDefinition } from '../types';

const signature = (keys: readonly string[]) => [...keys].sort().join('+');

/** Trouve la recette correspondant exactement aux ingrédients (ordre indifférent). */
export function matchRecipe(
  recipes: readonly RecipeDefinition[],
  ingredients: readonly string[],
): RecipeDefinition | null {
  const sig = signature(ingredients);
  return recipes.find((r) => signature(r.ingredients) === sig) ?? null;
}
