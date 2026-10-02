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

## Production

- `JWT_ACCESS_SECRET` aléatoire (≥ 32 caractères, refus de démarrer sinon), `COOKIE_SECURE=true` obligatoire.
- HTTPS de bout en bout, `ENGINE_API_KEY` secrète, moteur non exposé publiquement.
- Le seed de démonstration refuse de tourner en production.
- Signaler une vulnérabilité : contacter les mainteneurs en privé.
