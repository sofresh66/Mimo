import pytest


@pytest.fixture(autouse=True)
def _no_engine_key(monkeypatch):
    """Par défaut, les tests appellent le moteur sans clé (la vérification est testée à part)."""
    monkeypatch.delenv("ENGINE_API_KEY", raising=False)
