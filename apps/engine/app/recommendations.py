"""Recommandations de missions pour équilibrer les activités d'un enfant.

L'objectif n'est jamais de comparer les enfants entre eux, uniquement de proposer
aux parents des idées d'activités variées pour un enfant donné.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

CATEGORIES = ["LOGIC", "CREATIVITY", "READING", "ADVENTURE", "HELPING", "SPORT"]

REASONS = {
    "LOGIC": "Un petit défi de réflexion pour varier les plaisirs",
    "CREATIVITY": "Un moment créatif pour laisser parler l'imagination",
    "READING": "Un moment de lecture pour s'évader",
    "ADVENTURE": "Une découverte pour nourrir la curiosité",
    "HELPING": "Une occasion de donner un coup de main",
    "SPORT": "Un moment pour bouger et se dépenser",
}


class TemplateRef(BaseModel):
    id: str
    category: str


class RecommendationRequest(BaseModel):
    category_xp: dict[str, int]
    templates: list[TemplateRef]
    limit: int = Field(default=3, ge=1, le=10)


class Suggestion(BaseModel):
    template_id: str
    reason: str


class RecommendationResponse(BaseModel):
    suggestions: list[Suggestion]


def recommend(req: RecommendationRequest) -> RecommendationResponse:
    """Classe les catégories par « déficit » relatif à la moyenne, puis propose un modèle par catégorie."""
    xp = {c: max(0, req.category_xp.get(c, 0)) for c in CATEGORIES}
    mean = sum(xp.values()) / len(CATEGORIES)
    ranked = sorted(CATEGORIES, key=lambda c: (xp[c] - mean, c))
    suggestions: list[Suggestion] = []
    used: set[str] = set()
    for category in ranked:
        template = next((t for t in req.templates if t.category == category and t.id not in used), None)
        if template is None:
            continue
        used.add(template.id)
        suggestions.append(Suggestion(template_id=template.id, reason=REASONS[category]))
        if len(suggestions) >= req.limit:
            break
    return RecommendationResponse(suggestions=suggestions)
