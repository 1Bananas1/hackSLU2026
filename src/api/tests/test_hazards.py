"""
Smoke tests for the /hazards API routes.

Run from the repo root:
    pytest src/api/tests/ -v

All Firebase and Firestore calls are mocked so no real credentials are needed.
"""

import json
from functools import wraps
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from flask import g

TEST_UID = "test-uid-123"

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def app():
    """Create a test Flask app with Firebase and Firestore mocked out."""
    with (
        patch("src.api.initialize_firebase"),
        patch("src.api.validate_encryption_key"),
        patch("flask_cors.CORS"),
    ):
        from src.api import create_app

        flask_app = create_app()
        flask_app.config["TESTING"] = True
        yield flask_app


@pytest.fixture
def client(app):
    return app.test_client()


def _auth_headers():
    """Fake Bearer token header — require_auth is bypassed in TESTING mode."""
    return {"Authorization": "Bearer test-token", "Content-Type": "application/json"}


def _mock_require_auth(f):
    """Auth stub that bypasses Firebase token verification and sets g.user."""

    @wraps(f)
    def decorated(*args, **kwargs):
        g.user = {"uid": TEST_UID, "email": "test@example.com"}
        return f(*args, **kwargs)

    return decorated


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mock_hazard(
    hazard_id="hazard-1",
    user_uid=TEST_UID,
    status="pending",
):
    return SimpleNamespace(
        id=hazard_id,
        user_uid=user_uid,
        event_type="pothole",
        confidence=0.87,
        labels=["pothole"],
        bboxes=[{"x1": 0.1, "y1": 0.55, "x2": 0.4, "y2": 0.80}],
        frame_number=42,
        timestamp=None,
        photo_url=None,
        location=None,
        status=status,
    )


# ---------------------------------------------------------------------------
# POST /hazards
# ---------------------------------------------------------------------------


class TestCreateHazard:
    def test_returns_201_with_valid_payload(self, client):
        with (
            patch("src.api.routes.hazards.require_auth", _mock_require_auth),
            patch("src.api.routes.hazards.save_hazard", return_value="hazard-1"),
        ):
            resp = client.post(
                "/hazards",
                data=json.dumps(
                    {
                        "confidence": 0.87,
                        "labels": ["pothole"],
                        "bboxes": [{"x1": 0.1, "y1": 0.55, "x2": 0.4, "y2": 0.80}],
                        "frame_number": 42,
                    }
                ),
                headers=_auth_headers(),
            )
        assert resp.status_code == 201
        body = resp.get_json()
        assert body["id"] == "hazard-1"
        assert body["event_type"] == "pothole"
        assert body["labels"] == ["pothole"]
        assert body["user_uid"] == TEST_UID
        assert body["status"] == "pending"

    def test_missing_required_fields_returns_400(self, client):
        with patch("src.api.routes.hazards.require_auth", _mock_require_auth):
            resp = client.post(
                "/hazards",
                data=json.dumps({}),
                headers=_auth_headers(),
            )
        assert resp.status_code == 400
        assert "Missing required fields" in resp.get_json()["error"]

    def test_rejects_client_provided_user_uid(self, client):
        with patch("src.api.routes.hazards.require_auth", _mock_require_auth):
            resp = client.post(
                "/hazards",
                data=json.dumps(
                    {
                        "confidence": 0.5,
                        "labels": ["pothole"],
                        "user_uid": "attacker-uid",
                    }
                ),
                headers=_auth_headers(),
            )
        assert resp.status_code == 400
        assert "user_uid" in resp.get_json()["error"]

    def test_event_type_derived_from_labels(self, client):
        """event_type must be set to labels[0] even if not sent explicitly."""
        with (
            patch("src.api.routes.hazards.require_auth", _mock_require_auth),
            patch("src.api.routes.hazards.save_hazard", return_value="h-1"),
        ):
            resp = client.post(
                "/hazards",
                data=json.dumps(
                    {
                        "confidence": 0.6,
                        "labels": ["alligator cracking"],
                    }
                ),
                headers=_auth_headers(),
            )
        assert resp.status_code == 201
        assert resp.get_json()["event_type"] == "alligator cracking"

    def test_status_always_pending_on_create(self, client):
        """Client-provided status must be ignored — always forced to 'pending'."""
        with (
            patch("src.api.routes.hazards.require_auth", _mock_require_auth),
            patch("src.api.routes.hazards.save_hazard", return_value="h-1"),
        ):
            resp = client.post(
                "/hazards",
                data=json.dumps(
                    {
                        "confidence": 0.6,
                        "labels": ["pothole"],
                        "status": "reported",
                    }
                ),
                headers=_auth_headers(),
            )
        assert resp.status_code == 201
        assert resp.get_json()["status"] == "pending"


# ---------------------------------------------------------------------------
# POST /hazards/<id>/dismiss
# ---------------------------------------------------------------------------


class TestDismissHazard:
    def test_dismisses_pending_hazard(self, client):
        mock_hazard = _mock_hazard(status="pending")
        with (
            patch("src.api.routes.hazards.require_auth", _mock_require_auth),
            patch("src.api.routes.hazards.get_hazard", return_value=mock_hazard),
            patch("src.api.routes.hazards.update_hazard_status") as mock_update,
        ):
            resp = client.post("/hazards/hazard-1/dismiss", headers=_auth_headers())
        assert resp.status_code == 200
        mock_update.assert_called_once_with("hazard-1", "dismissed")

    def test_cannot_dismiss_already_dismissed(self, client):
        mock_hazard = _mock_hazard(status="dismissed")
        with (
            patch("src.api.routes.hazards.require_auth", _mock_require_auth),
            patch("src.api.routes.hazards.get_hazard", return_value=mock_hazard),
        ):
            resp = client.post("/hazards/hazard-1/dismiss", headers=_auth_headers())
        assert resp.status_code == 409

    def test_cannot_dismiss_reported_hazard(self, client):
        mock_hazard = _mock_hazard(status="reported")
        with (
            patch("src.api.routes.hazards.require_auth", _mock_require_auth),
            patch("src.api.routes.hazards.get_hazard", return_value=mock_hazard),
        ):
            resp = client.post("/hazards/hazard-1/dismiss", headers=_auth_headers())
        assert resp.status_code == 409

    def test_dismiss_nonexistent_hazard_returns_404(self, client):
        with (
            patch("src.api.routes.hazards.require_auth", _mock_require_auth),
            patch("src.api.routes.hazards.get_hazard", return_value=None),
        ):
            resp = client.post("/hazards/missing/dismiss", headers=_auth_headers())
        assert resp.status_code == 404

    def test_dismiss_forbidden_for_non_owner(self, client):
        mock_hazard = _mock_hazard(user_uid="another-user-uid", status="pending")
        with (
            patch("src.api.routes.hazards.require_auth", _mock_require_auth),
            patch("src.api.routes.hazards.get_hazard", return_value=mock_hazard),
        ):
            resp = client.post("/hazards/hazard-1/dismiss", headers=_auth_headers())
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST /hazards/<id>/report
# ---------------------------------------------------------------------------


class TestReportHazard:
    def test_reports_pending_hazard(self, client):
        mock_hazard = _mock_hazard(status="pending")
        with (
            patch("src.api.routes.hazards.require_auth", _mock_require_auth),
            patch("src.api.routes.hazards.get_hazard", return_value=mock_hazard),
            patch("src.api.routes.hazards.create_report", return_value="report-1"),
            patch("src.api.routes.hazards.update_hazard_status") as mock_update,
        ):
            resp = client.post(
                "/hazards/hazard-1/report",
                data=json.dumps(
                    {
                        "reporter_name": "Jane Doe",
                        "reporter_email": "jane@example.com",
                    }
                ),
                headers=_auth_headers(),
            )
        assert resp.status_code == 201
        body = resp.get_json()
        assert body["report_id"] == "report-1"
        mock_update.assert_called_once_with("hazard-1", "reported")

    def test_cannot_report_dismissed_hazard(self, client):
        mock_hazard = _mock_hazard(status="dismissed")
        with (
            patch("src.api.routes.hazards.require_auth", _mock_require_auth),
            patch("src.api.routes.hazards.get_hazard", return_value=mock_hazard),
        ):
            resp = client.post(
                "/hazards/hazard-1/report",
                data=json.dumps(
                    {
                        "reporter_name": "Jane",
                        "reporter_email": "jane@example.com",
                    }
                ),
                headers=_auth_headers(),
            )
        assert resp.status_code == 409

    def test_missing_reporter_email_returns_400(self, client):
        mock_hazard = _mock_hazard(status="pending")
        with (
            patch("src.api.routes.hazards.require_auth", _mock_require_auth),
            patch("src.api.routes.hazards.get_hazard", return_value=mock_hazard),
        ):
            resp = client.post(
                "/hazards/hazard-1/report",
                data=json.dumps({"reporter_name": "Jane"}),
                headers=_auth_headers(),
            )
        assert resp.status_code == 400
