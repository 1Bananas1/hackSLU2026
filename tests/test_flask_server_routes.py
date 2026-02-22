from types import SimpleNamespace

import pytest

TEST_UID = "test-uid-123"


def _mock_hazard(hazard_id="hazard-1", user_uid=TEST_UID, status="pending"):
    return SimpleNamespace(
        id=hazard_id,
        user_uid=user_uid,
        event_type="pothole",
        confidence=0.92,
        labels=["pothole"],
        bboxes=[],
        frame_number=7,
        timestamp=None,
        photo_url=None,
        location=None,
        status=status,
    )


@pytest.fixture
def app(monkeypatch):
    # Prevent Firebase initialization and encryption key validation during tests.
    monkeypatch.setattr("src.api.initialize_firebase", lambda: None)
    monkeypatch.setattr("src.api.validate_encryption_key", lambda: None)
    from src.api import create_app

    flask_app = create_app()
    flask_app.config["TESTING"] = True
    return flask_app


@pytest.fixture
def client(app):
    return app.test_client()


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


def test_health_endpoint_ok(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.get_json()["status"] == "ok"


# ---------------------------------------------------------------------------
# POST /hazards — validation
# ---------------------------------------------------------------------------


def test_create_hazard_missing_fields_returns_400(client):
    # No body at all — missing both confidence and labels
    response = client.post("/hazards", json={})

    assert response.status_code == 400
    assert "Missing required fields" in response.get_json()["error"]


def test_create_hazard_rejects_client_user_uid(client, monkeypatch):
    # Client should never be able to set user_uid
    response = client.post(
        "/hazards",
        json={
            "labels": ["pothole"],
            "confidence": 0.80,
            "user_uid": "attacker-uid",
        },
    )

    assert response.status_code == 400
    assert "user_uid" in response.get_json()["error"]


def test_create_hazard_forces_pending_status(client, monkeypatch):
    # Even if client sends a different status, result must be "pending"
    monkeypatch.setattr("src.api.routes.hazards.save_hazard", lambda _h: "hazard-1")

    response = client.post(
        "/hazards",
        json={
            "labels": ["pothole"],
            "confidence": 0.80,
            "status": "reported",  # attempt to skip "pending"
        },
    )

    assert response.status_code == 201
    payload = response.get_json()
    assert payload["status"] == "pending"


# ---------------------------------------------------------------------------
# POST /hazards — success
# ---------------------------------------------------------------------------


def test_create_hazard_success(client, monkeypatch):
    monkeypatch.setattr("src.api.routes.hazards.save_hazard", lambda _hazard: "hazard-1")

    response = client.post(
        "/hazards",
        json={
            "labels": ["pothole"],
            "confidence": 0.92,
            "frame_number": 7,
        },
    )

    assert response.status_code == 201
    payload = response.get_json()
    assert payload["id"] == "hazard-1"
    assert payload["event_type"] == "pothole"
    assert payload["user_uid"] == TEST_UID
    assert payload["status"] == "pending"


# ---------------------------------------------------------------------------
# DELETE /hazards/<id> — ownership enforcement
# ---------------------------------------------------------------------------


def test_delete_hazard_forbidden_for_non_owner(client, monkeypatch):
    # Hazard owned by a different user
    other_hazard = _mock_hazard(user_uid="another-user-uid")
    monkeypatch.setattr("src.api.routes.hazards.get_hazard", lambda _id: other_hazard)

    response = client.delete("/hazards/hazard-1")

    assert response.status_code == 403
    assert response.get_json()["error"] == "Forbidden"


def test_delete_hazard_success(client, monkeypatch):
    hazard = _mock_hazard()  # user_uid matches TESTING uid "test-uid-123"
    monkeypatch.setattr("src.api.routes.hazards.get_hazard", lambda _id: hazard)

    deleted = {"called": False}

    def _delete(_id):
        deleted["called"] = True

    monkeypatch.setattr("src.api.routes.hazards.delete_hazard", _delete)

    response = client.delete("/hazards/hazard-1")

    assert response.status_code == 200
    assert deleted["called"] is True
