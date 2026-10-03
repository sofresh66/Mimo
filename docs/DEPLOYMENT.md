# Déploiement

## Option A — Docker Compose (un serveur)

1. Serveur Linux avec Docker et un reverse proxy HTTPS (Caddy, Traefik ou Nginx) devant le port 3000.
2. Cloner le dépôt et créer `.env` à la racine :

   ```bash
   cp .env.example .env
   # Remplacer au minimum :
   #   JWT_ACCESS_SECRET=<openssl rand -base64 48>
   #   ENGINE_API_KEY=<openssl rand -base64 24>
   #   POSTGRES_PASSWORD=<mot de passe fort>
   #   WEB_ORIGIN=https://mimo.example.org
   #   COOKIE_SECURE=true
   #   AUTH_RATE_LIMIT=10
   ```

3. Démarrer :

   ```bash
   docker compose --profile app up -d --build
   ```

   Au démarrage, l'API applique les migrations (`prisma migrate deploy`) et synchronise le contenu du jeu.
   **Ne pas lancer `pnpm db:seed` en production** (comptes de démonstration).

4. Exposer **uniquement** le service `web` (port 3000) via HTTPS. L'API, PostgreSQL, Redis et le moteur restent
   sur le réseau interne (dans `docker-compose.yml`, retirer les publications de ports 5432/6379 en production).

## Option B — Services séparés (PaaS)

| Service | Build                                                                 | Démarrage                                                                                                                             |
| ------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| API     | `pnpm install && pnpm --filter @mimo/api... build`                    | `pnpm --filter @mimo/api exec prisma migrate deploy && node apps/api/dist/content/sync-content.main.js && node apps/api/dist/main.js` |
| Web     | `API_INTERNAL_URL=<url interne API> pnpm --filter @mimo/web... build` | `node apps/web/.next/standalone/apps/web/server.js`                                                                                   |
| Moteur  | `pip install -r apps/engine/requirements.txt`                         | `uvicorn app.main:app --host 0.0.0.0 --port 8000`                                                                                     |

PostgreSQL et Redis managés. `API_INTERNAL_URL` est figée au build du web (réécritures Next.js).
Le proxy doit transmettre les WebSockets (`/socket.io`).

**Contenu de jeu** : la synchronisation (`dist/content/sync-content.main.js`, compilée avec l'API ;
upserts idempotents, aucune suppression) doit s'exécuter à chaque démarrage, après la migration. Sans lui, les nouveaux objets (décors,
décorations) n'existent pas en base : l'accueil reste fonctionnel (décor de secours) mais
les nouveaux décors et récompenses ne peuvent pas être attribués.

## Mise à jour

```bash
git pull
docker compose --profile app up -d --build   # migrations appliquées automatiquement
```

Les migrations Prisma sont additives ; vérifier leur contenu avant tout déploiement.

## Exploitation

- Santé : `GET /api/health` (base + type de file de tâches).
- Sauvegardes : `pg_dump` quotidien du volume PostgreSQL, rétention selon votre politique.
- Logs : sortie standard des conteneurs (aucune stack trace n'est renvoyée aux clients).
- Plusieurs instances d'API : Redis obligatoire (BullMQ, rate limiting partagé, adaptateur Socket.IO).
