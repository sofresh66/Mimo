import { describe, expect, it } from 'vitest';
import {
  CatalogIndex,
  applyDelta,
  applyTimeDrift,
  createRng,
  defaultCatalog,
  dominantCategory,
  emptyCategoryXp,
  isoWeekKey,
  levelFromTotalXp,
  levelProgress,
  matchRecipe,
  moodOf,
  resolveEvolution,
  rollLoot,
  totalXpForLevel,
  validateCatalog,
  type EvolutionInput,
} from '../src';

const index = new CatalogIndex(defaultCatalog);

describe('catalogue', () => {
  it('est cohérent (références, formes obligatoires)', () => {
    expect(validateCatalog(defaultCatalog)).toEqual([]);
  });

  it('contient au moins 5 espèces de départ et 50 formes', () => {
    expect(defaultCatalog.species.filter((s) => s.starter).length).toBeGreaterThanOrEqual(5);
    expect(defaultCatalog.evolutions.length).toBeGreaterThanOrEqual(50);
  });
});

describe('niveaux', () => {
  it('calcule le niveau depuis l’XP totale', () => {
    expect(levelFromTotalXp(0)).toBe(1);
    expect(levelFromTotalXp(39)).toBe(1);
    expect(levelFromTotalXp(40)).toBe(2);
    expect(levelFromTotalXp(totalXpForLevel(8))).toBe(8);
    expect(levelFromTotalXp(totalXpForLevel(8) - 1)).toBe(7);
  });

  it('donne une progression entre 0 et 1', () => {
    const p = levelProgress(50);
    expect(p.level).toBe(2);
    expect(p.xpIntoLevel).toBe(10);
    expect(p.ratio).toBeGreaterThan(0);
    expect(p.ratio).toBeLessThan(1);
  });
});

describe('statistiques bienveillantes', () => {
  it('ne descend jamais sous le plancher de bonheur', () => {
    const s = applyDelta({ happiness: 40, energy: 50, curiosity: 50 }, { happiness: -100 });
    expect(s.happiness).toBeGreaterThanOrEqual(35);
  });

  it('recharge l’énergie et fait remonter un bonheur bas avec le temps', () => {
    const s = applyTimeDrift({ happiness: 40, energy: 10, curiosity: 90 }, 5 * 3_600_000);
    expect(s.energy).toBe(70);
    expect(s.happiness).toBe(55);
    expect(s.curiosity).toBe(80);
  });

  it('n’a jamais d’humeur négative', () => {
    expect(['radiant', 'happy', 'calm', 'sleepy', 'curious']).toContain(
      moodOf({ happiness: 35, energy: 0, curiosity: 0 }),
    );
  });
});

function input(partial: Partial<EvolutionInput>): EvolutionInput {
  return {
    species: 'dragon',
    currentFormKey: null,
    level: 1,
    categoryXp: emptyCategoryXp(),
    recipesDiscovered: 0,
    explorationsCompleted: 0,
    missionsCompleted: 0,
    ...partial,
  };
}

describe('évolutions', () => {
  const forms = defaultCatalog.evolutions;

  it('suit les stades selon le niveau', () => {
    expect(resolveEvolution(forms, input({ level: 1 })).key).toBe('dragon_egg');
    expect(resolveEvolution(forms, input({ level: 2 })).key).toBe('dragon_baby');
    expect(resolveEvolution(forms, input({ level: 7 })).key).toBe('dragon_young');
  });

  it('choisit la branche adulte selon la catégorie dominante', () => {
    const categoryXp = { ...emptyCategoryXp(), LOGIC: 600, SPORT: 200, READING: 100 };
    expect(resolveEvolution(forms, input({ level: 12, categoryXp })).key).toBe('dragon_sage');
    const adventure = { ...emptyCategoryXp(), ADVENTURE: 500, LOGIC: 100 };
    expect(resolveEvolution(forms, input({ level: 12, categoryXp: adventure })).key).toBe(
      'dragon_explorer',
    );
  });

  it('choisit la forme équilibrée sans catégorie dominante', () => {
    const categoryXp = {
      LOGIC: 100,
      CREATIVITY: 100,
      READING: 100,
      ADVENTURE: 100,
      HELPING: 100,
      SPORT: 100,
    };
    expect(resolveEvolution(forms, input({ level: 12, categoryXp })).key).toBe('dragon_blaze');
  });

  it('garde la branche adulte choisie et ne régresse jamais', () => {
    const categoryXp = { ...emptyCategoryXp(), CREATIVITY: 900 };
    expect(
      resolveEvolution(forms, input({ level: 15, currentFormKey: 'dragon_sage', categoryXp })).key,
    ).toBe('dragon_sage');
    expect(resolveEvolution(forms, input({ level: 3, currentFormKey: 'dragon_young' })).key).toBe(
      'dragon_young',
    );
  });

  it('atteint une forme spéciale quand les conditions secrètes sont réunies', () => {
    const categoryXp = { ...emptyCategoryXp(), LOGIC: 450, ADVENTURE: 420 };
    expect(
      resolveEvolution(forms, input({ level: 20, currentFormKey: 'dragon_sage', categoryXp })).key,
    ).toBe('dragon_celestial');
    expect(
      resolveEvolution(forms, input({ level: 19, currentFormKey: 'dragon_sage', categoryXp })).key,
    ).toBe('dragon_sage');
  });

  it('détecte la catégorie dominante', () => {
    expect(dominantCategory(emptyCategoryXp())).toBeNull();
    expect(dominantCategory({ ...emptyCategoryXp(), SPORT: 10 })).toBe('SPORT');
  });
});

describe('recettes', () => {
  it('trouve une recette quel que soit l’ordre', () => {
    expect(matchRecipe(defaultCatalog.recipes, ['milk', 'strawberry'])?.result).toBe(
      'magic_milkshake',
    );
    expect(matchRecipe(defaultCatalog.recipes, ['milk', 'stone'])).toBeNull();
  });
});

describe('butin', () => {
  it('est déterministe pour une graine donnée et ne contient que des objets connus', () => {
    const zone = index.zones.get('glowing_forest');
    if (!zone) throw new Error('zone manquante');
    const a = rollLoot(zone.loot, createRng(42));
    const b = rollLoot(zone.loot, createRng(42));
    expect(a).toEqual(b);
    for (const { item } of a.items) expect(index.items.has(item)).toBe(true);
  });

  it('inclut le butin garanti', () => {
    const chest = index.item('chest_epic');
    if (!chest.loot) throw new Error('loot manquant');
    const loot = rollLoot(chest.loot, createRng(1));
    expect(loot.items.find((i) => i.item === 'stardust')?.quantity).toBeGreaterThanOrEqual(1);
  });
});

describe('temps', () => {
  it('calcule la semaine ISO', () => {
    expect(isoWeekKey(new Date('2026-10-01T12:00:00Z'))).toBe('2026-W40');
    expect(isoWeekKey(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53');
  });
});
