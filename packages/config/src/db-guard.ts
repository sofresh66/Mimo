/**
 * Garde-fou anti-production : les opérations destructives ou de test (seed, reset,
 * migrations de développement, tests d'intégration, E2E) ne doivent JAMAIS viser une
 * base distante. La décision porte sur l'URL PostgreSQL elle-même, pas sur NODE_ENV.
 */

export const LOCAL_DATABASE_HOSTS = ['localhost', '127.0.0.1', '::1'] as const;

export const REMOTE_DATABASE_REFUSAL =
  'REFUS DE SÉCURITÉ : cette commande ne peut pas être exécutée sur une base distante.';

/** Hôte(s) effectivement visés par une URL PostgreSQL (le paramètre `host=` l'emporte). */
function targetHosts(url: URL): string[] {
  const fromQuery = url.searchParams.getAll('host').flatMap((h) => h.split(','));
  const hosts = fromQuery.length > 0 ? fromQuery : [url.hostname];
  return hosts.map((h) =>
    h
      .trim()
      .toLowerCase()
      .replace(/^\[(.*)\]$/, '$1'),
  );
}

/** Vrai uniquement pour une URL postgres(ql):// dont tous les hôtes sont locaux. */
export function isLocalDatabaseUrl(databaseUrl: string | undefined | null): boolean {
  if (!databaseUrl) return false;
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') return false;
  const hosts = targetHosts(url);
  return (
    hosts.length > 0 && hosts.every((h) => (LOCAL_DATABASE_HOSTS as readonly string[]).includes(h))
  );
}

/**
 * Vrai pour une URL redis:// ou rediss:// locale. Les E2E refusent un Redis distant :
 * les workers BullMQ du développement y consommeraient les tâches de production.
 */
export function isLocalRedisUrl(redisUrl: string | undefined | null): boolean {
  if (!redisUrl) return false;
  try {
    const url = new URL(redisUrl);
    if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') return false;
    const host = url.hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1');
    return (LOCAL_DATABASE_HOSTS as readonly string[]).includes(host);
  } catch {
    return false;
  }
}

/** Hôte lisible pour l'affichage (jamais les identifiants). */
export function describeDatabaseHost(databaseUrl: string | undefined | null): string {
  if (!databaseUrl) return '(non définie)';
  try {
    const url = new URL(databaseUrl);
    return `${targetHosts(url).join(',')}${url.port ? `:${url.port}` : ''}${url.pathname}`;
  } catch {
    return '(URL invalide)';
  }
}

/**
 * Arrête immédiatement si l'une des URL fournies n'est pas locale.
 * `urls` : nom de variable → valeur (seules les variables définies sont contrôlées,
 * mais au moins une doit l'être).
 */
export function assertLocalDatabase(
  operation: string,
  urls: Record<string, string | undefined | null>,
): void {
  const defined = Object.entries(urls).filter(([, value]) => value);
  if (defined.length === 0) {
    throw new Error(`${REMOTE_DATABASE_REFUSAL} (${operation} : aucune URL de base fournie)`);
  }
  for (const [name, value] of defined) {
    if (!isLocalDatabaseUrl(value)) {
      throw new Error(
        `${REMOTE_DATABASE_REFUSAL} (${operation} : ${name} vise « ${describeDatabaseHost(value)} »)`,
      );
    }
  }
}
