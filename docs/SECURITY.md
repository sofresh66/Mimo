# Sécurité et protection des enfants

## Données collectées (minimisation)

| Qui      | Donnée                                                                | Pourquoi                                      |
| -------- | --------------------------------------------------------------------- | --------------------------------------------- |
| Parent   | e-mail, nom affiché (« Papa »), hash du mot de passe et du PIN parent | authentification, validation des missions     |
| Enfant   | prénom **ou pseudo**, avatar (emoji), couleur, hash du PIN            | sélection du profil                           |
| Enfant   | progression de jeu, historique d'événements                           | fonctionnement du jeu, tableau de bord parent |
| Sécurité | journal d'audit (action, IP, user-agent)                              | détection d'abus                              |

Jamais collectés : nom de famille de l'enfant, adresse, école, localisation, téléphone, e-mail enfant, photo.
Pas de publicité, pas de traceur, pas de profil public, pas de messagerie, pas de classement.
Suppression d'un profil enfant = effacement définitif de toutes ses données (cascade).

## Authentification

- **Parent** : e-mail + mot de passe (≥ 10 caractères), hash **Argon2id** (OWASP), temps de réponse constant
  pour un e-mail inconnu.
- **Jetons** : JWT d'accès HS256 de 15 min en cookie `HttpOnly`, `SameSite=Lax`, `Secure` en production ;
  refresh token opaque (256 bits) **haché** en base, cookie limité à `/api/auth`, **rotation** à chaque usage.
- La **session est vérifiée en base à chaque requête** : révocation immédiate (déconnexion, changement de
  mot de passe, déconnexion de tous les appareils, suppression d'un profil).
- **Modes de session** portés par le serveur :
  - `DEVICE` : appareil familial connecté, seul « Qui joue ? » est accessible ;
  - `PARENT` : après mot de passe ou **PIN parent**, expire après `PARENT_MODE_TTL_MINUTES` ;
  - `CHILD` : après sélection d'un profil + **PIN enfant**.
    Le PIN enfant ne donne **jamais** de droits parent.
- PIN : 4 chiffres hachés (Argon2id). Compteur d'échecs **incrémenté atomiquement** en base ;
  verrouillage **progressif** tous les 5 échecs (5 min, puis 30 min, puis 24 h), remise à zéro uniquement après
  un PIN correct ; alerte temps réel aux parents connectés ; rate limiting par IP (`AUTH_RATE_LIMIT`, 10/min).
- Refresh token : rotation **atomique** (deux usages simultanés du même jeton : un seul réussit).

## Plusieurs parents par famille

- Chaque parent a **son propre compte** (e-mail, mot de passe, sessions) et **son propre PIN parent** ;
  aucun secret n'est partagé. Le rattachement passe par `User.familyId` (une famille par compte).
- Invitation par lien `/join-parent/<jeton>` : jeton de 256 bits, **seul son hash SHA-256 est stocké**,
  affiché une seule fois au parent qui invite, **usage unique**, expiration 72 h, **révocable**.
  Au plus 4 parents par famille et 5 invitations en attente.
- L'aperçu public d'un lien ne révèle que le nom de la famille et le nom affiché de l'invitant ;
  une invitation inconnue, expirée, révoquée ou utilisée renvoie la même erreur.
- L'acceptation exige le mode parent (mot de passe saisi à la connexion ou à l'inscription), refuse un compte
  déjà membre d'une famille, et est une **transition gardée** (deux acceptations simultanées : une seule réussit).
- Le paramètre `?next=` des pages de connexion/inscription n'accepte que des chemins internes simples
  (pas de redirection ouverte). Création, révocation et acceptation sont journalisées dans l'audit.

## Adultes joueurs (« Mamie »)

Un membre adulte peut rejoindre la famille **comme joueur, sans aucun droit parental**
(`User.familyRole = ADULT_PLAYER`, les comptes existants restent `PARENT`).

- Invitation par lien `/join-player/<jeton>` : même infrastructure que l'invitation parent
  (`ParentInvitation.role`), jeton haché, usage unique, 72 h, révocable, verrou de famille,
  limite de 6 adultes joueurs. Le rôle accordé vient de l'invitation côté serveur, jamais de l'URL.
- À l'acceptation : profil de jeu `ADULT` créé (sans PIN, sans créature), PIN parent effacé,
  autres sessions du compte révoquées, session courante basculée en mode `PLAYER` (cookie réémis).
- Connexion par e-mail + mot de passe → toujours une session `PLAYER` liée à **son** profil.
  Le garde refuse (401) toute autre session de ce compte (mode parent, appareil, enfant, profil
  d'un autre membre ou d'une autre famille), y compris après refresh.
- Refusé (403) : toutes les routes parent (`@ParentOnly` par défaut), `unlock/parent` (même avec
  le PIN d'un parent), `unlock/child`, `lock`, `/profiles`, acceptation d'une invitation parent.
- Temps réel : jamais la salle `parents:` (contrôle du rôle dans la passerelle), seulement
  `child:<son profil>` et `family:`. Il ne reçoit donc pas `mission:requested`.
- Missions : il ne voit que les missions qui lui sont attribuées ; il les envoie pour validation,
  seul un parent valide. Le parent ne peut ni modifier, ni supprimer, ni doter d'un PIN son profil.

## Autorisations

- Garde global : sans décorateur, une route est **réservée au mode parent** (refus par défaut).
- L'identifiant enfant vient toujours de la session (`@ChildId()`), jamais de l'URL : pas d'IDOR entre enfants.
- Toutes les requêtes parent sont filtrées par `familyId` de la session : isolation stricte entre familles.
- Socket.IO : authentification par cookie au handshake, session (et expiration du mode parent) vérifiée en
  base, salles attribuées par le serveur ; aucun message client accepté. Les sockets d'une session sont
  **fermées** à chaque changement de mode, verrouillage ou déconnexion (et toutes celles du parent lors d'une
  déconnexion globale ou d'un changement de mot de passe).
- Couvert par les tests : enfant → endpoints parent (403), appareil verrouillé, PIN d'une autre famille (404),
  cadeau d'un autre enfant (404), mission assignée à un autre enfant, socket sans session.

## Intégrité du jeu

- Tous les gains sont calculés par l'API (le client n'envoie jamais de score ou d'XP).
- Transitions gardées (`updateMany where status = …`) : pas de double validation, double ouverture, double fin
  d'exploration, double soumission de mini-jeu. Filet de sécurité en base : contrainte d'unicité
  `XPEvent(source, sourceId)` — un même événement ne rapporte jamais d'XP deux fois.
- Verrou de ligne sur la créature lors d'un gain d'XP (pas de mise à jour perdue) et verrou consultatif
  PostgreSQL par enfant et par jeu pour le plafond quotidien des mini-jeux.
- Ces scénarios de concurrence sont couverts par `apps/api/test/api/concurrency.spec.ts`.
- Mini-jeux : réponses stockées côté serveur, rejouées/corrigées, durée minimale, plafond quotidien.
- Jobs idempotents (BullMQ `jobId` unique, transitions gardées).

## Application web

- Même origine (proxy `/api`, `/socket.io`) : cookies first-party, CORS limité à `WEB_ORIGIN`.
- En-têtes : `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (caméra, micro,
  géolocalisation désactivés) ; Helmet côté API.
- Service worker : ne met **jamais** en cache `/api` ni `/socket.io`.
- Les erreurs affichées sont des messages simples ; aucun détail technique n'est exposé.

## Compagnon

Actions prédéfinies uniquement, aucun texte libre de l'enfant n'est transmis. Contenus écrits à la main et
générés de façon déterministe. Toute future IA devra passer par `ContentProvider`, avec filtrage, respect du
contrôle parental et sans envoi de données personnelles.

## Protection des environnements (anti-production)

Le seed, les tests et les commandes qui peuvent vider une base sont **bloqués sur toute base distante**.
La vérification porte sur l'URL PostgreSQL elle-même (hôte et paramètre `host=`), pas sur `NODE_ENV`.
Seuls `localhost`, `127.0.0.1` et `::1` sont acceptés (`packages/config/src/db-guard.ts`).

| Opération                          | Garde-fou                                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:seed`                     | `prisma/seed.ts` vérifie `DATABASE_URL` et `DIRECT_URL` avant toute connexion                                                      |
| `pnpm db:migrate`, `pnpm db:reset` | `scripts/assert-local-db.cjs` s'exécute avant Prisma                                                                               |
| Tests API (Jest)                   | `TEST_DATABASE_URL` vérifiée au chargement, avant les migrations et avant chaque `TRUNCATE`                                        |
| E2E (Playwright)                   | le `globalSetup` vérifie l'URL du seed **et** la base réellement utilisée par le serveur testé (`/api/health` → `database: local`) |

En cas de base distante : `REFUS DE SÉCURITÉ : cette commande ne peut pas être exécutée sur une base distante.`
Les identifiants de production ne doivent figurer que dans l'hébergeur (Render), jamais dans `.env`.
`pnpm db:deploy` et la synchronisation du contenu (non destructives) restent possibles en production.

## Production

- `JWT_ACCESS_SECRET` aléatoire (≥ 32 caractères, refus de démarrer sinon), `COOKIE_SECURE=true` obligatoire.
- HTTPS de bout en bout, `ENGINE_API_KEY` secrète, moteur non exposé publiquement.
- Le seed de démonstration refuse de tourner en production.
- Signaler une vulnérabilité : contacter les mainteneurs en privé.
