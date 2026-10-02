-- Adulte joueur (« Mamie ») : migration purement additive.
-- Aucune table supprimée ni renommée : le modèle Prisma PlayerProfile garde la table "ChildProfile" (@@map).
-- Les comptes existants deviennent PARENT, les profils existants CHILD, les invitations existantes PARENT (valeurs par défaut).

-- CreateEnum
CREATE TYPE "FamilyUserRole" AS ENUM ('PARENT', 'ADULT_PLAYER');

-- CreateEnum
CREATE TYPE "PlayerType" AS ENUM ('CHILD', 'ADULT');

-- AlterEnum
ALTER TYPE "SessionMode" ADD VALUE 'PLAYER';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "familyRole" "FamilyUserRole" NOT NULL DEFAULT 'PARENT';

-- AlterTable
ALTER TABLE "ParentInvitation" ADD COLUMN     "role" "FamilyUserRole" NOT NULL DEFAULT 'PARENT';

-- AlterTable
ALTER TABLE "ChildProfile" ADD COLUMN     "type" "PlayerType" NOT NULL DEFAULT 'CHILD',
ADD COLUMN     "userId" TEXT,
ALTER COLUMN "pinHash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ChildProfile_userId_key" ON "ChildProfile"("userId");

-- AddForeignKey
-- RESTRICT : un compte possédant un profil adulte ne peut pas être supprimé tant que ce profil existe
-- (SET NULL violerait l'invariant ci-dessous ; CASCADE effacerait silencieusement les données de jeu).
ALTER TABLE "ChildProfile" ADD CONSTRAINT "ChildProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invariant des profils de jeu (non exprimable dans le schéma Prisma) :
--   CHILD : PIN obligatoire, aucun compte rattaché (sélection par PIN sur l'appareil familial) ;
--   ADULT : compte obligatoire (unique, index ci-dessus), aucun PIN (connexion par mot de passe).
-- Les profils existants (CHILD, avec PIN, userId NULL) le respectent déjà.
ALTER TABLE "ChildProfile" ADD CONSTRAINT "ChildProfile_player_type_check" CHECK (
  ("type" = 'CHILD' AND "pinHash" IS NOT NULL AND "userId" IS NULL)
  OR ("type" = 'ADULT' AND "userId" IS NOT NULL AND "pinHash" IS NULL)
);
