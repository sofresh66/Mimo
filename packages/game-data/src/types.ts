/**
 * Types des définitions de contenu du jeu.
 * Les fichiers JSON de `data/` sont la source versionnée ; ils sont synchronisés en base
 * (tables de définition) par le seed et peuvent ensuite être enrichis par un back-office.
 */

export const LOCALES = ['fr', 'en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

/** Texte localisé : le français est obligatoire, les autres langues sont optionnelles. */
export type LocalizedText = { fr: string } & Partial<Record<Exclude<Locale, 'fr'>, string>>;

export const XP_CATEGORIES = [
  'LOGIC',
  'CREATIVITY',
  'READING',
  'ADVENTURE',
  'HELPING',
  'SPORT',
] as const;
export type XpCategory = (typeof XP_CATEGORIES)[number];

export const EVOLUTION_STAGES = ['EGG', 'BABY', 'YOUNG', 'ADULT', 'SPECIAL'] as const;
export type EvolutionStage = (typeof EVOLUTION_STAGES)[number];

export const RARITIES = ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const;
export type Rarity = (typeof RARITIES)[number];

export const ITEM_CATEGORIES = [
  'FOOD',
  'ACCESSORY',
  'OBJECT',
  'MATERIAL',
  'DECORATION',
  'SPECIAL',
  'CHEST',
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const ACCESSORY_SLOTS = ['HEAD', 'FACE', 'NECK', 'BACK'] as const;
export type AccessorySlot = (typeof ACCESSORY_SLOTS)[number];

export interface Palette {
  body: string;
  belly: string;
  accent: string;
}

export interface SpeciesDefinition {
  key: string;
  name: LocalizedText;
  description: LocalizedText;
  emoji: string;
  /** Catégorie d'XP qui correspond au tempérament de l'espèce (purement narratif). */
  affinity: XpCategory;
  palette: Palette;
  /** Les espèces de départ peuvent être adoptées directement ; les autres via des oeufs spéciaux. */
  starter: boolean;
}

/** Conditions d'une forme d'évolution. Aucune n'est affichée telle quelle aux enfants. */
export interface EvolutionConditions {
  minLevel: number;
  /** Catégorie dominante requise (forme adulte de branche). */
  dominant?: XpCategory;
  /** XP minimale par catégorie. */
  categoryXp?: Partial<Record<XpCategory, number>>;
  /** Nombre minimal de recettes découvertes. */
  recipesDiscovered?: number;
  /** Nombre minimal d'explorations terminées. */
  explorationsCompleted?: number;
  /** Nombre minimal de missions validées. */
  missionsCompleted?: number;
}

export type FormFeature =
  | 'none'
  | 'glasses'
  | 'scarf'
  | 'beret'
  | 'shield'
  | 'headband'
  | 'book'
  | 'leaf'
  | 'compass'
  | 'gear'
  | 'note'
  | 'star'
  | 'moon'
  | 'flame'
  | 'crystal'
  | 'tails';

export interface EvolutionFormDefinition {
  key: string;
  species: string;
  stage: EvolutionStage;
  name: LocalizedText;
  description: LocalizedText;
  /** Indice volontairement vague, révélé dans la Créaturopédie une fois l'espèce connue. */
  hint: LocalizedText;
  palette: Palette;
  feature: FormFeature;
  /** Les formes spéciales ont une aura animée. */
  aura?: string;
  conditions: EvolutionConditions;
}

export interface FoodEffect {
  happiness?: number;
  energy?: number;
  curiosity?: number;
}

export interface ItemDefinition {
  key: string;
  name: LocalizedText;
  description: LocalizedText;
  category: ItemCategory;
  rarity: Rarity;
  emoji: string;
  /** Prix en pièces dans la boutique du village (absent = non vendu). */
  price?: number;
  /** Effet lorsqu'elle est mangée (catégorie FOOD). */
  effect?: FoodEffect;
  /** Emplacement pour les accessoires équipables. */
  slot?: AccessorySlot;
  /** Contenu d'un coffre (catégorie CHEST). */
  loot?: LootTable;
  /** Oeuf spécial : espèce qui éclot (catégorie SPECIAL). */
  hatchesSpecies?: string;
}

export interface RecipeDefinition {
  key: string;
  name: LocalizedText;
  /** Ingrédients (clés d'objets), l'ordre n'a pas d'importance. */
  ingredients: string[];
  result: string;
  hint: LocalizedText;
}

export type LootEntry =
  | { kind: 'item'; item: string; weight: number; min?: number; max?: number }
  | { kind: 'coins'; weight: number; min: number; max: number };

export interface LootTable {
  rolls: number;
  entries: LootEntry[];
  /** Butin garanti, en plus des tirages. */
  guaranteed?: Array<{ item: string; quantity: number }>;
}

export interface ZoneDefinition {
  key: string;
  name: LocalizedText;
  description: LocalizedText;
  emoji: string;
  colors: [string, string];
  durationMinutes: number;
  minLevel: number;
  energyCost: number;
  xp: { category: XpCategory; amount: number };
  loot: LootTable;
}

export interface MissionTemplateDefinition {
  key: string;
  title: LocalizedText;
  description: LocalizedText;
  category: XpCategory;
  xp: number;
  coins: number;
  icon: string;
}

export interface BuildingDefinition {
  key: string;
  name: LocalizedText;
  description: LocalizedText;
  emoji: string;
  /** Points de village nécessaires pour le construire. */
  requiredPoints: number;
  /** Position dans la représentation 2D du village (en %). */
  position: { x: number; y: number };
}

export type FamilyGoalType =
  'MISSIONS_COMPLETED' | 'EXPLORATIONS_COMPLETED' | 'GAMES_PLAYED' | 'CREATURES_FED';

export interface FamilyMissionDefinition {
  key: string;
  title: LocalizedText;
  description: LocalizedText;
  goalType: FamilyGoalType;
  target: number;
  rewardPoints: number;
  icon: string;
}

export type MiniGameKey = 'memory' | 'math' | 'sequence';

export interface MiniGameDefinition {
  key: MiniGameKey;
  name: LocalizedText;
  description: LocalizedText;
  emoji: string;
  category: XpCategory;
  /** XP maximale par partie réussie. */
  maxXp: number;
  /** Nombre de parties récompensées par jour (au-delà, on joue pour le plaisir). */
  dailyRewardedSessions: number;
  /** Durée minimale plausible d'une partie, en secondes (anti-triche). */
  minDurationSeconds: number;
  /** Durée maximale d'une session avant expiration, en secondes. */
  maxDurationSeconds: number;
  energyCost: number;
}

export interface GameCatalog {
  version: string;
  species: SpeciesDefinition[];
  evolutions: EvolutionFormDefinition[];
  items: ItemDefinition[];
  recipes: RecipeDefinition[];
  zones: ZoneDefinition[];
  missionTemplates: MissionTemplateDefinition[];
  buildings: BuildingDefinition[];
  familyMissions: FamilyMissionDefinition[];
  miniGames: MiniGameDefinition[];
}
