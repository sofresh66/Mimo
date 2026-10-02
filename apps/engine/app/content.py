"""Contenus du compagnon (histoires, énigmes, anecdotes, blagues).

Contenu écrit à la main, adapté aux 6-13 ans, sans dépendance à une IA externe.
Les histoires sont générées de façon procédurale à partir de fragments combinables.
"""

from __future__ import annotations

STORY_OPENINGS = [
    "Un matin plein de soleil, {creature} réveilla {child} en chuchotant : « J'ai trouvé une carte au trésor ! »",
    "Il était une fois, au bord d'une rivière qui chantait, {creature} qui rêvait de voir la mer.",
    "Ce jour-là, il pleuvait des gouttes dorées sur le village, et {creature} voulut savoir pourquoi.",
    "Pendant que {child} lisait un livre, {creature} remarqua qu'une page brillait plus que les autres.",
    "Au sommet de la colline, {creature} entendit une petite voix appeler à l'aide.",
]

STORY_PLACES = [
    "la Forêt lumineuse, où les champignons éclairent le chemin",
    "la Plage aux coquillages, où chaque vague apporte un secret",
    "la Montagne des nuages, si haute qu'on peut s'asseoir sur un nuage",
    "la Grotte de cristal, où les murs scintillent comme des étoiles",
    "la Bibliothèque flottante, où les livres volent comme des oiseaux",
]

STORY_MEETINGS = [
    "un hérisson timide qui avait perdu ses lunettes",
    "une tortue très lente mais très sage",
    "un petit nuage qui ne savait pas encore pleuvoir",
    "une luciole qui avait peur du noir",
    "un robot rouillé qui voulait apprendre à danser",
]

STORY_ACTIONS = [
    "Ensemble, ils cherchèrent pas à pas, en s'entraidant à chaque obstacle.",
    "{creature} eut une idée : et si on essayait autrement ? Et ça marcha !",
    "Ils comptèrent jusqu'à trois, prirent une grande inspiration, et osèrent essayer.",
    "Ils firent une pause pour partager un goûter, et trouvèrent la solution en riant.",
]

STORY_ENDINGS = [
    "Le soir venu, {creature} rentra auprès de {child}, le cœur rempli de fierté.",
    "Depuis ce jour, ils sont les meilleurs amis du monde, et ils se donnent rendez-vous chaque semaine.",
    "Et quand {child} demanda comment s'était passée l'aventure, {creature} répondit : « Encore mieux avec toi ! »",
    "Ils comprirent que les plus belles découvertes se font quand on est curieux et gentil.",
]

STORY_TITLES = [
    "La grande aventure de {creature}",
    "{creature} et le secret de {place_short}",
    "Le jour où {creature} fut courageux",
    "Une rencontre inattendue",
]

RIDDLES = [
    ("Plus j'ai de gardiens, moins je suis gardé. Qui suis-je ?", "Un secret"),
    ("Je commence la nuit et je termine le matin. Qui suis-je ?", "La lettre N"),
    ("J'ai des dents mais je ne mords jamais. Qui suis-je ?", "Un peigne"),
    ("Je monte et je descends sans jamais bouger. Qui suis-je ?", "Un escalier"),
    ("Plus je sèche, plus je suis mouillée. Qui suis-je ?", "Une serviette"),
    ("J'ai des aiguilles mais je ne couds pas. Qui suis-je ?", "Une horloge (ou un sapin !)"),
    ("On me prend avant de me donner. Qui suis-je ?", "Une photo"),
    ("Je suis plein de trous mais je retiens l'eau. Qui suis-je ?", "Une éponge"),
    ("J'ai une tête et une queue, mais pas de corps. Qui suis-je ?", "Une pièce de monnaie"),
    ("Je parle toutes les langues sans jamais les avoir apprises. Qui suis-je ?", "L'écho"),
]

FACTS = [
    "Les pieuvres ont trois cœurs et du sang bleu !",
    "Un escargot peut dormir pendant trois ans d'affilée.",
    "Les abeilles dansent pour expliquer aux autres où trouver des fleurs.",
    "Le cœur d'une baleine bleue est aussi gros qu'une petite voiture.",
    "Les étoiles de mer n'ont pas de cerveau, mais elles ont des yeux au bout des bras.",
    "Le miel ne se périme presque jamais.",
    "Les flamants roses sont roses grâce à ce qu'ils mangent.",
    "Une journée sur Vénus dure plus longtemps qu'une année sur Vénus !",
    "Les loutres se tiennent par la main pour ne pas dériver en dormant.",
    "Les papillons goûtent avec leurs pattes.",
    "La Lune s'éloigne de la Terre d'environ 4 centimètres chaque année.",
    "Les chats passent environ deux tiers de leur vie à dormir.",
]

JOKES = [
    "Pourquoi les poissons détestent-ils l'ordinateur ? Parce qu'ils ont peur du net !",
    "Que dit un escargot quand il croise une limace ? « Oh, un nudiste ! »",
    "Pourquoi les canards sont-ils toujours à l'heure ? Parce qu'ils sont dans l'étang !",
    "Quel est le comble pour un électricien ? De ne pas être au courant.",
    "Que fait une fraise sur un cheval ? Tagada, tagada !",
    "Pourquoi le livre de maths est-il triste ? Parce qu'il a trop de problèmes.",
    "Comment appelle-t-on un chat tombé dans un pot de peinture le jour de Noël ? Un chat-peint de Noël !",
    "Qu'est-ce qui est jaune et qui attend ? Jonathan !",
]
