/** Synchronise le contenu versionné (packages/game-data) vers la base. Idempotent. */
import { PrismaClient } from '@prisma/client';
import { defaultCatalog, validateCatalog } from '@mimo/game-data';
import { syncContent } from '../src/content/content-sync';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const problems = validateCatalog(defaultCatalog);
  if (problems.length) throw new Error(`Catalogue invalide :\n${problems.join('\n')}`);
  await syncContent(prisma, defaultCatalog);
  console.log(`✔ Contenu ${defaultCatalog.version} synchronisé.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
