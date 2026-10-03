-- Courrier familial : migration purement additive. Aucune table ni colonne existante n'est
-- modifiée ou supprimée ; les sauvegardes actuelles restent valides (aucune lettre au départ,
-- chacun dispose du papier par défaut sans écriture en base).

-- AlterEnum
ALTER TYPE "ItemCategory" ADD VALUE 'STATIONERY';

-- CreateTable
CREATE TABLE "Letter" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "senderProfileId" TEXT,
    "senderUserId" TEXT,
    "recipientProfileId" TEXT,
    "recipientUserId" TEXT,
    "senderName" TEXT NOT NULL,
    "senderAvatar" TEXT NOT NULL,
    "senderCreatureName" TEXT,
    "recipientName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "stationeryId" TEXT NOT NULL,
    "requestId" TEXT,
    "readAt" TIMESTAMP(3),
    "cherishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Letter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Letter_recipientProfileId_createdAt_idx" ON "Letter"("recipientProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "Letter_recipientProfileId_readAt_idx" ON "Letter"("recipientProfileId", "readAt");

-- CreateIndex
CREATE INDEX "Letter_recipientProfileId_cherishedAt_idx" ON "Letter"("recipientProfileId", "cherishedAt");

-- CreateIndex
CREATE INDEX "Letter_senderProfileId_createdAt_idx" ON "Letter"("senderProfileId", "createdAt");

-- CreateIndex
CREATE INDEX "Letter_recipientUserId_createdAt_idx" ON "Letter"("recipientUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Letter_senderUserId_createdAt_idx" ON "Letter"("senderUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Letter_familyId_requestId_key" ON "Letter"("familyId", "requestId");

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_senderProfileId_fkey" FOREIGN KEY ("senderProfileId") REFERENCES "ChildProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_recipientProfileId_fkey" FOREIGN KEY ("recipientProfileId") REFERENCES "ChildProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_stationeryId_fkey" FOREIGN KEY ("stationeryId") REFERENCES "ItemDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Invariants (non exprimables en Prisma) :
-- au plus un expéditeur et un destinataire (profil OU compte parent) ; tous deux peuvent
-- devenir NULL après suppression d'un profil (la lettre reste un souvenir pour l'autre membre).
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_parties_check" CHECK (
    num_nonnulls("senderProfileId", "senderUserId") <= 1
    AND num_nonnulls("recipientProfileId", "recipientUserId") <= 1
    AND ("senderProfileId" IS NULL OR "senderProfileId" IS DISTINCT FROM "recipientProfileId")
);
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_users_check" CHECK (
    "senderUserId" IS NULL OR "senderUserId" IS DISTINCT FROM "recipientUserId"
);
-- 500 graphèmes au plus côté API ; borne large en points de code (emojis composés).
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_content_check" CHECK (
    char_length("content") BETWEEN 1 AND 4000 AND char_length("requestId") <= 64
);
