# Architecture

## Vue d'ensemble

```
Navigateur / PWA ──HTTPS──▶ Web (Next.js)  ──/api, /socket.io (proxy même origine)──▶ API (NestJS)
                                                                                     │   │   │
                                                       PostgreSQL (Prisma) ◀─────────┘   │   └──▶ Moteur (FastAPI, optionnel)
                                                       Redis (BullMQ, rate limit, ◀──────┘
                                                              adaptateur Socket.IO)
```

| Composant            | Rôle                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `apps/web`           | Interface enfant (ludique) et parent (sobre), PWA. Aucune règle de jeu : affiche ce que renvoie l'API.                  |
| `apps/api`           | Source de vérité : authentification, autorisations, progression, inventaire, jobs, temps réel.                          |
| `apps/engine`        | Service interne : contenus du compagnon, recommandations. Optionnel (repli local dans l'API).                           |
| `packages/game-data` | Données de jeu versionnées (JSON) + règles **pures** et testées (niveaux, évolutions, butin, stats, recettes, village). |
| `packages/types`     | Contrat partagé : formes des réponses REST et des événements Socket.IO.                                                 |
| `packages/ui`        | Design system React (Tailwind) dont le rendu SVG des créatures.                                                         |
| `packages/config`    | tsconfig, ESLint, branding.                                                                                             |

## API (NestJS)

Organisation par domaine : `auth`, `family`, `creatures`, `inventory`, `missions`, `rewards`, `explorations`,
`minigames`, `companion`, `dashboard`, `village`, `progression`, `events`, `realtime`, `jobs`, `content`, `audit`.
Chaque domaine expose controllers (HTTP + DTO `class-validator`), services, et s'appuie sur Prisma.

Points clés :

- **Garde global** (`auth/auth.guard.ts`) : JWT d'accès (cookie HttpOnly) → vérification de la session en base →
  contrôle du **mode** (`DEVICE`, `PARENT`, `CHILD`). Sans décorateur, une route est réservée au mode parent ;
  l'accès enfant/appareil est toujours déclaré explicitement (`@ChildOnly`, `@AnyMode`).
- **Identifiant enfant toujours issu de la session** (`@ChildId()`), jamais d'un paramètre d'URL.
- **ProgressionService** : unique point d'attribution d'XP → niveau → évolution → Créaturopédie, dans la
  transaction de l'appelant.
- **Effets post-transaction** (`common/effects.ts`) : les notifications temps réel ne partent qu'après commit.
- **Transitions gardées** (`updateMany ... where status = PENDING`) contre les doubles validations / ouvertures.
- **Catalogue** (`content/catalog.service.ts`) : contenu chargé depuis les tables de définition (synchronisées depuis
  `game-data`), index en mémoire. Un back-office pourra modifier la base puis appeler `reload()`.
- **Erreurs** : filtre global → `{ statusCode, code, message, details? }`, jamais de stack côté client ; le web
  traduit `code` en message bienveillant.
- **Langue** : `Accept-Language` → AsyncLocalStorage → textes de contenu localisés (`fr` par défaut).

### Tâches et temps réel

- `QueueService` : BullMQ si `REDIS_URL` est défini (jobs persistants, relances), sinon minuteries en mémoire.
  Les jobs sont **idempotents** ; l'état de référence est en base.
- Exploration : job différé à `endsAt` + balayage chaque minute + complétion à la lecture (`completeDueForChild`).
- Maintenance horaire : parties de mini-jeu abandonnées, sessions expirées.
- Socket.IO : authentification par le même cookie, salles `child:{id}`, `parents:{familyId}`, `family:{familyId}`.
  Aucun message client → serveur n'est traité. Adaptateur Redis pour le multi-instances.

### Redis : quand et pourquoi

| Usage                           | Avec Redis              | Sans Redis            |
| ------------------------------- | ----------------------- | --------------------- |
| Jobs (exploration, maintenance) | BullMQ                  | minuteries + balayage |
| Rate limiting                   | partagé entre instances | mémoire locale        |
| Diffusion Socket.IO             | adaptateur Redis        | instance unique       |

## Web (Next.js App Router)

- `/` accueil et « Qui joue ? », `/login`, `/register`, `/setup` (onboarding), `/play/*` (enfant), `/parent/*` (parent),
  `/offline`.
- Données : TanStack Query (`lib/queries.ts`, clés centralisées) ; les événements Socket.IO invalident les requêtes
  et déclenchent les célébrations (`components/Celebrations.tsx`).
- Session : `useSession()` lit `/api/auth/me` ; tout changement de profil purge le cache (`resetSessionCache`).
- i18n : `src/i18n` (dictionnaires typés, clés vérifiées à la compilation, repli sur le français).
- PWA : `app/manifest.ts`, `public/sw.js` (coquille + statiques en cache, API jamais en cache, page hors-ligne),
  icônes générées par `scripts/generate-icons.mjs`.
- Accessibilité : `MotionConfig reducedMotion="user"`, rôles ARIA (dialogues, onglets, progressbar), focus visible,
  cibles tactiles ≥ 44 px, lien d'évitement.

## Moteur Python

FastAPI, endpoints internes protégés par `x-engine-key` :
`POST /v1/companion/{story|riddle|math|fact|joke}` et `POST /v1/recommendations/missions`.
`ContentProvider` permettra d'ajouter un fournisseur d'IA sans changer l'API ; aucun endpoint de discussion libre.

## Ajouter du contenu

1. Modifier les JSON de `packages/game-data/data` (ex. nouvelle espèce + ses formes dans `species.json` et
   `evolutions.json`).
2. `pnpm --filter @mimo/game-data test` (le test d'intégrité vérifie les références).
3. Incrémenter `CONTENT_VERSION` puis `pnpm --filter @mimo/api db:sync-content`.
   Le rendu SVG d'une nouvelle espèce s'ajoute dans `packages/ui/src/creature/Creature.tsx`.
