# Mimo

Read and follow `AGENTS.md` if present; otherwise read `agent.md`.

Also read these documents when relevant:

- `docs/ARCHITECTURE.md`
- `docs/GAME_DESIGN.md`
- `docs/SECURITY.md`

Do not stop after producing a plan.
Implement, run, test and fix the requested work.

Keep child safety, parent/child authorization boundaries and mobile-first UX as hard requirements.

<!-- MIMO-SUBAGENTS:BEGIN -->

## Claude principal : orchestration des agents Mimo

Mimo est un Tamagotchi familial intelligent pour enfants et parents, fondé sur le renforcement positif.
La session Claude principale est l'orchestrateur : elle comprend la demande, définit les critères d'acceptation,
délègue les sous-tâches, intègre les changements et vérifie le résultat final. Ne pas créer un sixième agent chef de projet.

### Contexte du dépôt

- Lire `AGENTS.md` lorsqu'il existe ; à défaut, lire le fichier existant `agent.md`.
- Consulter les documents pertinents réellement présents dans `docs/`. Le dossier peut être vide :
  ne pas prétendre avoir lu `ARCHITECTURE.md`, `GAME_DESIGN.md` ou `SECURITY.md` s'ils n'existent pas.
- Inspecter les scripts et le code avant de choisir les commandes ou une architecture.
- `apps/web` : Next.js/React/TypeScript/Tailwind/PWA ; animations via `motion` déjà installé.
- `apps/api` : NestJS, Prisma/PostgreSQL, Redis, BullMQ, Socket.IO et autorité sur l'état du jeu.
- `apps/engine` : Python/FastAPI, compagnon intelligent et recommandations, intégré via l'API.
- `packages/ui`, `packages/types`, `packages/game-data`, `packages/config` : composants, contrats,
  catalogues/règles pures et configuration partagés ; monorepo pnpm/Turbo.

### Quand déléguer

| Agent              | Périmètre et déclencheur                                                                                                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `architect`        | Avant une fonctionnalité majeure, un changement d'authentification, de schéma/contrat API ou impliquant plusieurs applications. Lecture seule, `permissionMode: plan` ; pas nécessaire pour une correction triviale. |
| `frontend-game-ui` | Implémentation dans `apps/web` et `packages/ui` : UX enfant/parent, Next.js, React, Tailwind, PWA, responsive, animations, accessibilité et présentation des mini-jeux.                                              |
| `backend-api`      | Implémentation dans `apps/api` : authentification, autorisations, Prisma, migrations, état du jeu, transactions, Redis, BullMQ et Socket.IO.                                                                         |
| `game-systems`     | XP, niveaux, créatures, évolutions, récompenses, inventaires, recettes, exploration, missions familiales, village et équilibrage ; `packages/game-data`, moteur FastAPI et services de jeu attribués.                |
| `qa-security`      | Revue indépendante après toute fonctionnalité significative et avant clôture de tout changement sensible. Inspecte et teste ; ne modifie pas l'implémentation.                                                       |

Ces agents sont définis dans `.claude/agents/`. Utiliser leurs noms exacts.
Les rôles de lecture seule de `architect` et de revue de `qa-security` priment sur la consigne générale
« implémenter, tester et corriger » dans leurs missions ; Claude principal fait appliquer les correctifs.

### Coordination et intégration

1. Définir l'objectif, le périmètre et les critères d'acceptation à partir de la demande utilisateur.
2. Faire établir un plan par `architect` si le changement le justifie, puis poursuivre l'implémentation demandée.
3. Donner à chaque agent les contraintes, contrats, fichiers attribués, dépendances et checks attendus.
   Ne pas supposer qu'il connaît l'historique de la conversation principale.
4. Paralléliser seulement les tâches indépendantes. Ne jamais faire modifier les mêmes fichiers simultanément.
   Le backend et les systèmes de jeu partagent parfois des services : désigner un propriétaire ou séquencer le travail.
5. Faire remonter les changements de contrat vers `packages/types` et tous les consommateurs concernés.
6. Intégrer les résultats, exécuter les checks communs puis demander la revue de `qa-security`.
7. Faire corriger les constats utiles par les agents d'implémentation, relancer les checks concernés et la revue ciblée.
8. Donner le résultat final avec validations réelles, limitations et éventuels blocages restant à résoudre.

Exemple : pour une mission validée par le parent avec XP en temps réel, `architect` définit le flux,
`game-systems` précise la règle si elle change, `backend-api` implémente validation/transaction/événement,
`frontend-game-ui` implémente les écrans et retours visuels, puis `qa-security` vérifie permissions,
isolation familiale et absence de double gain. Claude principal intègre et clôture.

### Invariants produit et sécurité

- L'API est la source de vérité pour XP, récompenses, niveaux, inventaire, exploration, missions et évolutions.
  Les règles partagées et le frontend servent à afficher/prévoir ; le serveur valide les changements effectifs.
- Compte parent et profil enfant restent distincts. Un PIN enfant ne donne pas accès aux actions parent.
- Vérifier l'isolation des familles côté serveur, y compris les rooms et événements Socket.IO.
- Les gains et jobs doivent résister aux retries, replays et accès concurrents.
- Aucun profil enfant public, contact avec des inconnus, tracking publicitaire ou géolocalisation précise.
- La créature ne meurt jamais ; aucune maladie punitive, culpabilisation, compétition entre frères et sœurs,
  loot box payante ou rétention manipulatrice.
- Le compagnon intelligent respecte l'âge et le cadre familial. Les sorties générées/externes sont non fiables
  et ne peuvent ni autoriser une action ni attribuer une récompense seules.
- TypeScript strict, composants réutilisables, contrats partagés et configuration du jeu hors des composants UI.
- Préserver le contenu utile et les données existantes ; ne pas annuler les changements de l'utilisateur.
- Ne pas exposer de secrets. Documenter les variables nouvelles dans `.env.example` avec des valeurs factices.
- Ne pas élargir les permissions globales ni utiliser `bypassPermissions` pour faciliter une tâche.
- Ne pas réinitialiser la base, exécuter une migration destructive ou supprimer des données sans autorisation explicite.

### Validation avant clôture

Le code écrit seul ne constitue pas une fonctionnalité terminée.
Les scripts disponibles à la racine sont :

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm format:check
```

Choisir les checks pertinents et proportionnés au changement en examinant les `package.json`.
Pour cibler : `pnpm --filter @mimo/web <script>`, `pnpm --filter @mimo/api <script>`,
`pnpm --filter @mimo/game-data <script>`, ou les scripts lint/test de `@mimo/engine`.
Vérifier aussi les packages partagés modifiés et leurs consommateurs.
Les tests d'intégration et E2E des parcours importants sont requis lorsque le comportement concerné le justifie.
Pour une interface significative, inspecter le rendu à 375, 430, 768 et 1440 px et avec animations réduites.

Corriger les échecs dans le périmètre ; ne pas désactiver les tests ou protections pour obtenir un succès.
Un script déclaré sans tests disponibles ne prouve pas que le comportement a été vérifié.
Si une dépendance, un outil ou une infrastructure manque, signaler précisément le check non exécuté et sa cause.
Ne jamais annoncer un check réussi sans l'avoir exécuté. Distinguer les problèmes préexistants des régressions.
Toute modification sensible doit recevoir une revue indépendante avant d'être considérée terminée.
Ne pas s'arrêter au plan lorsque l'utilisateur demande une implémentation.

<!-- MIMO-SUBAGENTS:END -->
