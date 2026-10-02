-- CreateEnum
CREATE TYPE "XpCategory" AS ENUM ('LOGIC', 'CREATIVITY', 'READING', 'ADVENTURE', 'HELPING', 'SPORT');

-- CreateEnum
CREATE TYPE "EvolutionStage" AS ENUM ('EGG', 'BABY', 'YOUNG', 'ADULT', 'SPECIAL');

-- CreateEnum
CREATE TYPE "Rarity" AS ENUM ('COMMON', 'RARE', 'EPIC', 'LEGENDARY');

-- CreateEnum
CREATE TYPE "ItemCategory" AS ENUM ('FOOD', 'ACCESSORY', 'OBJECT', 'MATERIAL', 'DECORATION', 'SPECIAL', 'CHEST');

-- CreateEnum
CREATE TYPE "AccessorySlot" AS ENUM ('HEAD', 'FACE', 'NECK', 'BACK');

-- CreateEnum
CREATE TYPE "SessionMode" AS ENUM ('DEVICE', 'PARENT', 'CHILD');

-- CreateEnum
CREATE TYPE "MissionRecurrence" AS ENUM ('ONCE', 'DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "MissionCompletionStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- CreateEnum
CREATE TYPE "XpSource" AS ENUM ('MISSION', 'MINIGAME', 'EXPLORATION', 'REWARD', 'FOOD', 'PLAY', 'FAMILY_MISSION');

-- CreateEnum
CREATE TYPE "ExplorationStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "RewardType" AS ENUM ('XP', 'COINS', 'ITEM');

-- CreateEnum
CREATE TYPE "RewardStatus" AS ENUM ('PENDING', 'CLAIMED');

-- CreateEnum
CREATE TYPE "RewardSource" AS ENUM ('PARENT', 'MISSION', 'FAMILY_MISSION', 'LEVEL_UP');

-- CreateEnum
CREATE TYPE "GameSessionStatus" AS ENUM ('STARTED', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "FamilyGoalType" AS ENUM ('MISSIONS_COMPLETED', 'EXPLORATIONS_COMPLETED', 'GAMES_PLAYED', 'CREATURES_FED');

-- CreateEnum
CREATE TYPE "GameEventType" AS ENUM ('CREATURE_ADOPTED', 'CREATURE_HATCHED', 'MISSION_REQUESTED', 'MISSION_COMPLETED', 'XP_GAINED', 'LEVEL_UP', 'EVOLUTION', 'ITEM_FOUND', 'ITEM_BOUGHT', 'CREATURE_FED', 'CREATURE_PLAYED', 'RECIPE_DISCOVERED', 'CHEST_OPENED', 'REWARD_RECEIVED', 'EXPLORATION_STARTED', 'EXPLORATION_COMPLETED', 'GAME_PLAYED', 'MATERIAL_DONATED', 'BUILDING_UNLOCKED', 'FAMILY_MISSION_COMPLETED', 'COMPANION_USED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "familyId" TEXT,
    "parentPinHash" TEXT,
    "parentPinFailedAttempts" INTEGER NOT NULL DEFAULT 0,
    "parentPinLockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "mode" "SessionMode" NOT NULL DEFAULT 'DEVICE',
    "childId" TEXT,
    "parentModeExpiresAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Family" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "companionAllowedActions" TEXT[] DEFAULT ARRAY['story', 'riddle', 'math', 'fact', 'joke']::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Family_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChildProfile" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatar" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "pinFailedAttempts" INTEGER NOT NULL DEFAULT 0,
    "pinLockedUntil" TIMESTAMP(3),
    "roomDecorations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChildProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatureSpecies" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB NOT NULL,
    "emoji" TEXT NOT NULL,
    "affinity" "XpCategory" NOT NULL,
    "palette" JSONB NOT NULL,
    "starter" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatureSpecies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatureEvolution" (
    "id" TEXT NOT NULL,
    "speciesId" TEXT NOT NULL,
    "stage" "EvolutionStage" NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB NOT NULL,
    "hint" JSONB NOT NULL,
    "palette" JSONB NOT NULL,
    "feature" TEXT NOT NULL,
    "aura" TEXT,
    "conditions" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatureEvolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDefinition" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB NOT NULL,
    "category" "ItemCategory" NOT NULL,
    "rarity" "Rarity" NOT NULL,
    "emoji" TEXT NOT NULL,
    "price" INTEGER,
    "effect" JSONB,
    "slot" "AccessorySlot",
    "loot" JSONB,
    "hatchesSpeciesId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "ingredients" TEXT[],
    "resultItemId" TEXT NOT NULL,
    "hint" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExplorationZone" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB NOT NULL,
    "emoji" TEXT NOT NULL,
    "colors" TEXT[],
    "durationMinutes" INTEGER NOT NULL,
    "minLevel" INTEGER NOT NULL,
    "energyCost" INTEGER NOT NULL,
    "xpCategory" "XpCategory" NOT NULL,
    "xpAmount" INTEGER NOT NULL,
    "loot" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExplorationZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionTemplate" (
    "id" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "description" JSONB NOT NULL,
    "category" "XpCategory" NOT NULL,
    "xp" INTEGER NOT NULL,
    "coins" INTEGER NOT NULL,
    "icon" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MissionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildingDefinition" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB NOT NULL,
    "emoji" TEXT NOT NULL,
    "requiredPoints" INTEGER NOT NULL,
    "positionX" INTEGER NOT NULL,
    "positionY" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuildingDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyMission" (
    "id" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "description" JSONB NOT NULL,
    "goalType" "FamilyGoalType" NOT NULL,
    "target" INTEGER NOT NULL,
    "rewardPoints" INTEGER NOT NULL,
    "icon" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Creature" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "speciesId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "level" INTEGER NOT NULL DEFAULT 1,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "xpLogic" INTEGER NOT NULL DEFAULT 0,
    "xpCreativity" INTEGER NOT NULL DEFAULT 0,
    "xpReading" INTEGER NOT NULL DEFAULT 0,
    "xpAdventure" INTEGER NOT NULL DEFAULT 0,
    "xpHelping" INTEGER NOT NULL DEFAULT 0,
    "xpSport" INTEGER NOT NULL DEFAULT 0,
    "happiness" INTEGER NOT NULL DEFAULT 70,
    "energy" INTEGER NOT NULL DEFAULT 100,
    "curiosity" INTEGER NOT NULL DEFAULT 50,
    "statsUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "headItemId" TEXT,
    "faceItemId" TEXT,
    "neckItemId" TEXT,
    "backItemId" TEXT,
    "bornAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hatchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Creature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreaturedexEntry" (
    "familyId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "discoveredByChildId" TEXT,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreaturedexEntry_pkey" PRIMARY KEY ("familyId","formId")
);

-- CreateTable
CREATE TABLE "Inventory" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeDiscovery" (
    "childId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeDiscovery_pkey" PRIMARY KEY ("childId","recipeId")
);

-- CreateTable
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "createdById" TEXT,
    "templateId" TEXT,
    "assignedChildId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "XpCategory" NOT NULL,
    "icon" TEXT NOT NULL,
    "xp" INTEGER NOT NULL,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "rewardItemId" TEXT,
    "recurrence" "MissionRecurrence" NOT NULL DEFAULT 'DAILY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionCompletion" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "status" "MissionCompletionStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "coinsAwarded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MissionCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XPEvent" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "creatureId" TEXT,
    "amount" INTEGER NOT NULL,
    "category" "XpCategory" NOT NULL,
    "source" "XpSource" NOT NULL,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XPEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exploration" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "creatureId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "status" "ExplorationStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "seenAt" TIMESTAMP(3),
    "rewards" JSONB,

    CONSTRAINT "Exploration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reward" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "type" "RewardType" NOT NULL,
    "source" "RewardSource" NOT NULL,
    "itemId" TEXT,
    "amount" INTEGER NOT NULL DEFAULT 1,
    "message" TEXT,
    "status" "RewardStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Village" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Village_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VillageBuilding" (
    "id" TEXT NOT NULL,
    "villageId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VillageBuilding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyMissionProgress" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "familyMissionId" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyMissionProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSession" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "gameKey" TEXT NOT NULL,
    "status" "GameSessionStatus" NOT NULL DEFAULT 'STARTED',
    "challenge" JSONB NOT NULL,
    "score" INTEGER,
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "GameSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameEvent" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "childId" TEXT,
    "type" "GameEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "familyId" TEXT,
    "userId" TEXT,
    "childId" TEXT,
    "action" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_familyId_idx" ON "User"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_refreshTokenHash_key" ON "AuthSession"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- CreateIndex
CREATE INDEX "ChildProfile_familyId_idx" ON "ChildProfile"("familyId");

-- CreateIndex
CREATE INDEX "CreatureEvolution_speciesId_stage_idx" ON "CreatureEvolution"("speciesId", "stage");

-- CreateIndex
CREATE INDEX "ItemDefinition_category_idx" ON "ItemDefinition"("category");

-- CreateIndex
CREATE INDEX "Creature_childId_isActive_idx" ON "Creature"("childId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_childId_key" ON "Inventory"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_inventoryId_itemId_key" ON "InventoryItem"("inventoryId", "itemId");

-- CreateIndex
CREATE INDEX "Mission_familyId_isActive_idx" ON "Mission"("familyId", "isActive");

-- CreateIndex
CREATE INDEX "MissionCompletion_childId_status_idx" ON "MissionCompletion"("childId", "status");

-- CreateIndex
CREATE INDEX "MissionCompletion_status_createdAt_idx" ON "MissionCompletion"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MissionCompletion_missionId_childId_periodKey_key" ON "MissionCompletion"("missionId", "childId", "periodKey");

-- CreateIndex
CREATE INDEX "XPEvent_childId_createdAt_idx" ON "XPEvent"("childId", "createdAt");

-- CreateIndex
CREATE INDEX "XPEvent_childId_source_createdAt_idx" ON "XPEvent"("childId", "source", "createdAt");

-- CreateIndex
CREATE INDEX "Exploration_status_endsAt_idx" ON "Exploration"("status", "endsAt");

-- CreateIndex
CREATE INDEX "Exploration_childId_status_idx" ON "Exploration"("childId", "status");

-- CreateIndex
CREATE INDEX "Reward_childId_status_idx" ON "Reward"("childId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Village_familyId_key" ON "Village"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "VillageBuilding_villageId_buildingId_key" ON "VillageBuilding"("villageId", "buildingId");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyMissionProgress_familyId_familyMissionId_weekKey_key" ON "FamilyMissionProgress"("familyId", "familyMissionId", "weekKey");

-- CreateIndex
CREATE INDEX "GameSession_childId_gameKey_startedAt_idx" ON "GameSession"("childId", "gameKey", "startedAt");

-- CreateIndex
CREATE INDEX "GameEvent_childId_createdAt_idx" ON "GameEvent"("childId", "createdAt");

-- CreateIndex
CREATE INDEX "GameEvent_familyId_createdAt_idx" ON "GameEvent"("familyId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_familyId_createdAt_idx" ON "AuditLog"("familyId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildProfile" ADD CONSTRAINT "ChildProfile_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatureEvolution" ADD CONSTRAINT "CreatureEvolution_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "CreatureSpecies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDefinition" ADD CONSTRAINT "ItemDefinition_hatchesSpeciesId_fkey" FOREIGN KEY ("hatchesSpeciesId") REFERENCES "CreatureSpecies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_resultItemId_fkey" FOREIGN KEY ("resultItemId") REFERENCES "ItemDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creature" ADD CONSTRAINT "Creature_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creature" ADD CONSTRAINT "Creature_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "CreatureSpecies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creature" ADD CONSTRAINT "Creature_formId_fkey" FOREIGN KEY ("formId") REFERENCES "CreatureEvolution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creature" ADD CONSTRAINT "Creature_headItemId_fkey" FOREIGN KEY ("headItemId") REFERENCES "ItemDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creature" ADD CONSTRAINT "Creature_faceItemId_fkey" FOREIGN KEY ("faceItemId") REFERENCES "ItemDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creature" ADD CONSTRAINT "Creature_neckItemId_fkey" FOREIGN KEY ("neckItemId") REFERENCES "ItemDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creature" ADD CONSTRAINT "Creature_backItemId_fkey" FOREIGN KEY ("backItemId") REFERENCES "ItemDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreaturedexEntry" ADD CONSTRAINT "CreaturedexEntry_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreaturedexEntry" ADD CONSTRAINT "CreaturedexEntry_formId_fkey" FOREIGN KEY ("formId") REFERENCES "CreatureEvolution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreaturedexEntry" ADD CONSTRAINT "CreaturedexEntry_discoveredByChildId_fkey" FOREIGN KEY ("discoveredByChildId") REFERENCES "ChildProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ItemDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeDiscovery" ADD CONSTRAINT "RecipeDiscovery_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeDiscovery" ADD CONSTRAINT "RecipeDiscovery_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MissionTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_assignedChildId_fkey" FOREIGN KEY ("assignedChildId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_rewardItemId_fkey" FOREIGN KEY ("rewardItemId") REFERENCES "ItemDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionCompletion" ADD CONSTRAINT "MissionCompletion_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionCompletion" ADD CONSTRAINT "MissionCompletion_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionCompletion" ADD CONSTRAINT "MissionCompletion_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XPEvent" ADD CONSTRAINT "XPEvent_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XPEvent" ADD CONSTRAINT "XPEvent_creatureId_fkey" FOREIGN KEY ("creatureId") REFERENCES "Creature"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exploration" ADD CONSTRAINT "Exploration_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exploration" ADD CONSTRAINT "Exploration_creatureId_fkey" FOREIGN KEY ("creatureId") REFERENCES "Creature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exploration" ADD CONSTRAINT "Exploration_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "ExplorationZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ItemDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Village" ADD CONSTRAINT "Village_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VillageBuilding" ADD CONSTRAINT "VillageBuilding_villageId_fkey" FOREIGN KEY ("villageId") REFERENCES "Village"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VillageBuilding" ADD CONSTRAINT "VillageBuilding_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "BuildingDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyMissionProgress" ADD CONSTRAINT "FamilyMissionProgress_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyMissionProgress" ADD CONSTRAINT "FamilyMissionProgress_familyMissionId_fkey" FOREIGN KEY ("familyMissionId") REFERENCES "FamilyMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_childId_fkey" FOREIGN KEY ("childId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
