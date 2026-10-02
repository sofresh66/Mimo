from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_story_is_personalized_and_deterministic():
    ctx = {"child_name": "Haylie", "creature_name": "Luna", "level": 8, "seed": 42}
    first = client.post("/v1/companion/story", json=ctx).json()
    second = client.post("/v1/companion/story", json=ctx).json()
    assert first == second
    assert "Luna" in first["text"]
    assert first["answer"] is None


def test_riddle_has_answer():
    body = client.post("/v1/companion/riddle", json={"seed": 3}).json()
    assert body["text"].endswith("?")
    assert body["answer"]


def test_math_difficulty_follows_level():
    easy = client.post("/v1/companion/math", json={"level": 2, "seed": 1}).json()
    hard = client.post("/v1/companion/math", json={"level": 20, "seed": 1}).json()
    assert int(easy["answer"]) <= 18
    assert "6 amis" in hard["text"]


def test_free_chat_does_not_exist():
    assert client.post("/v1/companion/chat", json={}).status_code == 422


def test_recommendations_target_least_developed_categories():
    body = client.post(
        "/v1/recommendations/missions",
        json={
            "category_xp": {"LOGIC": 500, "READING": 400, "SPORT": 0, "HELPING": 10},
            "templates": [
                {"id": "math", "category": "LOGIC"},
                {"id": "sport", "category": "SPORT"},
                {"id": "draw", "category": "CREATIVITY"},
                {"id": "help", "category": "HELPING"},
            ],
            "limit": 2,
        },
    ).json()
    ids = [s["template_id"] for s in body["suggestions"]]
    assert ids == ["draw", "sport"] or ids == ["sport", "draw"]


def test_engine_key_is_enforced(monkeypatch):
    monkeypatch.setenv("ENGINE_API_KEY", "secret")
    assert client.post("/v1/companion/joke", json={}).status_code == 401
    ok = client.post("/v1/companion/joke", json={}, headers={"x-engine-key": "secret"})
    assert ok.status_code == 200
