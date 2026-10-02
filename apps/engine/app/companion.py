"""Génération des réponses du compagnon à partir d'actions prédéfinies.

Il n'existe volontairement aucun point d'entrée de discussion libre : chaque action
renvoie un contenu adapté aux enfants, généré de façon déterministe à partir d'une graine.
Un futur fournisseur d'IA pourra implémenter `ContentProvider` sans changer l'API.
"""

from __future__ import annotations

import random
from typing import Literal, Protocol

from pydantic import BaseModel, Field

from . import content

Action = Literal["story", "riddle", "math", "fact", "joke"]


class CompanionContext(BaseModel):
    child_name: str = Field(default="toi", max_length=40)
    creature_name: str = Field(default="Mimo", max_length=40)
    species: str | None = Field(default=None, max_length=40)
    level: int = Field(default=1, ge=1, le=100)
    locale: str = Field(default="fr", max_length=5)
    seed: int = Field(default=0, ge=0)


class CompanionContent(BaseModel):
    title: str
    text: str
    answer: str | None = None


class ContentProvider(Protocol):
    def generate(self, action: Action, ctx: CompanionContext) -> CompanionContent: ...


class TemplateProvider:
    """Fournisseur par défaut : contenus écrits à la main et combinaisons procédurales."""

    def generate(self, action: Action, ctx: CompanionContext) -> CompanionContent:
        rng = random.Random(ctx.seed)
        if action == "story":
            return self._story(rng, ctx)
        if action == "riddle":
            question, answer = rng.choice(content.RIDDLES)
            return CompanionContent(title="Énigme", text=question, answer=answer)
        if action == "math":
            return self._math(rng, ctx)
        if action == "fact":
            return CompanionContent(title="Le savais-tu ?", text=rng.choice(content.FACTS))
        return CompanionContent(title="Blague", text=rng.choice(content.JOKES))

    @staticmethod
    def _fill(text: str, ctx: CompanionContext, **extra: str) -> str:
        return text.format(creature=ctx.creature_name, child=ctx.child_name, **extra)

    def _story(self, rng: random.Random, ctx: CompanionContext) -> CompanionContent:
        place = rng.choice(content.STORY_PLACES)
        place_short = place.split(",")[0]
        parts = [
            self._fill(rng.choice(content.STORY_OPENINGS), ctx),
            f"Le chemin les mena jusqu'à {place}.",
            f"Là-bas, ils rencontrèrent {rng.choice(content.STORY_MEETINGS)}.",
            self._fill(rng.choice(content.STORY_ACTIONS), ctx),
            self._fill(rng.choice(content.STORY_ENDINGS), ctx),
        ]
        title = self._fill(rng.choice(content.STORY_TITLES), ctx, place_short=place_short)
        return CompanionContent(title=title, text=" ".join(parts))

    def _math(self, rng: random.Random, ctx: CompanionContext) -> CompanionContent:
        """Défi de maths en situation, dont la difficulté suit le niveau du compagnon."""
        name = ctx.creature_name
        if ctx.level < 6:
            a, b = rng.randint(2, 9), rng.randint(2, 9)
            return CompanionContent(
                title="Défi de maths",
                text=f"{name} a ramassé {a} pommes, puis {b} autres. Combien de pommes en tout ?",
                answer=str(a + b),
            )
        if ctx.level < 14:
            groups, per_group = rng.randint(3, 9), rng.randint(3, 9)
            return CompanionContent(
                title="Défi de maths",
                text=(
                    f"{name} range des coquillages : {groups} paniers de {per_group} coquillages. "
                    "Combien y en a-t-il ?"
                ),
                answer=str(groups * per_group),
            )
        total = rng.randint(4, 12) * 6
        return CompanionContent(
            title="Défi de maths",
            text=f"{name} partage {total} fruits étoilés entre 6 amis. Combien chacun en reçoit-il ?",
            answer=str(total // 6),
        )


provider: ContentProvider = TemplateProvider()
