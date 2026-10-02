# Game design

## Principes

1. **Bienveillance** : le compagnon ne meurt jamais, ne tombe jamais malade, n'est jamais « triste à cause de
   l'enfant ». Aucun message culpabilisant, aucune punition pour une mission non faite.
2. **Encouragement positif** : chaque action produit un retour joyeux (animation, son, texte).
3. **Pas de compétition** : aucun classement, aucune comparaison entre frères et sœurs ; le village est coopératif.
4. **Pas de rétention manipulatrice** : pas de série quotidienne punitive, pas de loot box payante, plafonds doux.
5. **Le serveur décide** : tous les gains sont calculés par l'API.

## Créatures

- 5 espèces de départ : dragon, renard, dinosaure, robot, esprit mystique (`species.json`).
- Stades : **Oeuf** (niveau 1) → **Bébé** (2) → **Jeune** (6) → **Adulte** (12) → **Évolution spéciale** (20+, conditions).
- 10 formes par espèce (50 au total) : 1 oeuf, 1 bébé, 1 jeune, 5 adultes, 2 spéciales.
- Statistiques : bonheur, énergie, curiosité (0-100). Avec le temps elles **reviennent vers un état calme**
  (bonheur → 60, jamais sous 35 ; énergie → 100 ; curiosité → 50). Humeurs possibles : radieux, content, calme,
  curieux, ensommeillé — jamais triste ou malade.
- Talents : dérivés de l'XP par catégorie (Logique, Créativité, Lecture, Aventure, Entraide, Sport).

### Évolutions

- Au passage adulte, la **catégorie dominante** (≥ 25 % de l'XP totale et strictement en tête parmi les
  branches de l'espèce) choisit la branche : ex. dragon + Logique → **Dragon Sage**, + Aventure → **Dragon
  Explorateur**, + Créativité → **Dragon Artiste**, + Entraide → **Dragon Gardien** ; sinon forme équilibrée.
- La branche adulte est définitive ; une créature ne régresse jamais.
- Formes spéciales : conditions secrètes (XP de catégories, recettes découvertes, explorations, missions).
- Les conditions ne sont **jamais** envoyées au client ; la Créaturopédie affiche `???` et un indice vague
  seulement si l'espèce est déjà connue de la famille.

## Progression

- XP pour passer du niveau _n_ au suivant : `40 + 20 × (n − 1)` (niveau max 50).
- Montée de niveau : +10 pièces ; tous les 5 niveaux, un coffre (rare, puis épique dès le niveau 20).

| Source                  | XP                                              | Limite                                                  |
| ----------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| Mission validée         | 1 à 100 (choisi par le parent, 10-25 conseillé) | une réalisation par période                             |
| Exploration             | 15 à 70 selon la zone                           | durée réelle + énergie                                  |
| Mini-jeu                | jusqu'à 15 selon le score                       | 5 parties récompensées / jour / jeu, durée minimale 8 s |
| Jouer avec le compagnon | 3                                               | 5 fois / jour                                           |
| Cadeau parent           | choisi par le parent                            | —                                                       |

## Missions

- Créées par les parents (15 modèles prédéfinis ou personnalisées), quotidiennes, hebdomadaires ou uniques,
  pour tous les enfants ou un seul.
- L'enfant appuie sur « C'est fait ! » → le parent valide (ou « Pas encore », qui rend simplement la mission
  disponible) ; le parent peut aussi valider directement.
- Validation : XP dans la catégorie, pièces, récompense bonus éventuelle, points de village, événement temps réel.

## Inventaire, cuisine, boutique

- Catégories : nourriture, accessoires (tête, visage, cou, dos), objets, matériaux, décorations (3 dans la chambre),
  objets spéciaux (oeufs), coffres. Raretés : commun, rare, épique, légendaire.
- Cuisine : 2 ou 3 ingrédients ; 10 recettes secrètes (ex. fraise + lait = milkshake magique). Une combinaison
  inconnue **ne consomme rien**.
- Boutique : achats en pièces uniquement (aucun argent réel).

## Exploration

6 zones (Forêt lumineuse → Île des étoiles) débloquées par niveau, durée de 5 à 60 minutes, coût en énergie.
Butin tiré côté serveur avec une graine dérivée de l'exploration (reproductible) : pièces, nourriture, matériaux,
accessoires, coffres, rares oeufs spéciaux. Un oeuf ne peut pas explorer.

## Monde familial

- Points de village : mission +10, exploration +5, mini-jeu récompensé +2, repas +1, dons de matériaux (2 à 30).
- 8 bâtiments (maison, fontaine 100, forêt 250, boutique 450, jardin 700, laboratoire 1000, château 1500,
  portail magique 2200).
- Missions familiales hebdomadaires coopératives (10 missions, 8 explorations, 12 parties, 15 repas) qui
  rapportent des points au village. Aucune contribution individuelle n'est affichée.

## Mini-jeux

Mémoire (8 paires, score selon le nombre de coups, jamais sous 40 % s'il est terminé), calcul mental (10 questions,
3 difficultés), suites logiques (6 questions, nombres et motifs). Défis générés et corrigés par le serveur.

## Compagnon

Actions prédéfinies : histoire, énigme, défi de maths, anecdote, blague. Pas de saisie libre. Activable et
configurable par les parents, 20 utilisations par jour.
