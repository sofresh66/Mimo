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

## Orchestration Mimo — économie de quota

Claude principal comprend la demande, implémente les tâches courantes, intègre et valide le résultat.
Les cinq agents sont disponibles à la demande ; ne pas lancer toute l'équipe pour chaque fonctionnalité.

### Contexte et invariants

- Lire `AGENTS.md` s'il existe, sinon `agent.md`, et seulement les documents pertinents existants dans `docs/`.
  Ne pas relire les instructions déjà disponibles dans le contexte ni supposer qu'un document absent existe.
- Stack : `apps/web` Next.js/React/TypeScript/Tailwind/PWA (`motion`), `apps/api` NestJS/Prisma/PostgreSQL/
  Redis/BullMQ/Socket.IO, `apps/engine` Python/FastAPI ; packages partagés `ui`, `types`, `game-data`, `config`.
- L'API reste l'autorité sur XP, niveaux, missions, récompenses, inventaire, exploration et évolutions.
  Le frontend et le compagnon intelligent ne peuvent ni valider une action ni attribuer seuls un gain.
- Séparer compte parent et profil enfant ; un PIN enfant ne donne pas les droits parent.
  Autoriser les ressources et événements Socket.IO côté serveur, avec isolation entre familles.
- Protéger transactions et gains contre concurrence, retries/replays HTTP, Socket.IO et BullMQ.
- Aucune mort ou maladie punitive, culpabilisation, classement entre frères et sœurs, loot box payante
  ou rétention manipulatrice. Aucun profil enfant public, contact avec inconnus, tracking publicitaire
  ou géolocalisation précise. Compagnon adapté à l'âge ; contenus externes/générés non fiables.
- TypeScript strict, composants réutilisables, contrats dans `packages/types`, règles dans `packages/game-data`.
- Préserver données et changements utiles. Ne pas exposer de secrets ; variables nouvelles dans `.env.example`
  avec valeurs factices. Pas de `bypassPermissions`, reset de base ou migration destructive sans autorisation explicite.

### Délégation sélective

- `architect` : lecture seule, `permissionMode: plan`, pour une décision d'architecture réellement incertaine
  ou un changement structurel risqué. Claude principal planifie lui-même les modifications dont le chemin est clair.
- `frontend-game-ui` : sous-tâche spécialisée dans `apps/web`/`packages/ui`.
- `backend-api` : sous-tâche spécialisée dans `apps/api`, base, jobs ou temps réel.
- `game-systems` : nouvelles règles ou équilibrage complexes, catalogues et moteur de jeu.
- `qa-security` : revue indépendante obligatoire pour changements sensibles : authentification/permissions,
  isolation familiale, données privées enfants, attribution persistante de récompenses, concurrence,
  migrations ou autorisation temps réel. Pour les autres changements, Claude principal vérifie lui-même
  et sollicite QA uniquement si le risque le justifie ou si l'utilisateur le demande.

Les définitions sont dans `.claude/agents/` ; utiliser les noms exacts. Architect et QA ne modifient pas le code.
Éviter un agent supplémentaire si Claude principal peut terminer directement avec le contexte déjà acquis.
Commencer par une seule sous-tâche ciblée ; ne pas paralléliser par défaut pour accélérer artificiellement.
Ne jamais confier les mêmes fichiers à plusieurs agents simultanément ; coordonner backend et systèmes de jeu.
Transmettre à l'agent objectif, fichiers, contrats, contexte utile, critères d'acceptation et checks déjà effectués.
Demander un résultat bref : changements, preuves de validation, constats ou blocages, sans recopier fichiers et logs.

### Travail et vérifications ciblés

- Rechercher d'abord dans le périmètre concerné ; éviter les audits complets, lectures répétées et dépendances inutiles.
- Maintenir les contrats partagés et vérifier leurs consommateurs lorsqu'ils changent.
- Exécuter les checks pertinents pour le changement et l'intégration ; corriger les échecs sans désactiver les tests.
  Les contrôles déjà réussis sur un état inchangé ne sont pas à répéter sans nouveau risque ou échec.
- Scripts racine : `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm format:check`.
  Cibler avec `pnpm --filter @mimo/web <script>`, `@mimo/api`, `@mimo/game-data`, ou lint/test de `@mimo/engine`.
  Les règles de validation communes concernent les packages touchés et leurs dépendances affectées.
- Intégration/E2E pour les parcours importants concernés. Pour une UI significative : 375, 430, 768 et 1440 px,
  accessibilité et animations réduites. Ne pas transformer une retouche de texte en audit complet du produit.
- Après correction d'un défaut, revérifier la zone modifiée et les dépendances affectées ; refaire QA si sensible.
- Ne jamais annoncer un check réussi s'il n'a pas été exécuté ; tests absents et infrastructure manquante
  sont des limites à signaler. Distinguer problèmes préexistants et régressions.
- Poursuivre l'implémentation demandée après le plan ; clôturer seulement avec validations et résultat réel.

### Modèle et effort

Les agents utilisent `model: sonnet` et `effort: medium` pour éviter de reprendre automatiquement Opus
et un effort élevé à chaque délégation. Si Sonnet n'est pas disponible, signaler le problème plutôt que
basculer silencieusement sur un modèle plus coûteux.
Ces fichiers ne changent pas le modèle de Claude principal : après la tâche en cours, utiliser `/model sonnet`
pour le développement habituel et réserver Opus aux difficultés qui le justifient.
Si une difficulté démontrée exige plus de raisonnement, Claude principal augmente l'effort uniquement pour ce besoin.
La consommation dépend aussi du modèle principal et de la longueur de la session ; aucune économie chiffrée n'est garantie.

<!-- MIMO-SUBAGENTS:END -->
