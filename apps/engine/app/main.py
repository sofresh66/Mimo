"""Moteur Mimo (FastAPI).

Service interne appelé uniquement par l'API NestJS (clé partagée `x-engine-key`).
Responsabilités actuelles : contenus du compagnon et recommandations de missions.
Il est conçu pour accueillir progressivement la logique plus complexe (génération
procédurale, recommandations avancées, IA) sans jamais être indispensable : l'API
dispose d'un repli local si le moteur est indisponible.
"""

from __future__ import annotations

import os
import secrets
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, status

from .companion import Action, CompanionContent, CompanionContext, provider
from .recommendations import RecommendationRequest, RecommendationResponse, recommend

app = FastAPI(title="Mimo Engine", version="0.1.0", docs_url="/docs", redoc_url=None)


def require_key(x_engine_key: Annotated[str | None, Header()] = None) -> None:
    expected = os.environ.get("ENGINE_API_KEY")
    if not expected:
        return
    if x_engine_key is None or not secrets.compare_digest(x_engine_key, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid engine key")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/companion/{action}", dependencies=[Depends(require_key)])
def companion(action: Action, ctx: CompanionContext) -> CompanionContent:
    return provider.generate(action, ctx)


@app.post("/v1/recommendations/missions", dependencies=[Depends(require_key)])
def missions(req: RecommendationRequest) -> RecommendationResponse:
    return recommend(req)
