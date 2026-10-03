'use client';

import type {
  ChildDetail,
  ChildHome,
  ChildMissionView,
  CompanionStatus,
  CreatureView,
  DexView,
  ExplorationView,
  FriendView,
  FamilySettings,
  InventoryView,
  ItemView,
  MiniGameInfo,
  MissionTemplateView,
  MissionView,
  ParentDashboard,
  PendingCompletionView,
  PlayerProfile,
  RecipeView,
  RewardView,
  RoomEditorView,
  SocialEventView,
  SpeciesView,
  VillageView,
  ZoneView,
} from '@mimo/types';
import { useQuery } from '@tanstack/react-query';
import { http } from './api';

/** Clés de cache centralisées (utilisées aussi pour l'invalidation temps réel). */
export const keys = {
  profiles: ['profiles'] as const,
  home: ['home'] as const,
  species: ['species'] as const,
  creatures: ['creatures'] as const,
  missions: ['missions'] as const,
  inventory: ['inventory'] as const,
  shop: ['shop'] as const,
  recipes: ['recipes'] as const,
  zones: ['zones'] as const,
  explorations: ['explorations'] as const,
  dex: ['dex'] as const,
  village: ['village'] as const,
  games: ['games'] as const,
  rewards: ['rewards'] as const,
  companion: ['companion'] as const,
  room: ['room'] as const,
  friends: ['friends'] as const,
  friendsJournal: ['friends', 'journal'] as const,
  parent: {
    dashboard: ['parent', 'dashboard'] as const,
    missions: ['parent', 'missions'] as const,
    templates: ['parent', 'templates'] as const,
    pending: ['parent', 'pending'] as const,
    child: (id: string) => ['parent', 'child', id] as const,
    history: (childId: string) => ['parent', 'history', childId] as const,
    rewards: ['parent', 'rewards'] as const,
    giftable: ['parent', 'giftable'] as const,
    settings: ['parent', 'settings'] as const,
    invitations: ['parent', 'invitations'] as const,
    village: ['parent', 'village'] as const,
  },
};

// ─── Enfant ──────────────────────────────────────────────────────────────────
export const useProfiles = (enabled = true) =>
  useQuery({
    queryKey: keys.profiles,
    queryFn: () => http.get<PlayerProfile[]>('/profiles'),
    enabled,
  });
export const useHome = () =>
  useQuery({ queryKey: keys.home, queryFn: () => http.get<ChildHome>('/me/home') });
export const useSpecies = () =>
  useQuery({
    queryKey: keys.species,
    queryFn: () => http.get<SpeciesView[]>('/me/species'),
    staleTime: Infinity,
  });
export const useCreatures = () =>
  useQuery({ queryKey: keys.creatures, queryFn: () => http.get<CreatureView[]>('/me/creatures') });
export const useChildMissions = () =>
  useQuery({
    queryKey: keys.missions,
    queryFn: () => http.get<ChildMissionView[]>('/me/missions'),
  });
export const useInventory = () =>
  useQuery({ queryKey: keys.inventory, queryFn: () => http.get<InventoryView>('/me/inventory') });
export const useShop = () =>
  useQuery({
    queryKey: keys.shop,
    queryFn: () => http.get<ItemView[]>('/me/shop'),
    staleTime: 300_000,
  });
export const useRecipes = () =>
  useQuery({ queryKey: keys.recipes, queryFn: () => http.get<RecipeView[]>('/me/recipes') });
export const useZones = () =>
  useQuery({ queryKey: keys.zones, queryFn: () => http.get<ZoneView[]>('/me/zones') });
export const useExplorations = () =>
  useQuery({
    queryKey: keys.explorations,
    queryFn: () => http.get<ExplorationView[]>('/me/explorations'),
  });
export const useDex = () =>
  useQuery({ queryKey: keys.dex, queryFn: () => http.get<DexView>('/me/dex') });
export const useRoomEditor = (enabled = true) =>
  useQuery({
    queryKey: keys.room,
    queryFn: () => http.get<RoomEditorView>('/me/room'),
    enabled,
  });
export const useFriends = () =>
  useQuery({ queryKey: keys.friends, queryFn: () => http.get<FriendView[]>('/me/friends') });
export const useFriendsJournal = () =>
  useQuery({
    queryKey: keys.friendsJournal,
    queryFn: () => http.get<SocialEventView[]>('/me/friends/journal'),
  });
export const useVillage = () =>
  useQuery({ queryKey: keys.village, queryFn: () => http.get<VillageView>('/me/village') });
export const useGames = () =>
  useQuery({ queryKey: keys.games, queryFn: () => http.get<MiniGameInfo[]>('/me/games') });
export const useRewards = () =>
  useQuery({ queryKey: keys.rewards, queryFn: () => http.get<RewardView[]>('/me/rewards') });
export const useCompanion = () =>
  useQuery({ queryKey: keys.companion, queryFn: () => http.get<CompanionStatus>('/me/companion') });

// ─── Parent ──────────────────────────────────────────────────────────────────
export const useDashboard = () =>
  useQuery({
    queryKey: keys.parent.dashboard,
    queryFn: () => http.get<ParentDashboard>('/parent/dashboard'),
  });
export const useParentMissions = () =>
  useQuery({ queryKey: keys.parent.missions, queryFn: () => http.get<MissionView[]>('/missions') });
export const useTemplates = () =>
  useQuery({
    queryKey: keys.parent.templates,
    queryFn: () => http.get<MissionTemplateView[]>('/missions/templates'),
    staleTime: Infinity,
  });
export const usePending = () =>
  useQuery({
    queryKey: keys.parent.pending,
    queryFn: () => http.get<PendingCompletionView[]>('/missions/pending'),
  });
export const useChildDetail = (id: string) =>
  useQuery({
    queryKey: keys.parent.child(id),
    queryFn: () => http.get<ChildDetail>(`/parent/children/${id}`),
  });
export const useGiftable = () =>
  useQuery({
    queryKey: keys.parent.giftable,
    queryFn: () => http.get<ItemView[]>('/rewards/giftable-items'),
    staleTime: Infinity,
  });
export const useFamilySettings = () =>
  useQuery({ queryKey: keys.parent.settings, queryFn: () => http.get<FamilySettings>('/family') });
export const useParentVillage = () =>
  useQuery({
    queryKey: keys.parent.village,
    queryFn: () => http.get<VillageView>('/parent/village'),
  });
