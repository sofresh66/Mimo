/**
 * Synchronise le contenu versionné (packages/game-data) vers les tables de définition.
 * Compilé avec l'API (`dist/content/sync-content.main.js`) pour être lancé par `node` au
 * démarrage en production, entre `prisma migrate deploy` et le démarrage de l'API.
 * Idempotent : upserts uniquement, aucune suppression, aucune donnée de joueur touchée.
 */
import { PrismaClient } from '@prisma/client';
import { defaultCatalog, validateCatalog } from '@mimo/game-data';
import { syncContent } from './content-sync';

export async function runContentSync(prisma: PrismaClient): Promise<string> {
  const problems = validateCatalog(defaultCatalog);
  if (problems.length) throw new Error(`Catalogue invalide :\n${problems.join('\n')}`);
  await syncContent(prisma, defaultCatalog);
  const items = defaultCatalog.items;
  const backgrounds = items.filter((i) => i.category === 'BACKGROUND').length;
  const placeables = items.filter((i) => i.decor).length;
  return (
    `✔ Contenu ${defaultCatalog.version} synchronisé : ${items.length} objets ` +
    `(${backgrounds} décors, ${placeables} objets plaçables), ` +
    `${defaultCatalog.zones.length} zones, ${defaultCatalog.familyMissions.length} missions familiales.`
  );
}

if (require.main === module) {
  const prisma = new PrismaClient();
  runContentSync(prisma)
    .then((summary) => process.stdout.write(`${summary}\n`))
    .catch((error: unknown) => {
      console.error('✘ Synchronisation du contenu échouée :', error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
