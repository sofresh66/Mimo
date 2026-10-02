/**
 * Contrat partagé entre l'API (NestJS) et le web (Next.js) :
 * formes des réponses REST et des événements temps réel.
 */
import type {
  AccessorySlot,
  EvolutionStage,
  FamilyGoalType,
  FoodEffect,
  ItemCategory,
  LocalizedText,
  MiniGameKey,
  Mood,
  Palette,
  Rarity,
  XpCategory,
  FormFeature,
} from '@mimo/game-data';

export type {
  AccessorySlot,
  EvolutionStage,
  FamilyGoalType,
  ItemCategory,
  LocalizedText,
  MiniGameKey,
  Mood,
  Palette,
  Rarity,
  XpCategory,
  FormFeature,
};

export type IsoDate = string;
export type SessionMode = 'DEVICE' | 'PARENT' | 'CHILD' | 'PLAYER';
/** Rôle d'un compte dans sa famille : seul PARENT a des droits parentaux. */
export type FamilyRole = 'PARENT' | 'ADULT_PLAYER';
/** Profil de jeu : enfant (PIN) ou adulte joueur (son propre compte, sans droits parentaux). */
export type PlayerType = 'CHILD' | 'ADULT';
export type MissionRecurrence = 'ONCE' | 'DAILY' | 'WEEKLY';
export type MissionStatus = 'TODO' | 'PENDING' | 'APPROVED' | 'DECLINED';
export type RewardType = 'XP' | 'COINS' | 'ITEM';
export type RewardSource = 'PARENT' | 'MISSION' | 'FAMILY_MISSION' | 'LEVEL_UP';
export type CompanionAction = 'story' | 'riddle' | 'math' | 'fact' | 'joke';
export const COMPANION_ACTIONS: readonly CompanionAction[] = [
  'story',
  'riddle',
  'math',
  'fact',
  'joke',
];

/** Erreur renvoyée par l'API : `code` est stable et traduit côté interface. */
export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ─── Authentification ────────────────────────────────────────────────────────

export interface MeResponse {
  user: { id: string; email: string; displayName: string; role: FamilyRole };
  family: { id: string; name: string } | null;
  mode: SessionMode;
  /** Profil de jeu de la session (mode CHILD ou PLAYER). */
  child: {
    id: string;
    displayName: string;
    avatar: string;
    color: string;
    type: PlayerType;
  } | null;
  parentModeExpiresAt: IsoDate | null;
  hasParentPin: boolean;
}

// ─── Apparence et créatures ──────────────────────────────────────────────────

export interface Appearance {
  species: string;
  stage: EvolutionStage;
  palette: Palette;
  feature: FormFeature;
  aura: string | null;
}

export interface ItemView {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  rarity: Rarity;
  emoji: string;
  price: number | null;
  effect: FoodEffect | null;
  slot: AccessorySlot | null;
}

export type Equipment = Partial<Record<AccessorySlot, ItemView>>;

export interface CreatureView {
  id: string;
  name: string;
  speciesId: string;
  speciesName: string;
  formId: string;
  formName: string;
  formDescription: string;
  stage: EvolutionStage;
  level: number;
  totalXp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  isMaxLevel: boolean;
  stats: { happiness: number; energy: number; curiosity: number };
  attributes: Record<XpCategory, number>;
  mood: Mood;
  appearance: Appearance;
  equipment: Equipment;
  bornAt: IsoDate;
  hatchedAt: IsoDate | null;
  ageDays: number;
  isActive: boolean;
  isExploring: boolean;
}

export interface CreatureSummary {
  id: string;
  name: string;
  level: number;
  formName: string;
  appearance: Appearance;
}

export interface SpeciesView {
  id: string;
  name: string;
  description: string;
  emoji: string;
  appearance: Appearance;
}

/** Résultat d'un gain d'XP : sert à déclencher les animations (niveau, évolution). */
export interface ProgressOutcome {
  xpGained: number;
  category: XpCategory;
  levelBefore: number;
  levelAfter: number;
  leveledUp: boolean;
  hatched: boolean;
  evolution: { fromFormId: string; toFormId: string; toName: string; stage: EvolutionStage } | null;
}

// ─── Profils ─────────────────────────────────────────────────────────────────

export interface PlayerProfile {
  id: string;
  type: PlayerType;
  displayName: string;
  avatar: string;
  color: string;
  locked: boolean;
  creature: CreatureSummary | null;
}

export interface ChildHome {
  child: { id: string; displayName: string; avatar: string; color: string };
  creature: CreatureView | null;
  coins: number;
  pendingRewards: number;
  missionsTodo: number;
  exploration: ExplorationView | null;
  unseenExploration: ExplorationView | null;
  roomDecorations: ItemView[];
}

// ─── Missions ────────────────────────────────────────────────────────────────

export interface MissionView {
  id: string;
  title: string;
  description: string | null;
  category: XpCategory;
  icon: string;
  xp: number;
  coins: number;
  recurrence: MissionRecurrence;
  rewardItem: ItemView | null;
  assignedChildId: string | null;
  isActive: boolean;
  templateId: string | null;
}

export interface ChildMissionView extends MissionView {
  status: MissionStatus;
  completionId: string | null;
}

export interface MissionTemplateView {
  id: string;
  title: string;
  description: string;
  category: XpCategory;
  xp: number;
  coins: number;
  icon: string;
}

export interface PendingCompletionView {
  id: string;
  mission: {
    id: string;
    title: string;
    icon: string;
    xp: number;
    coins: number;
    category: XpCategory;
  };
  child: { id: string; displayName: string; avatar: string; color: string; type: PlayerType };
  requestedAt: IsoDate | null;
}

export interface MissionValidatedPayload {
  completionId: string;
  missionTitle: string;
  missionIcon: string;
  parentName: string;
  xp: number;
  coins: number;
  category: XpCategory;
  outcome: ProgressOutcome | null;
  rewardCreated: boolean;
}

// ─── Inventaire, cuisine, boutique ───────────────────────────────────────────

export interface InventoryEntry {
  item: ItemView;
  quantity: number;
}

export interface InventoryView {
  coins: number;
  entries: InventoryEntry[];
  equipment: Equipment;
  roomDecorations: string[];
}

export interface LootView {
  coins: number;
  items: Array<{ item: ItemView; quantity: number }>;
}

export interface RecipeView {
  id: string;
  discovered: boolean;
  name: string | null;
  hint: string;
  ingredients: ItemView[] | null;
  result: ItemView | null;
}

export interface CookResult {
  success: boolean;
  recipe: RecipeView | null;
  newlyDiscovered: boolean;
  result: ItemView | null;
}

export interface FeedResult {
  creature: CreatureView;
  effect: FoodEffect;
  outcome: ProgressOutcome | null;
}

export interface HatchResult {
  creature: CreatureView;
}

// ─── Exploration ─────────────────────────────────────────────────────────────

export interface ZoneView {
  id: string;
  name: string;
  description: string;
  emoji: string;
  colors: [string, string];
  durationSeconds: number;
  minLevel: number;
  energyCost: number;
  xpCategory: XpCategory;
  xpAmount: number;
  locked: boolean;
}

export interface ExplorationView {
  id: string;
  zone: { id: string; name: string; emoji: string; colors: [string, string] };
  creatureName: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  startedAt: IsoDate;
  endsAt: IsoDate;
  completedAt: IsoDate | null;
  seen: boolean;
  rewards: LootView | null;
  xp: number | null;
}

// ─── Récompenses ─────────────────────────────────────────────────────────────

export interface RewardView {
  id: string;
  type: RewardType;
  source: RewardSource;
  item: ItemView | null;
  amount: number;
  message: string | null;
  fromName: string | null;
  createdAt: IsoDate;
}

export interface RewardOpenResult {
  reward: RewardView;
  loot: LootView;
  outcome: ProgressOutcome | null;
}

// ─── Village ─────────────────────────────────────────────────────────────────

export interface BuildingView {
  id: string;
  name: string;
  description: string;
  emoji: string;
  requiredPoints: number;
  position: { x: number; y: number };
  unlocked: boolean;
  unlockedAt: IsoDate | null;
}

export interface FamilyMissionView {
  id: string;
  title: string;
  description: string;
  icon: string;
  goalType: FamilyGoalType;
  target: number;
  progress: number;
  completed: boolean;
  rewardPoints: number;
}

export interface VillageView {
  name: string;
  points: number;
  level: number;
  buildings: BuildingView[];
  next: BuildingView | null;
  weekKey: string;
  familyMissions: FamilyMissionView[];
  companions: Array<{ childAvatar: string; creature: CreatureSummary }>;
}

// ─── Créaturopédie ───────────────────────────────────────────────────────────

export interface DexEntryView {
  id: string;
  speciesId: string;
  stage: EvolutionStage;
  discovered: boolean;
  name: string | null;
  description: string | null;
  /** Indice affiché seulement quand l'espèce est déjà connue de la famille. */
  hint: string | null;
  appearance: Appearance | null;
}

export interface DexView {
  discovered: number;
  total: number;
  entries: DexEntryView[];
}

// ─── Mini-jeux ───────────────────────────────────────────────────────────────

export interface MiniGameInfo {
  key: MiniGameKey;
  name: string;
  description: string;
  emoji: string;
  category: XpCategory;
  maxXp: number;
  rewardedSessionsLeft: number;
  dailyRewardedSessions: number;
}

export type MathDifficulty = 'easy' | 'medium' | 'hard';

export type MiniGameChallenge =
  | { kind: 'memory'; cards: string[] }
  | { kind: 'math'; difficulty: MathDifficulty; questions: Array<{ text: string }> }
  | { kind: 'sequence'; questions: Array<{ items: string[]; choices: string[] }> };

export interface MiniGameStartResponse {
  sessionId: string;
  gameKey: MiniGameKey;
  challenge: MiniGameChallenge;
  rewarded: boolean;
}

export type MiniGameSubmission =
  | { kind: 'memory'; flips: number[] }
  | { kind: 'math'; answers: Array<number | null> }
  | { kind: 'sequence'; answers: Array<number | null> };

export interface MiniGameResult {
  score: number;
  maxScore: number;
  xpAwarded: number;
  rewarded: boolean;
  corrections: Array<{ expected: string; given: string | null; correct: boolean }>;
  outcome: ProgressOutcome | null;
}

// ─── Compagnon (IA future, actions prédéfinies) ──────────────────────────────

export interface CompanionResponse {
  action: CompanionAction;
  title: string;
  text: string;
  /** Réponse à révéler (énigme, défi de maths). */
  answer: string | null;
  source: 'engine' | 'fallback';
}

export interface CompanionStatus {
  enabled: boolean;
  allowedActions: CompanionAction[];
}

// ─── Historique ──────────────────────────────────────────────────────────────

export type GameEventType =
  | 'CREATURE_ADOPTED'
  | 'CREATURE_HATCHED'
  | 'MISSION_REQUESTED'
  | 'MISSION_COMPLETED'
  | 'XP_GAINED'
  | 'LEVEL_UP'
  | 'EVOLUTION'
  | 'ITEM_FOUND'
  | 'ITEM_BOUGHT'
  | 'CREATURE_FED'
  | 'CREATURE_PLAYED'
  | 'RECIPE_DISCOVERED'
  | 'CHEST_OPENED'
  | 'REWARD_RECEIVED'
  | 'EXPLORATION_STARTED'
  | 'EXPLORATION_COMPLETED'
  | 'GAME_PLAYED'
  | 'MATERIAL_DONATED'
  | 'BUILDING_UNLOCKED'
  | 'FAMILY_MISSION_COMPLETED'
  | 'COMPANION_USED';

export interface GameEventView {
  id: string;
  type: GameEventType;
  child: { id: string; displayName: string; avatar: string } | null;
  payload: Record<string, unknown>;
  createdAt: IsoDate;
}

// ─── Espace parent ───────────────────────────────────────────────────────────

export interface ChildOverview {
  id: string;
  type: PlayerType;
  displayName: string;
  avatar: string;
  color: string;
  lastSeenAt: IsoDate | null;
  creature: CreatureSummary | null;
  level: number;
  totalXp: number;
  categoryXp: Record<XpCategory, number>;
  missionsCompletedTotal: number;
  missionsCompletedWeek: number;
  xpWeek: number;
  pendingCount: number;
  explorationsCompleted: number;
  recipesDiscovered: number;
}

export interface ParentDashboard {
  family: { id: string; name: string };
  children: ChildOverview[];
  pending: PendingCompletionView[];
  recent: GameEventView[];
  village: { points: number; level: number; next: BuildingView | null };
  familyMissions: FamilyMissionView[];
}

export interface ChildDetail {
  overview: ChildOverview;
  creatures: CreatureView[];
  recentXp: Array<{
    id: string;
    amount: number;
    category: XpCategory;
    source: string;
    createdAt: IsoDate;
  }>;
  history: GameEventView[];
}

export interface FamilySettings {
  id: string;
  name: string;
  companionEnabled: boolean;
  companionAllowedActions: CompanionAction[];
  parents: Array<{ id: string; displayName: string; email: string }>;
  /** Adultes joueurs : membres sans aucun droit parental. */
  adultPlayers: Array<{ id: string; displayName: string; email: string; profileId: string | null }>;
}

/** Invitation d'un parent en attente (le jeton n'est jamais renvoyé après sa création). */
export interface ParentInvitationView {
  id: string;
  role: FamilyRole;
  createdAt: IsoDate;
  expiresAt: IsoDate;
  createdBy: string | null;
}

/** Réponse à la création : le jeton n'apparaît qu'ici, pour construire le lien à partager. */
export interface CreatedParentInvitation extends ParentInvitationView {
  token: string;
}

/** Aperçu public d'une invitation (page « Rejoindre la famille »). */
export interface ParentInvitationPreview {
  familyName: string;
  invitedBy: string | null;
  expiresAt: IsoDate;
  /** Vrai si le visiteur connecté fait déjà partie de cette famille. */
  alreadyMember: boolean;
  /** Rôle proposé : parent ou adulte joueur. */
  role: FamilyRole;
}

export interface AcceptedInvitation {
  familyId: string;
  familyName: string;
  role: FamilyRole;
}

export interface MissionSuggestion {
  templateId: string;
  title: string;
  icon: string;
  category: XpCategory;
  reason: string;
}

// ─── Temps réel (Socket.IO) ──────────────────────────────────────────────────

export interface ServerToClientEvents {
  'mission:validated': (payload: MissionValidatedPayload) => void;
  'missions:changed': () => void;
  'mission:requested': (payload: PendingCompletionView) => void;
  'exploration:completed': (payload: ExplorationView) => void;
  'reward:received': (payload: RewardView) => void;
  'creature:updated': (payload: { childId: string }) => void;
  'village:updated': (payload: { points: number; newBuildings: string[] }) => void;
  'family-mission:completed': (payload: { title: string; rewardPoints: number }) => void;
  /** Un PIN vient d'être verrouillé après trop d'essais (alerte pour les parents). */
  'security:pin-locked': (payload: { target: 'parent' | 'child'; name: string | null }) => void;
}

export type ClientToServerEvents = Record<string, never>;
