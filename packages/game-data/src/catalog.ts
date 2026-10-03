import buildingsJson from '../data/buildings.json';
import evolutionsJson from '../data/evolutions.json';
import familyMissionsJson from '../data/family-missions.json';
import itemsJson from '../data/items.json';
import miniGamesJson from '../data/minigames.json';
import missionsJson from '../data/missions.json';
import recipesJson from '../data/recipes.json';
import socialJson from '../data/social-events.json';
import speciesJson from '../data/species.json';
import zonesJson from '../data/zones.json';
import type {
  BuildingDefinition,
  EvolutionFormDefinition,
  FamilyMissionDefinition,
  GameCatalog,
  ItemDefinition,
  MiniGameDefinition,
  MissionTemplateDefinition,
  RecipeDefinition,
  SocialCatalog,
  SocialEventDefinition,
  SpeciesDefinition,
  ZoneDefinition,
} from './types';

/** Version du contenu : à incrémenter à chaque modification des fichiers `data/`. */
export const CONTENT_VERSION = '2026.10.2';

/**
 * Catalogue par défaut, chargé depuis les fichiers JSON versionnés.
 * Les JSON sont typés « larges » par TypeScript ; `validateCatalog` garantit leur cohérence.
 */
export const defaultCatalog: GameCatalog = {
  version: CONTENT_VERSION,
  species: speciesJson as SpeciesDefinition[],
  evolutions: evolutionsJson as EvolutionFormDefinition[],
  items: itemsJson as ItemDefinition[],
  recipes: recipesJson as RecipeDefinition[],
  zones: zonesJson as ZoneDefinition[],
  missionTemplates: missionsJson as MissionTemplateDefinition[],
  buildings: buildingsJson as BuildingDefinition[],
  familyMissions: familyMissionsJson as FamilyMissionDefinition[],
  miniGames: miniGamesJson as MiniGameDefinition[],
  social: socialJson as SocialCatalog,
};

/** Index par clé pour des accès O(1). */
export class CatalogIndex {
  readonly species: Map<string, SpeciesDefinition>;
  readonly forms: Map<string, EvolutionFormDefinition>;
  readonly items: Map<string, ItemDefinition>;
  readonly recipes: Map<string, RecipeDefinition>;
  readonly zones: Map<string, ZoneDefinition>;
  readonly missionTemplates: Map<string, MissionTemplateDefinition>;
  readonly buildings: Map<string, BuildingDefinition>;
  readonly familyMissions: Map<string, FamilyMissionDefinition>;
  readonly miniGames: Map<string, MiniGameDefinition>;
  readonly socialEvents: Map<string, SocialEventDefinition>;

  constructor(readonly catalog: GameCatalog) {
    const byKey = <T extends { key: string }>(list: T[]) => new Map(list.map((e) => [e.key, e]));
    this.species = byKey(catalog.species);
    this.forms = byKey(catalog.evolutions);
    this.items = byKey(catalog.items);
    this.recipes = byKey(catalog.recipes);
    this.zones = byKey(catalog.zones);
    this.missionTemplates = byKey(catalog.missionTemplates);
    this.buildings = byKey(catalog.buildings);
    this.familyMissions = byKey(catalog.familyMissions);
    this.miniGames = byKey(catalog.miniGames);
    this.socialEvents = byKey(catalog.social.events);
  }

  /** Décors de fond (catégorie BACKGROUND), dans l'ordre du catalogue. */
  backgrounds(): ItemDefinition[] {
    return this.catalog.items.filter((i) => i.category === 'BACKGROUND');
  }

  /** Papiers à lettres (catégorie STATIONERY), dans l'ordre du catalogue. */
  stationery(): ItemDefinition[] {
    return this.catalog.items.filter((i) => i.category === 'STATIONERY');
  }

  /** Objets à débloquer par la progression (décors et papiers à lettres). */
  unlockables(): ItemDefinition[] {
    return this.catalog.items.filter(
      (i) => i.category === 'BACKGROUND' || i.category === 'STATIONERY',
    );
  }

  /** Papier à lettres par défaut, toujours disponible sans être dans l'inventaire. */
  defaultStationery(): ItemDefinition {
    const found = this.stationery().find((b) => b.scene?.unlock.some((u) => u.kind === 'default'));
    if (!found) throw new Error('Aucun papier à lettres par défaut');
    return found;
  }

  /** Décor par défaut, toujours disponible sans être dans l'inventaire. */
  defaultBackground(): ItemDefinition {
    const found = this.backgrounds().find((b) => b.scene?.unlock.some((u) => u.kind === 'default'));
    if (!found) throw new Error('Aucun décor par défaut');
    return found;
  }

  formsOf(species: string): EvolutionFormDefinition[] {
    return this.catalog.evolutions.filter((f) => f.species === species);
  }

  item(key: string): ItemDefinition {
    const item = this.items.get(key);
    if (!item) throw new Error(`Objet inconnu : ${key}`);
    return item;
  }

  form(key: string): EvolutionFormDefinition {
    const form = this.forms.get(key);
    if (!form) throw new Error(`Forme inconnue : ${key}`);
    return form;
  }
}

/** Vérifie l'intégrité référentielle du catalogue. Retourne la liste des problèmes. */
export function validateCatalog(catalog: GameCatalog): string[] {
  const errors: string[] = [];
  const idx = new CatalogIndex(catalog);
  const checkUnique = (name: string, list: Array<{ key: string }>) => {
    const seen = new Set<string>();
    for (const { key } of list) {
      if (seen.has(key)) errors.push(`${name}: clé dupliquée ${key}`);
      seen.add(key);
    }
  };
  checkUnique('species', catalog.species);
  checkUnique('evolutions', catalog.evolutions);
  checkUnique('items', catalog.items);
  checkUnique('recipes', catalog.recipes);
  checkUnique('zones', catalog.zones);
  checkUnique('missions', catalog.missionTemplates);
  checkUnique('buildings', catalog.buildings);
  checkUnique('social', catalog.social.events);

  const checkItem = (ctx: string, key: string) => {
    if (!idx.items.has(key)) errors.push(`${ctx}: objet inconnu ${key}`);
  };
  const checkLoot = (ctx: string, loot: ItemDefinition['loot']) => {
    if (!loot) return;
    for (const e of loot.entries) if (e.kind === 'item') checkItem(ctx, e.item);
    for (const g of loot.guaranteed ?? []) checkItem(ctx, g.item);
  };

  for (const species of catalog.species) {
    const forms = idx.formsOf(species.key);
    for (const stage of ['EGG', 'BABY', 'YOUNG'] as const) {
      if (forms.filter((f) => f.stage === stage).length !== 1)
        errors.push(`species ${species.key}: il faut exactement une forme ${stage}`);
    }
    const balanced = forms.filter((f) => f.stage === 'ADULT' && !f.conditions.dominant);
    if (balanced.length !== 1)
      errors.push(`species ${species.key}: il faut exactement une forme adulte équilibrée`);
  }
  for (const form of catalog.evolutions) {
    if (!idx.species.has(form.species)) errors.push(`form ${form.key}: espèce inconnue`);
  }
  for (const item of catalog.items) {
    if (item.category === 'FOOD' && !item.effect) errors.push(`item ${item.key}: effet manquant`);
    if (item.category === 'ACCESSORY' && !item.slot) errors.push(`item ${item.key}: slot manquant`);
    if (item.category === 'CHEST' && !item.loot) errors.push(`item ${item.key}: loot manquant`);
    if (item.hatchesSpecies && !idx.species.has(item.hatchesSpecies))
      errors.push(`item ${item.key}: espèce inconnue ${item.hatchesSpecies}`);
    checkLoot(`item ${item.key}`, item.loot);
    if (item.category === 'BACKGROUND' || item.category === 'STATIONERY') {
      if (!item.scene) errors.push(`item ${item.key}: décor sans scène`);
      if (!item.unique) errors.push(`item ${item.key}: un décor doit être unique`);
      if (item.price !== undefined) errors.push(`item ${item.key}: un décor ne se vend pas`);
      if (item.decor) errors.push(`item ${item.key}: un décor ne se place pas`);
      for (const u of item.scene?.unlock ?? []) {
        if (u.kind === 'exploration' && !idx.zones.has(u.zone))
          errors.push(`item ${item.key}: zone inconnue ${u.zone}`);
      }
    } else if (item.scene) {
      errors.push(`item ${item.key}: scène réservée aux décors`);
    }
    if (item.decor && item.decor.tags.length === 0)
      errors.push(`item ${item.key}: objet plaçable sans étiquette`);
  }
  for (const category of ['BACKGROUND', 'STATIONERY'] as const) {
    const defaults = catalog.items.filter(
      (i) => i.category === category && i.scene?.unlock.some((u) => u.kind === 'default'),
    );
    if (defaults.length !== 1) errors.push(`il faut exactement un ${category} par défaut`);
  }
  for (const event of catalog.social.events) {
    checkLoot(`social ${event.key}`, event.loot);
    if (event.minLevel < 0 || event.minLevel > 4)
      errors.push(`social ${event.key}: niveau invalide`);
    if (event.kind === 'SQUABBLE' && event.delta >= 0)
      errors.push(`social ${event.key}: une chamaillerie retire des points`);
    if (event.kind !== 'SQUABBLE' && event.delta <= 0)
      errors.push(`social ${event.key}: une interaction positive ajoute des points`);
  }
  if (!catalog.social.events.some((e) => e.kind === 'RECONCILE'))
    errors.push('social : une réconciliation est obligatoire');
  for (const reward of catalog.social.levelRewards) checkItem('social levelRewards', reward.item);
  for (const mission of catalog.familyMissions) {
    if (mission.rewardItem) checkItem(`familyMission ${mission.key}`, mission.rewardItem);
  }
  for (const recipe of catalog.recipes) {
    recipe.ingredients.forEach((i) => checkItem(`recipe ${recipe.key}`, i));
    checkItem(`recipe ${recipe.key}`, recipe.result);
    if (recipe.ingredients.length < 2 || recipe.ingredients.length > 3)
      errors.push(`recipe ${recipe.key}: 2 ou 3 ingrédients attendus`);
  }
  for (const zone of catalog.zones) checkLoot(`zone ${zone.key}`, zone.loot);
  return errors;
}
