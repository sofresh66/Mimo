import type { BuildingDefinition, Rarity } from '../types';

/** Points de village gagnés par la famille pour chaque type d'activité. */
export const VILLAGE_POINTS = {
  missionCompleted: 10,
  explorationCompleted: 5,
  gamePlayed: 2,
  creatureFed: 1,
} as const;

/** Points rapportés par le don d'un matériau au village, selon sa rareté. */
export const MATERIAL_DONATION_POINTS: Record<Rarity, number> = {
  COMMON: 2,
  RARE: 5,
  EPIC: 12,
  LEGENDARY: 30,
};

export function unlockedBuildings(
  buildings: readonly BuildingDefinition[],
  points: number,
): BuildingDefinition[] {
  return buildings.filter((b) => b.requiredPoints <= points);
}

export function nextBuilding(
  buildings: readonly BuildingDefinition[],
  points: number,
): BuildingDefinition | null {
  return (
    [...buildings]
      .sort((a, b) => a.requiredPoints - b.requiredPoints)
      .find((b) => b.requiredPoints > points) ?? null
  );
}
