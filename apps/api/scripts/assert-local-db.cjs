#!/usr/bin/env node
/**
 * Garde-fou en ligne de commande : à placer devant toute commande qui peut réinitialiser
 * ou remplir la base (migrate dev, migrate reset…). Échoue si DATABASE_URL ou DIRECT_URL
 * ne vise pas une base locale.
 * Usage : node scripts/assert-local-db.cjs <nom-de-la-commande>
 */
const { assertLocalDatabase, describeDatabaseHost } = require('@mimo/config');

const operation = process.argv[2] ?? 'commande';
try {
  assertLocalDatabase(operation, {
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
  });
  console.log(`✔ ${operation} : base locale (${describeDatabaseHost(process.env.DATABASE_URL)})`);
} catch (error) {
  console.error(`✖ ${error.message}`);
  process.exit(1);
}
