# Mimo — reprise technique et audit Redis du 19 octobre 2026

## Périmètre et état

Audit du commit `bb5c4550fa777d0916c04f6e7d7953d4f2c39a9c`, dernière version GitHub et
version de production Vercel observée. Corrections préparées sur la branche locale
`codex/mimo-redis-audit`. Cet audit décrit les vérifications avant publication : à ce
stade, aucun push, déploiement, changement de configuration distante, migration distante,
nettoyage Redis distant ou changement de forfait n'avait été effectué. Le propriétaire
a ensuite autorisé explicitement la publication en production (« oui déploie »).

| Élément | Vérifié | Limite restante |
| --- | --- | --- |
| GitHub | Dépôt public `sofresh66/Mimo`, branche `main` ; Next.js, NestJS, Prisma/PostgreSQL, BullMQ/Redis ; moteur FastAPI optionnel | Correction conservée localement |
| Vercel | Projet `mimo`, équipe `sofresh2`, racine `apps/web`, déploiement production `READY`, commit ci-dessus ; domaine `mimo-five-beta.vercel.app` | Le connecteur refuse les détails (403) ; accès local Vercel fonctionnel en lecture seule |
| Render | Accès rétabli ; espace `my workspace` confirmé par le propriétaire. Deux services : API `Mimo` et moteur Python `Mimo-1`, chacun configuré avec une instance et un plan `free`, à Francfort. API `live` sur le commit audité, moteur `live` sur `3f9762b`. Aucun service de preview déclaré. Santé API `ok` à 13 h 14, heure de Paris | Compteurs HTTP/CPU/instances non fournis par les réponses métriques ; variables secrètes non lues ; attribution et volume Upstash encore à confirmer |
| Neon | Projet `Mimo` (`muddy-band-80864103`), région Francfort, PostgreSQL 18 ; branche `production` active ; branche `backup-before-mamie-2026-10-03` archivée | Métadonnées uniquement, aucune donnée familiale lue ni écrite ; restauration et sauvegardes à vérifier |
| Upstash | Compteur de **440 000 commandes** communiqué par le propriétaire le 19 octobre ; sur le plafond de 500 000 évoqué, cela représente **88 % consommés et 60 000 restants**. Aucun connecteur exploitable trouvé ; la session navigateur des outils demande encore une connexion | Compteur fourni par le propriétaire, non lu directement ; base exacte, période/remise à zéro, top commandes, autres clients et quota contractuel non vérifiés |

La santé HTTP ne prouve pas à elle seule que toutes les fonctions du jeu sont saines.
Le premier appel a dépassé 30 secondes ; le second a réussi. Un démarrage à froid est
une hypothèse. Les journaux montrent un démarrage à 13 h 13 min 48 s, heure de Paris,
mais n'établissent pas la cause précise de ce délai.

## Complément Render après rétablissement de l'accès

Lecture du 19 octobre, autour de 13 h 54 (Paris), sur l'espace autorisé
`tea-db00s167bikc73foh940` :

- API `Mimo`, service `srv-db013htg1s2s73c67c10`, URL
  `https://mimo-m1xm.onrender.com`, health check `/api/health`.
  Le déploiement `dep-db0jk6g473hc73888t5g` est `live` et correspond exactement au
  commit GitHub/Vercel de la boîte aux lettres. Les déploiements précédents sont
  désactivés ou anciens ; aucun second service API/worker n'a été trouvé dans cet espace.
- Moteur `Mimo-1`, service `srv-db017qad0e5s739ncrtg`, URL
  `https://mimo-1-qmk1.onrender.com`, racine `apps/engine/`, health check `/health`.
  Son déploiement initial est toujours `live`. Aucun client Redis dans le code Python audité.
- Les deux services ont `autoDeployTrigger: commit` sur `main`. Publier sur cette
  branche déclenche automatiquement un déploiement ; aucun push effectué pendant l'audit.
- Sur les dernières 24 heures, les requêtes de métriques renvoient des séries vides
  pour trafic HTTP, CPU et nombre d'instances. Ce n'est pas une mesure de trafic nul.
  Une seule observation mémoire exploitable : environ 194 Mio. Les recherches
  d'événements de redémarrage/arrêt n'ont renvoyé aucun événement ; les journaux
  applicatifs fournissent néanmoins deux démarrages et deux erreurs de fermeture.
- Erreurs applicatives à **12 h 55 min 04 s** et **13 h 29 min 12 s** (Paris) :
  `Error: Connection is closed.` La seconde trace passe par
  `RedisAdapter.close → Server.close → RealtimeIoAdapter.close`.
  Cela ne démontre ni un dépassement du quota Upstash ni la cause initiale des arrêts.
- Les journaux indiquent Node.js **26.10.0** en production ; les validations locales
  ont utilisé Node.js **24.21.0**. Le défaut de fermeture est reproduit sur la version
  locale. La version Node de Render n'a pas été modifiée.

### Défaut de fermeture reproduit et corrigé localement

Le cycle Nest ferme les modules, appelle `beforeApplicationShutdown`, ferme les
transports, puis appelle `onApplicationShutdown`. Redis était fermé dans
`onModuleDestroy`, alors que BullMQ se fermait seulement en dernière phase et que
Socket.IO devait encore envoyer ses commandes de désabonnement.

Un nouveau test exécute un processus Nest isolé, un vrai socket connecté et un worker
BullMQ sur Redis local. **Avant correction, il échoue avec le même
`Error: Connection is closed.` que les journaux Render.** Après correction, il
se termine normalement et vérifie aussi que le job est marqué terminé :

1. Les workers sont drainés dans `QueueService.beforeApplicationShutdown`.
2. Nest ferme Socket.IO pendant que Redis reste disponible.
3. `RedisService.onApplicationShutdown` ferme enfin les connexions Redis.

Cette correction ajoute de la fiabilité aux arrêts/redémarrages. Elle ne représente
pas une économie de commandes supplémentaire mesurée ; la baisse de 48,9 % ci-dessous
concerne les réglages de consommation déjà mesurés avant ce complément.

## Consommateurs identifiés dans le code

| Consommateur | Déclenchement et coût | Protection à conserver |
| --- | --- | --- |
| Worker BullMQ `exploration` | Existe au démarrage même sans exploration. Sans réglage explicite, attente à vide de 5 s et contrôle des jobs bloqués toutes les 30 s dans BullMQ 5.81.5 | Complétion différée persistante, déduplication, reprise et relances |
| Worker BullMQ `maintenance` | Balayage des explorations chaque minute et nettoyage horaire. Les jobs différés maintiennent une activité même sans joueur | Rattrapage des explorations et nettoyage des sessions/mini-jeux/social |
| Files BullMQ | Ajout des jobs, planificateurs, métadonnées et scripts Lua ; historique des récurrences auparavant non borné | État de jeu et récompenses restent en PostgreSQL |
| Limites anti-abus | Stockage Redis partagé appelé par la protection HTTP, notamment connexion, PIN et envoi de courrier | Limites et verrouillages conservés ; `/api/health` est déjà exclu de la limitation |
| Socket.IO | Pub/sub Redis pour les notifications et les changements de session entre instances | Cloisonnement enfants/parents/adultes, notification du courrier conservés |

Aucun client Redis direct trouvé côté navigateur, Vercel/Next.js ou moteur Python dans
ce dépôt. Le minuteur visuel à 1 seconde de la page de jeu actualise l'affichage local ;
ce n'est pas en soi un appel Redis. Des requêtes HTTP ou reconnexions peuvent cependant
entraîner du rate limiting et des événements Redis côté API.

La documentation officielle Upstash confirme que BullMQ sollicite Redis régulièrement,
même quand les files sont inactives :
[BullMQ et facturation](https://upstash.com/docs/redis/integrations/bullmq).
Cela établit un mécanisme plausible et reproduit localement ; la part réelle dans
l'alerte ne peut pas être attribuée sans les statistiques de la base concernée.

## Mesure locale avant / après

Deux exécutions de 125 secondes, après 2 secondes de chauffe, sans HTTP ni joueur :
un processus API simulant ses deux workers, récurrence d'une minute et récurrence horaire.
Même version BullMQ 5.81.5, ioredis 5.11.1 et serveur local Memurai compatible Redis
8.2.10 sous Windows. Aucun accès à Upstash, Neon ou aux données réelles.

| Mesure | Avant | Après | Variation |
| --- | ---: | ---: | ---: |
| Requêtes applicatives envoyées à Redis | 94 | 48 | −48,9 % |
| `EVALSHA` envoyés | 53 | 28 | −47,2 % |
| `BZPOPMIN` envoyés | 41 | 20 | −51,2 % |
| Commandes serveur, y compris opérations internes des scripts et un `INFO` de mesure | 477 | 285 | −40,3 % |

Les deux mesures ont exécuté le même nombre de balayages : un initial puis deux pendant
la fenêtre. Les requêtes applicatives sont comptées sur les clients ioredis, y compris
les connexions dupliquées par BullMQ ; le client de mesure est exclu de ce compteur.
Les commandes serveur proviennent des différences de `INFO commandstats` et comprennent
les appels internes Lua. Ces deux métriques sont distinctes du compteur de facturation
Upstash : ne pas les assimiler ni extrapoler une économie contractuelle de 49 %.

À titre de scénario de capacité seulement, 48 requêtes / 125 secondes sur un mois de
30 jours avec une instance active en continu représentent environ 995 000 requêtes,
avant le trafic des joueurs. La correction ne garantit donc pas un plafond de 500 000.
Les phases des récurrences, explorations en cours, erreurs, redémarrages et instances
modifient ce rythme. Une fenêtre de 125 secondes est une mesure courte.

## Correction préparée

- Attente bloquante à vide portée de 5 à 30 secondes. L'arrivée d'un job réveille le worker
  immédiatement ; ce réglage n'ajoute pas une attente de 30 secondes avant de traiter un job.
- Vérification des jobs bloqués toutes les 60 secondes au lieu de 30. La récupération
  reste activée ; après perte de verrou, la détection peut prendre jusqu'à une minute
  au lieu d'environ 30 secondes, avant les autres délais de reprise.
- Historique des récurrences limité à 100 succès et 1 000 échecs par file. C'est
  l'historique technique BullMQ, pas les explorations, lettres ou sauvegardes du jeu.
  L'élagage est effectué par BullMQ à la fin des jobs ; aucune purge distante exécutée.
- Noms de connexion par rôle, sans identifiant utilisateur, afin de faciliter une future
  attribution des clients. BullMQ continue de nommer ses connexions bloquantes.
- Sept tests d'intégration Redis explicites, refusant une URL distante avant connexion,
  dont la reproduction du cycle d'arrêt Nest complet.

Limite vérifiée dans le code de BullMQ installé : lorsqu'un job différé existe,
`getBlockTimeout()` plafonne l'attente à 10 secondes. Augmenter encore `drainDelay` ne
supprime donc pas la consommation de la file de maintenance, ni celle d'une exploration
en attente. Aucun contournement des composants internes de BullMQ n'est proposé.

Les durées de maintenance, autorisations, plafonds d'envoi, gains d'XP et algorithmes de
complétion ne changent pas. Les travaux restent persistants. Le moteur Python est intact.

## Vérification

- Lint et vérification TypeScript des applications API/web et paquets partagés : réussis.
- Compilation API (`prisma generate` puis `nest build`) relancée après le complément
  de fermeture : réussie. Avant publication, la branche distante `main` a été revérifiée
  et correspondait toujours au commit audité.
- API : 116 tests, 12 suites réussies, avec PostgreSQL local dédié ; couvre jeu,
  concurrence, courrier, sessions, accès parent/enfant, adulte joueur et temps réel.
  Suite relancée après la correction d'arrêt : à nouveau 116 tests réussis.
- Redis : 7 tests réussis sur Redis local dédié ; réveil à vide, délai/déduplication,
  redémarrage, erreur transitoire, récurrences/historique, arrêt du worker et cycle
  d'arrêt Nest avec Socket.IO. Lint et TypeScript API relancés et réussis après ce complément.
- Web : 14 tests réussis ; règles de jeu : 43 tests réussis ; garde-fous de base : 9 tests réussis.
- Navigateur, avec PostgreSQL et Redis locaux : 16 parcours distincts validés sur mobile
  et ordinateur (enfant, parent, Mamie, courrier en direct et supervision). Premier passage :
  15 réussites et un dépassement de délai pour l'exploration, car la copie locale utilisait
  la durée réelle de 5 minutes. Après activation de `EXPLORATION_TIME_SCALE=0.05` dans le
  seul `.env` local, conformément au README, ce parcours a été rejoué seul et réussi
  en 18 secondes, retour de la créature et +15 XP compris. Aucun test ni délai de
  production modifié pour obtenir cette réussite.
- Outil de mesure fourni : démarrage et comptage vérifiés sur une base locale vide ;
  refus des bases non vides et garde d'URL distante avant connexion dans le code.

Un avertissement `MaxListenersExceededWarning` est apparu pendant la suite API existante,
sans échec. Il reste à diagnostiquer séparément si reproductible ; il n'a pas été masqué.

Rejouer les tests Redis après construction de `@mimo/config` :

```powershell
# Serveur Redis exclusivement dédié aux tests, sur la machine locale.
$env:TEST_REDIS_URL = 'redis://127.0.0.1:16379/15'
pnpm --filter @mimo/api test:redis
```

La suite Redis efface les deux files Mimo de la base locale sélectionnée ; utiliser
un Redis de test dédié. Elle est séparée de la suite habituelle qui fonctionne sans Redis.

Un outil reproductible est fourni : `pnpm --filter @mimo/api measure:redis` avec
`TEST_REDIS_URL` pointant vers une base Redis locale **vide** et exclusivement dédiée.
Il refuse les URL distantes et les bases non vides, n'efface rien, crée seulement les
files de mesure et compte les requêtes ioredis pendant 125 secondes. Il n'interprète
pas ce compteur comme la facturation Upstash. Durée réglable de 5 à 600 secondes avec
`REDIS_MEASURE_SECONDS`. Comparer deux versions sur deux bases de test vides distinctes.

## Vérifications distantes manquantes et suite recommandée

1. L'accès en lecture Render est rétabli. Reste l'accès Upstash : relever le nom/identifiant
   de la base, l'usage mensuel, la période et sa remise à zéro, les requêtes quotidiennes
   et le top commandes. La console fournit ces graphiques dans [Usage](https://upstash.com/docs/redis/howto/metrics-and-charts).
   Ne pas activer une option payante pour cet audit.
2. Render : inventaire des instances, déploiements et erreurs réalisé ci-dessus. Il reste
   à déterminer la cause des arrêts et à confirmer la base Redis cible sans exporter les
   secrets. Aucun service de test Render supplémentaire n'a été trouvé ; cela n'exclut
   pas les consommateurs extérieurs à cet espace (développement, previews ou autres machines).
3. Vérifier les previews Vercel : la configuration consultée déclare `API_INTERNAL_URL`
   pour `production` et `preview`. Un preview ne constitue donc pas une isolation prouvée.
   Ne pas y exécuter de seed, test d'écriture ou famille de démonstration contre l'API réelle.
4. Comparer la consommation à un intervalle sans joueur puis à une session familiale
   habituelle. Préférer les métriques existantes à `MONITOR` ou à une inspection des
   valeurs des clés de production ; ne pas lire les lettres ni les jetons des familles.
5. Si le budget de commandes reste insuffisant, étudier en priorité la planification
   périodique fondée sur PostgreSQL déjà présent, avec un claim atomique entre instances,
   rattrapage au redémarrage et complétion idempotente. Conserver Redis pour les limites
   anti-abus et Socket.IO. Cette évolution doit être testée séparément ; elle n'est pas
   incluse dans cette correction limitée. Un forfait ou service supplémentaire exige
   un accord budgétaire explicite ; aucune souscription ni migration décidée ici.
6. Vérifier ensuite sauvegardes et restauration Neon : la seule branche de sauvegarde
   observée est datée du 3 octobre et archivée, ce qui ne démontre pas une sauvegarde récente.

Le diff et les résultats ont été présentés au propriétaire, qui a donné son accord
explicite pour la production. Les mécanismes automatiques ont été vérifiés : Vercel et
les deux services Render suivent `main`. Publier uniquement les fichiers audités, puis
vérifier le commit effectivement servi, la santé HTTP et les erreurs applicatives.
Après publication, surveiller la consommation, les jobs et les parcours familiaux ; le retour
arrière concerne le code API et ne requiert aucune migration de schéma pour cette correction.
