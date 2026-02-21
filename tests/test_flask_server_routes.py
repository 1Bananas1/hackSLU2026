from types import SimpleNamespace

import pytest

import src.flask_server as flask_server


@pytest.fixture
def client(monkeypatch):
    flask_server.app.config["TESTING"] = True
    monkeypatch.setattr(flask_server, "SERVICE_IMPORT_ERROR", None)
    return flask_server.app.test_client()


def test_health_endpoint_ok(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


def test_create_session_success(client, monkeypatch):
    created = SimpleNamespace(
        id="session-1",
        device_id="webcam_0",
        start_time=None,
        end_time=None,
        hazard_count=0,
        status="active",
    )
    monkeypatch.setattr(flask_server, "create_session", lambda device_id: created)

    response = client.post("/sessions", json={"device_id": "webcam_0"})

    assert response.status_code == 201
    payload = response.get_json()
    assert payload["id"] == "session-1"
    assert payload["device_id"] == "webcam_0"


def test_get_unknown_session_returns_404(client, monkeypatch):
    monkeypatch.setattr(flask_server, "get_session", lambda _session_id: None)

    response = client.get("/sessions/missing")

    assert response.status_code == 404
    assert response.get_json()["error"] == "Session not found"


def test_create_hazard_missing_fields_returns_400(client):
    response = client.post("/hazards", json={"session_id": "s1"})

    assert response.status_code == 400
    assert "Missing required fields" in response.get_json()["error"]


def test_create_hazard_success(client, monkeypatch):
    calls = {"incremented": False}

    session = SimpleNamespace(id="session-1")
    hazard = SimpleNamespace(
        id="hazard-1",
        session_id="session-1",
        event_type="pothole",
        confidence=0.92,
        labels=["pothole"],
        bboxes=[],
        frame_number=7,
        timestamp=None,
        photo_url=None,
        location=None,
        status="pending",
    )

    monkeypatch.setattr(flask_server, "get_session", lambda _session_id: session)
    monkeypatch.setattr(flask_server, "save_hazard", lambda _hazard: "hazard-1")
    monkeypatch.setattr(flask_server, "get_hazard", lambda _hazard_id: hazard)

    def _increment(_session_id):
        calls["incremented"] = True

    monkeypatch.setattr(flask_server, "increment_hazard_count", _increment)

    response = client.post(
        "/hazards",
        json={
            "session_id": "session-1",
            "labels": ["pothole"],
            "confidence": 0.92,
            "frame_number": 7,
        },
    )

    assert response.status_code == 201
    payload = response.get_json()
    assert payload["id"] == "hazard-1"
    assert payload["event_type"] == "pothole"
    assert calls["incremented"] is True