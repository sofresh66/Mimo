-- Relations entre créatures, visites et espace personnalisable : migration purement additive.
-- Aucune table ni colonne supprimée ou renommée. Les profils existants gardent leurs données :
-- décor par défaut (roomBackground NULL), disposition dérivée de l'ancien champ roomDecorations
-- (roomLayout NULL), première interaction générée à la prochaine ouverture (socialTickAt NULL).

-- AlterEnum
ALTER TYPE "ItemCategory" ADD VALUE 'BACKGROUND';

-- AlterEnum
ALTER TYPE "RewardSource" ADD VALUE 'FRIENDSHIP';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "GameEventType" ADD VALUE 'SOCIAL_INTERACTION';
ALTER TYPE "GameEventType" ADD VALUE 'FRIENDSHIP_UP';
ALTER TYPE "GameEventType" ADD VALUE 'BACKGROUND_UNLOCKED';
ALTER TYPE "GameEventType" ADD VALUE 'ROOM_DECORATED';

-- AlterTable
ALTER TABLE "ChildProfile" ADD COLUMN     "roomBackground" TEXT,
ADD COLUMN     "roomLayout" JSONB,
ADD COLUMN     "socialSeenAt" TIMESTAMP(3),
ADD COLUMN     "socialTickAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ItemDefinition" ADD COLUMN     "decor" JSONB,
ADD COLUMN     "scene" JSONB,
ADD COLUMN     "unique" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "FamilyMission" ADD COLUMN     "rewardItemId" TEXT;

-- CreateTable
CREATE TABLE "CreatureRelation" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "creatureAId" TEXT NOT NULL,
    "creatureBId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "bestLevel" INTEGER NOT NULL DEFAULT 0,
    "interactions" INTEGER NOT NULL DEFAULT 0,
    "needsReconcile" BOOLEAN NOT NULL DEFAULT false,
    "lastSquabbleAt" TIMESTAMP(3),
    "lastInteractionAt" TIMESTAMP(3),
    "playDay" TEXT,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatureRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatureVisit" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "hostProfileId" TEXT NOT NULL,
    "visitorCreatureId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "itemId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreatureVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreatureRelation_familyId_idx" ON "CreatureRelation"("familyId");

-- CreateIndex
CREATE INDEX "CreatureRelation_creatureBId_idx" ON "CreatureRelation"("creatureBId");

-- CreateIndex
CREATE UNIQUE INDEX "CreatureRelation_creatureAId_creatureBId_key" ON "CreatureRelation"("creatureAId", "creatureBId");

-- CreateIndex
CREATE INDEX "CreatureVisit_hostProfileId_endsAt_idx" ON "CreatureVisit"("hostProfileId", "endsAt");

-- CreateIndex
CREATE INDEX "CreatureVisit_endsAt_idx" ON "CreatureVisit"("endsAt");

-- AddForeignKey
ALTER TABLE "CreatureRelation" ADD CONSTRAINT "CreatureRelation_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatureRelation" ADD CONSTRAINT "CreatureRelation_creatureAId_fkey" FOREIGN KEY ("creatureAId") REFERENCES "Creature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatureRelation" ADD CONSTRAINT "CreatureRelation_creatureBId_fkey" FOREIGN KEY ("creatureBId") REFERENCES "Creature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatureVisit" ADD CONSTRAINT "CreatureVisit_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatureVisit" ADD CONSTRAINT "CreatureVisit_hostProfileId_fkey" FOREIGN KEY ("hostProfileId") REFERENCES "ChildProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatureVisit" ADD CONSTRAINT "CreatureVisit_visitorCreatureId_fkey" FOREIGN KEY ("visitorCreatureId") REFERENCES "Creature"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Invariants garantis par PostgreSQL (non exprimables dans le schéma Prisma).
-- Couple ordonné (ordre des octets, identique à la comparaison JavaScript de l'API) :
-- une seule relation par paire, jamais avec soi-même.
ALTER TABLE "CreatureRelation" ADD CONSTRAINT "CreatureRelation_ordered_pair_check" CHECK ("creatureAId" COLLATE "C" < "creatureBId" COLLATE "C");
-- Points et niveaux dans leurs bornes (0 à 150 points, niveaux 0 à 4).
ALTER TABLE "CreatureRelation" ADD CONSTRAINT "CreatureRelation_bounds_check" CHECK ("points" BETWEEN 0 AND 150 AND "bestLevel" BETWEEN 0 AND 4 AND "interactions" >= 0 AND "playCount" >= 0);
-- Une visite a toujours une durée positive.
ALTER TABLE "CreatureVisit" ADD CONSTRAINT "CreatureVisit_period_check" CHECK ("endsAt" > "startsAt");
