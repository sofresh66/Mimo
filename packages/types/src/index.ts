/**
 * Contrat partagé entre l'API (NestJS) et le web (Next.js) :
 * formes des réponses REST et des événements temps réel.
 */
import type {
  AccessorySlot,
  DecorTag,
  EvolutionStage,
  FamilyGoalType,
  FoodEffect,
  ItemCategory,
  LocalizedText,
  MiniGameKey,
  Mood,
  Palette,
  Rarity,
  SocialEventKind,
  XpCategory,
  FormFeature,
} from '@mimo/game-data';

export type {
  AccessorySlot,
  DecorTag,
  SocialEventKind,
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
export type RewardSource = 'PARENT' | 'MISSION' | 'FAMILY_MISSION' | 'LEVEL_UP' | 'FRIENDSHIP';
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
  /** Objet unique (décor, souvenir) : jamais en double. */
  unique: boolean;
  /** Objet plaçable dans l'espace de la créature. */
  decor: { tags: DecorTag[]; size: 'S' | 'M' | 'L' } | null;
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
  /** @deprecated Ancienne chambre (3 objets) : remplacée par `room`. */
  roomDecorations: ItemView[];
  /** Espace de la créature : décor de fond et objets placés. */
  room: RoomView;
  /** Créature d'un autre membre de la famille actuellement en visite. */
  visit: VisitView | null;
  /** Interactions survenues depuis la dernière consultation (« Pendant ton absence… »). */
  socialUnseen: SocialEventView[];
  /** Boîte aux lettres : courriers non lus (compteur calculé par le serveur). */
  mail: MailSummary;
}

// ─── Courrier familial ───────────────────────────────────────────────────────

/** Onglets de la boîte aux lettres. */
export type LetterBox = 'received' | 'sent' | 'cherished';
export const LETTER_BOXES: readonly LetterBox[] = ['received', 'sent', 'cherished'];

/** Membre de la famille : profil de jeu (enfant, adulte joueur) ou compte parent. */
export type LetterPartyKind = 'profile' | 'parent';

export interface LetterParty {
  kind: LetterPartyKind;
  /** Null si le profil a été supprimé depuis (le nom reste celui de l'envoi). */
  id: string | null;
  name: string;
  avatar: string;
}

export interface StationeryView {
  id: string;
  name: string;
  emoji: string;
  scene: SceneView;
}

export interface LetterView {
  id: string;
  from: LetterParty;
  to: LetterParty;
  /** Compagnon de l'expéditeur au moment de l'envoi (« Haylie & Luna »). */
  creatureName: string | null;
  content: string;
  stationery: StationeryView;
  createdAt: string;
  readAt: string | null;
  cherishedAt: string | null;
  /** Vrai si la lettre a été écrite par le lecteur (onglet « Envoyées »). */
  mine: boolean;
}

export interface LetterPage {
  letters: LetterView[];
  /** Curseur de la page suivante (null : plus rien à charger). */
  nextCursor: string | null;
}

export interface LetterRecipientView {
  kind: LetterPartyKind;
  id: string;
  name: string;
  avatar: string;
  color: string;
}

export interface StationeryChoiceView {
  item: StationeryView;
  owned: boolean;
  unlock: SceneUnlockView[];
}

/** Données nécessaires pour écrire une lettre. */
export interface LetterComposeView {
  recipients: LetterRecipientView[];
  stationery: StationeryChoiceView[];
}

export interface SendLetterInput {
  to: { kind: LetterPartyKind; id: string };
  content: string;
  stationeryId: string;
  /** Identifiant unique généré par le client (nouvel essai réseau sans doublon). */
  requestId: string;
}

export interface MailSummary {
  unread: number;
  /** Expéditeur du plus récent courrier non lu (« Tu as reçu une lettre de Mamie ! »). */
  latestFrom: { name: string; creatureName: string | null } | null;
}

/** Événement temps réel léger : jamais le contenu de la lettre. */
export interface MailReceivedPayload {
  letterId: string;
  senderName: string;
  creatureName: string | null;
}

// ─── Espace de la créature ────────────────────────────────────────────────────

export interface SceneView {
  sky: [string, string];
  ground: string;
  particles: string[];
}

/** Façon d'obtenir un décor (indice affiché tant qu'il est verrouillé). */
export type SceneUnlockView =
  | { kind: 'default' }
  | { kind: 'level'; level: number }
  | { kind: 'exploration'; zone: string; zoneName: string }
  | { kind: 'friendship'; level: number }
  | { kind: 'mission' }
  | { kind: 'familyMission' };

export type RoomLayer = 'back' | 'front';

export interface RoomPlacementInput {
  id: string;
  item: string;
  /** Position en % de la scène (bornée côté serveur). */
  x: number;
  y: number;
  layer: RoomLayer;
  flip: boolean;
}

export interface RoomPlacementView extends Omit<RoomPlacementInput, 'item'> {
  item: ItemView;
}

export interface RoomView {
  background: { id: string; name: string; emoji: string; scene: SceneView };
  layout: RoomPlacementView[];
}

export interface BackgroundView {
  item: ItemView;
  scene: SceneView;
  owned: boolean;
  current: boolean;
  unlock: SceneUnlockView[];
}

/** Objet plaçable possédé : `owned` exemplaires, dont `placed` déjà dans la scène. */
export interface PlaceableView {
  item: ItemView;
  owned: number;
  placed: number;
}

export interface RoomEditorView {
  room: RoomView;
  backgrounds: BackgroundView[];
  placeables: PlaceableView[];
  maxItems: number;
}

// ─── Relations entre créatures ────────────────────────────────────────────────

export type FriendshipLevelKey =
  'STRANGERS' | 'ACQUAINTANCES' | 'BUDDIES' | 'FRIENDS' | 'BEST_FRIENDS';

export interface FriendView {
  creature: CreatureSummary;
  owner: { id: string; displayName: string; avatar: string; color: string; type: PlayerType };
  level: number;
  levelKey: FriendshipLevelKey;
  hearts: number;
  points: number;
  /** Points à gagner avant le niveau suivant (null au niveau maximum). */
  toNextLevel: number | null;
  /** Parties « Jouer ensemble » encore possibles aujourd'hui. */
  playsLeft: number;
}

/** Interaction entre deux créatures, du point de vue du joueur qui la consulte. */
export interface SocialEventView {
  id: string;
  kind: SocialEventKind | 'FRIENDSHIP_UP';
  /** Clé de l'interaction (texte traduit côté interface). */
  eventKey: string;
  icon: string;
  /** Vrai si c'est la créature de ce joueur qui a rendu visite. */
  outgoing: boolean;
  friend: { creatureName: string; ownerName: string };
  item: { id: string; name: string; emoji: string } | null;
  loot: {
    coins: number;
    items: Array<{ id: string; name: string; emoji: string; quantity: number }>;
  };
  delta: number;
  level: number;
  levelKey: FriendshipLevelKey;
  createdAt: IsoDate;
}

export interface VisitView {
  id: string;
  visitor: CreatureSummary;
  owner: { displayName: string; type: PlayerType };
  eventKey: string;
  icon: string;
  /** Objet placé auquel le visiteur réagit, avec sa position dans la scène. */
  item: { id: string; name: string; emoji: string; x: number; y: number } | null;
  endsAt: IsoDate;
}

export interface PlayTogetherResult {
  event: SocialEventView;
  friend: FriendView;
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
  | 'COMPANION_USED'
  | 'SOCIAL_INTERACTION'
  | 'FRIENDSHIP_UP'
  | 'BACKGROUND_UNLOCKED'
  | 'ROOM_DECORATED';

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
  /** Interaction entre la créature du joueur et celle d'un autre membre de la famille. */
  'social:event': (payload: SocialEventView) => void;
  /** Nouvelle lettre reçue (déjà enregistrée en base ; aucun contenu transmis). */
  'mail:received': (payload: MailReceivedPayload) => void;
}

export type ClientToServerEvents = Record<string, never>;
