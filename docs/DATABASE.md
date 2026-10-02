# Base de données

PostgreSQL, schéma Prisma : `apps/api/prisma/schema.prisma`. Migrations : `apps/api/prisma/migrations`.

## Familles de tables

### Comptes

| Table              | Contenu                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `User`             | Parent : e-mail, hash Argon2id du mot de passe et du PIN parent, nom affiché aux enfants, compteur d'échecs PIN     |
| `AuthSession`      | Session d'appareil : hash du refresh token, **mode** (DEVICE/PARENT/CHILD), enfant actif, expiration du mode parent |
| `Family`           | Nom, contrôle parental du compagnon                                                                                 |
| `ParentInvitation` | Invitation d'un parent supplémentaire : hash du jeton, expiration, acceptation (usage unique), révocation           |
| `ChildProfile`     | Prénom/pseudo, avatar, couleur, hash du PIN, verrouillage, décorations, dernière connexion                          |

### Définitions de contenu (clé fonctionnelle = `id`, synchronisées depuis `packages/game-data`)

`CreatureSpecies`, `CreatureEvolution` (formes et conditions secrètes), `ItemDefinition`, `Recipe`,
`ExplorationZone`, `MissionTemplate`, `BuildingDefinition`, `FamilyMission`.

### Jeu

| Table                           | Contenu                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `Creature`                      | Espèce, forme, niveau, XP totale et par catégorie, stats, accessoires équipés, naissance/éclosion     |
| `CreaturedexEntry`              | Formes découvertes par la famille (Créaturopédie partagée)                                            |
| `Inventory` / `InventoryItem`   | Pièces et objets (quantité, unicité objet/inventaire)                                                 |
| `RecipeDiscovery`               | Recettes découvertes par enfant                                                                       |
| `Mission` / `MissionCompletion` | Missions de la famille ; réalisations par enfant et **période** (`AAAA-MM-JJ`, semaine ISO ou `once`) |
| `XPEvent`                       | Chaque gain d'XP (source, catégorie) — sert aussi aux plafonds quotidiens                             |
| `Exploration`                   | Départ, échéance, statut, butin tiré, vu/non vu                                                       |
| `Reward`                        | Cadeaux à ouvrir (parent, mission, niveau, mission familiale)                                         |
| `Village` / `VillageBuilding`   | Points de la famille, bâtiments débloqués                                                             |
| `FamilyMissionProgress`         | Progression coopérative par semaine ISO                                                               |
| `GameSession`                   | Parties de mini-jeu : défi **et réponses** stockés côté serveur, score, XP                            |
| `GameEvent`                     | Journal (MISSION_COMPLETED, LEVEL_UP, EVOLUTION, ITEM_FOUND, EXPLORATION_*, RECIPE_DISCOVERED…)       |
| `AuditLog`                      | Journal de sécurité (connexions, échecs PIN, changements de PIN, suppressions)                        |

## Contraintes et index notables

- `MissionCompletion @@unique([missionId, childId, periodKey])` : une réalisation par période.
- `InventoryItem @@unique([inventoryId, itemId])`, `CreaturedexEntry @@id([familyId, formId])`,
  `RecipeDiscovery @@id([childId, recipeId])`, `FamilyMissionProgress @@unique([familyId, familyMissionId, weekKey])`.
- Index : `Exploration(status, endsAt)` (balayage), `XPEvent(childId, source, createdAt)` (plafonds),
  `GameEvent(familyId, createdAt)` / `(childId, createdAt)` (historique), `MissionCompletion(status, createdAt)`.
- Suppression d'un enfant ou d'une famille : **cascade** sur toutes les données de jeu (droit à l'effacement).

## Cycle de vie

```bash
pnpm db:migrate          # développement : crée et applique une migration
pnpm db:deploy           # production : applique les migrations existantes
pnpm db:seed             # contenu + famille de démo (refusé en production)
pnpm --filter @mimo/api db:sync-content   # contenu seul (idempotent, sans suppression)
```

Les tests d'intégration utilisent `TEST_DATABASE_URL` ; ils refusent de tourner si elle pointe vers la base de
développement.
