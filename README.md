# Mimo

**Mimo** est un Tamagotchi familial bienveillant : chaque enfant élève un compagnon virtuel qui grandit, explore,
cuisine et évolue grâce aux activités du jeu et aux petites missions du quotidien validées par les parents.

- Le compagnon **ne meurt jamais**, ne tombe jamais malade et ne culpabilise jamais l'enfant.
- **Aucune publicité, aucun traceur, aucun profil public, aucune messagerie, aucun classement.**
- Les enfants n'ont **pas de compte e-mail** : un prénom ou pseudo, un avatar et un code PIN suffisent.
- Application **installable** (PWA) sur téléphone, tablette et ordinateur.

> Nom provisoire : le branding est centralisé dans `packages/config/src/brand.ts` (et `NEXT_PUBLIC_APP_NAME`).

---

## Sommaire

1. [Démarrage rapide](#démarrage-rapide)
2. [Comptes de démonstration](#comptes-de-démonstration)
3. [Architecture](#architecture)
4. [Commandes](#commandes)
5. [Configuration](#configuration-variables-denvironnement)
6. [Base de données](#base-de-données)
7. [Tests](#tests)
8. [Docker et déploiement](#docker-et-déploiement)
9. [Fonctionnalités](#fonctionnalités-implémentées)
10. [Limites connues et améliorations possibles](#limites-connues-et-améliorations-possibles)

Documentation détaillée : [ARCHITECTURE](docs/ARCHITECTURE.md) · [DATABASE](docs/DATABASE.md) ·
[GAME_DESIGN](docs/GAME_DESIGN.md) · [SECURITY](docs/SECURITY.md) · [DEPLOYMENT](docs/DEPLOYMENT.md)

---

## Démarrage rapide

Prérequis : **Node.js ≥ 20.11**, **pnpm 10**, et soit **Docker**, soit rien de plus (PostgreSQL embarqué).
Python 3.11+ est recommandé pour le moteur (facultatif : l'application fonctionne sans).

```bash
pnpm install
pnpm setup              # crée .env avec des secrets aléatoires
docker compose up -d    # PostgreSQL + Redis
pnpm db:migrate         # migrations
pnpm db:seed            # contenu du jeu + famille de démonstration
pnpm dev                # web :3000, API :4000, moteur :8000
```

Ouvrir <http://localhost:3000>.

### Sans Docker

```bash
pnpm infra:local        # PostgreSQL embarqué (laisser tourner dans un terminal)
```

Puis dans `.env`, laisser `REDIS_URL=` **vide** : l'API utilise alors ses implémentations en mémoire
(file de tâches, rate limiting). Pratique en développement, à éviter en production multi-instances.

> Astuce démo : `EXPLORATION_TIME_SCALE=0.05` dans `.env` rend les explorations 20× plus rapides.

---

## Comptes de démonstration

Créés par `pnpm db:seed` — **à ne jamais utiliser en production** (le seed refuse de tourner si `NODE_ENV=production`).

| Rôle   | Identifiant                                | Secret          |
| ------ | ------------------------------------------ | --------------- |
| Parent | `demo@mimo.local`                          | `MimoDemo2026!` |
| Parent | PIN de l'espace parent                     | `1234`          |
| Enfant | 🦊 Haylie (Luna, renard, niveau 8)         | PIN `1111`      |
| Enfant | 🐉 Emilia (Braise, Dragon Sage, niveau 13) | PIN `2222`      |
| Enfant | 🐼 Jude (oeuf de dino, niveau 1)           | PIN `3333`      |

La famille de démo contient des missions, des demandes à valider, un historique, des cadeaux à ouvrir,
des recettes découvertes et un village déjà commencé.

---

## Architecture

```
apps/
  web/        Next.js 16 (App Router), React 19, Tailwind 4, motion, TanStack Query, PWA
  api/        NestJS 11, Prisma 6 / PostgreSQL, Socket.IO, BullMQ / Redis, Argon2, JWT
  engine/     FastAPI (Python) : contenus du compagnon, recommandations (optionnel)
packages/
  game-data/  Définitions versionnées (JSON) + règles pures (niveaux, évolutions, butin…)
  types/      Contrat partagé API ↔ web (réponses REST, événements temps réel)
  ui/         Design system (Button, Card, ProgressBar, Modal, PinPad, Creature SVG…)
  config/     TypeScript, ESLint, branding
infra/
  local/      PostgreSQL embarqué (alternative sans Docker)
  docker/     Scripts d'initialisation
```

- **L'API est la source de vérité** : XP, niveaux, évolutions, inventaire, récompenses, explorations et
  scores des mini-jeux sont calculés côté serveur. Le web n'affiche que des résultats.
- Le web proxifie `/api` et `/socket.io` vers l'API : **même origine**, cookies HttpOnly first-party.
- Temps réel : Socket.IO (salles par enfant / parents / famille), reconnexion automatique.
- Tâches différées : BullMQ si Redis est présent, sinon minuteries en mémoire ; un balayage périodique
  et une complétion « paresseuse » garantissent qu'aucune exploration ne reste bloquée.

Détails : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Commandes

| Commande                                  | Effet                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| `pnpm dev`                                | Lance packages (watch), API, web et moteur                                  |
| `pnpm build`                              | Build de production de tout le monorepo                                     |
| `pnpm start`                              | Démarre l'API et le web compilés                                            |
| `pnpm lint`                               | ESLint (TS) + Ruff (Python)                                                 |
| `pnpm typecheck`                          | TypeScript strict partout                                                   |
| `pnpm test`                               | Tests unitaires et d'intégration (game-data, API, web, moteur)              |
| `pnpm test:e2e`                           | Tests Playwright (nécessite base + `pnpm dev`, lancé automatiquement sinon) |
| `pnpm format`                             | Prettier                                                                    |
| `pnpm db:migrate`                         | Crée/applique les migrations (développement)                                |
| `pnpm db:deploy`                          | Applique les migrations (production)                                        |
| `pnpm db:seed`                            | Contenu du jeu + famille de démo (réinitialise la famille de démo)          |
| `pnpm db:studio`                          | Prisma Studio                                                               |
| `pnpm infra:local`                        | PostgreSQL embarqué sans Docker                                             |
| `pnpm --filter @mimo/api db:sync-content` | Resynchronise le contenu du jeu (JSON → base)                               |
| `pnpm --filter @mimo/web icons`           | Régénère les icônes PWA                                                     |

---

## Configuration (variables d'environnement)

Toutes les variables sont documentées dans [`.env.example`](.env.example). Les principales :

| Variable                             | Rôle                                                       |
| ------------------------------------ | ---------------------------------------------------------- |
| `DATABASE_URL` / `TEST_DATABASE_URL` | PostgreSQL (la base de test est **vidée** par les tests)   |
| `REDIS_URL`                          | Redis (vide = mode mémoire, mono-instance)                 |
| `JWT_ACCESS_SECRET`                  | Secret JWT (≥ 32 caractères, généré par `pnpm setup`)      |
| `COOKIE_SECURE`                      | `true` obligatoire en production (HTTPS)                   |
| `WEB_ORIGIN` / `API_INTERNAL_URL`    | Origine publique du web / URL interne de l'API             |
| `PARENT_MODE_TTL_MINUTES`            | Durée de l'espace parent déverrouillé par PIN              |
| `AUTH_RATE_LIMIT`                    | Essais de connexion / PIN par minute et par IP             |
| `APP_TIMEZONE`                       | Fuseau pour découper missions quotidiennes / hebdomadaires |
| `EXPLORATION_TIME_SCALE`             | Accélère les explorations (démo)                           |
| `ENGINE_URL` / `ENGINE_API_KEY`      | Moteur Python (optionnel)                                  |

---

## Base de données

PostgreSQL + Prisma (`apps/api/prisma/schema.prisma`, migrations dans `apps/api/prisma/migrations`).
Les définitions de contenu (espèces, 50 formes d'évolution, 58 objets, recettes, zones, modèles de missions,
bâtiments, missions familiales) sont **versionnées en JSON** dans `packages/game-data/data` puis synchronisées en base
(idempotent). Voir [docs/DATABASE.md](docs/DATABASE.md).

---

## Tests

| Suite                    | Outil                               | Contenu                                                                                                                                                                                                                                                      |
| ------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/game-data`     | Vitest                              | intégrité du catalogue, niveaux, évolutions/branches, stats bienveillantes, butin, recettes                                                                                                                                                                  |
| `apps/api` (unit)        | Jest                                | périodes de mission, verrouillage PIN, correction des mini-jeux, configuration                                                                                                                                                                               |
| `apps/api` (intégration) | Jest + Supertest + socket.io-client | auth, PIN, permissions parent/enfant, isolation des familles, refresh, missions → XP → éclosion/évolution, cadeaux, exploration (+ idempotence), cuisine, boutique, équipement, mini-jeux (anti-farm), village, compagnon, suppression de profil, temps réel |
| `apps/web`               | Vitest                              | i18n, formatage, historique                                                                                                                                                                                                                                  |
| `apps/engine`            | Pytest                              | contenus déterministes, absence de chat libre, recommandations, clé interne                                                                                                                                                                                  |
| E2E                      | Playwright                          | inscription → famille → enfant → mission → validation ; PIN ; mission validée en temps réel → XP → éclosion ; exploration ; cuisine ; cadeau ; permissions ; absence de défilement horizontal de 375 à 1440 px ; taille des cibles tactiles                  |

Les tests d'intégration utilisent `TEST_DATABASE_URL` (base `mimo_test`, créée automatiquement par Docker
et par `pnpm infra:local`).

---

## Docker et déploiement

- `docker compose up -d` : PostgreSQL 17 + Redis 7 pour le développement.
- `docker compose --profile app up -d --build` : stack complète (web, api, moteur).
- Images : `apps/api/Dockerfile`, `apps/web/Dockerfile` (Next « standalone »), `apps/engine/Dockerfile`.

Procédure complète (HTTPS, secrets, migrations, sauvegardes) : [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Fonctionnalités implémentées

**Comptes et sécurité** — compte parent (e-mail + Argon2id), JWT court en cookie HttpOnly + refresh token
rotatif, famille, profils enfants (prénom/pseudo, avatar, couleur, PIN), écran « Qui joue ? », PIN parent pour
l'appareil familial (expiration), verrouillage après 5 essais, rate limiting, journal d'audit, déconnexion de tous
les appareils, changement de mot de passe/PIN, suppression définitive d'un profil. **Plusieurs parents par
famille** : invitation par lien sécurisé (usage unique, 72 h, révocable), chacun avec son propre compte,
mot de passe et PIN parent.

**Compagnon** — adoption parmi 5 espèces (dragon, renard, dinosaure, robot, esprit mystique), créatures dessinées
en SVG animé, 5 stades (oeuf → bébé → jeune → adulte → évolution spéciale), 50 formes avec branches selon les
activités (ex. Dragon Sage, Explorateur, Artiste…), conditions secrètes, statistiques bonheur/énergie/curiosité qui
reviennent toujours vers un état calme, talents, humeur positive, jouer, accessoires, chambre décorée, oeufs spéciaux
et compagnons multiples.

**Missions** — 15 modèles prédéfinis, missions personnalisées (catégorie, XP, pièces, fréquence, enfant ciblé,
récompense bonus), demande « C'est fait ! » de l'enfant, validation/refus bienveillant ou validation directe par le
parent, XP + pièces + coffre, notification **temps réel** avec animation.

**Récompenses et inventaire** — pièces, objets, nourriture, accessoires, décorations, matériaux, coffres à 4 raretés
avec animation d'ouverture, cadeaux envoyés par les parents (XP, pièces, objets, message), boutique, cuisine avec
10 recettes découvrables, livre de recettes.

**Exploration** — 6 zones déblocables par niveau, durée réelle, coût en énergie, retour avec butin procédural
(tirage déterministe) et XP, file BullMQ / minuteries + balayage de sécurité.

**Monde familial** — village partagé (8 bâtiments), points collectifs, dons de matériaux, 4 missions familiales
hebdomadaires coopératives, aucun classement entre enfants. Créaturopédie familiale « ??? » avec indices.

**Mini-jeux** — mémoire, calcul mental (3 difficultés), suites logiques ; défis générés et corrigés côté serveur,
durée minimale, 5 parties récompensées par jour et par jeu.

**Compagnon « intelligent »** — actions prédéfinies uniquement (histoire, énigme, défi de maths, anecdote, blague),
contrôle parental, limite quotidienne, moteur Python avec repli local.

**Espace parent** — tableau de bord (enfants, niveaux, missions de la semaine, XP, dernière connexion, répartition des
activités), file de validation temps réel, gestion des missions/profils/récompenses, historique filtrable, idées de
missions pour équilibrer les activités, réglages (compagnon, sécurité, langue, sons, confidentialité).

**Expérience** — mobile-first, PWA installable (manifeste, service worker, icônes, page hors-ligne), sons synthétisés
désactivables, animations douces respectant `prefers-reduced-motion`, ARIA et navigation clavier, i18n (français
complet, anglais partiel avec repli).

---

## Limites connues et améliorations possibles

- **Docker non testé sur la machine de développement** (Docker absent) : les fichiers sont fournis mais la stack
  conteneurisée n'a pas été exécutée ici ; le développement a été validé avec PostgreSQL embarqué et Redis désactivé
  (BullMQ et l'adaptateur Socket.IO Redis n'ont donc pas été exercés en conditions réelles).
- Traductions anglaise/espagnole à compléter (architecture i18n prête).
- Passkeys pour les parents ; retrait d'un parent de la famille (non prévu dans cette version).
- Back-office de contenu (les tables de définition et `CatalogService.reload()` sont prêts).
- Notifications push (Web Push) pour les retours d'exploration et validations.
- Illustrations/animations Lottie professionnelles (les créatures SVG sont des placeholders soignés).
- Fournisseur d'IA optionnel derrière `ContentProvider` du moteur, avec modération et contrôle parental.
- Timeline enfant, statistiques parent sur plusieurs semaines, export des données de la famille (RGPD).
