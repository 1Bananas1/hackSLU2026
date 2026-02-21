"""
Smoke tests for the /hazards API routes.

Run from the repo root:
    pytest src/api/tests/ -v

All Firebase and Firestore calls are mocked so no real credentials are needed.
"""

import json
from functools import wraps
from unittest.mock import MagicMock, patch

import pytest
from flask import g

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
    """Fake Bearer token header — require_auth is patched to pass through."""
    return {"Authorization": "Bearer test-token", "Content-Type": "application/json"}


def _mock_require_auth(f):
    """Auth stub that bypasses Firebase token verification and sets g.user."""
    @wraps(f)
    def decorated(*args, **kwargs):
        g.user = {"uid": "test-uid-123", "email": "test@example.com"}
        return f(*args, **kwargs)
    return decorated


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_hazard(
    hazard_id="hazard-1",
    session_id="session-1",
    status="pending",
):
    from src.database.models.hazard import Hazard
    h = Hazard(
        session_id=session_id,
        confidence=0.87,
        labels=["pothole"],
        bboxes=[{"x1": 0.1, "y1": 0.55, "x2": 0.4, "y2": 0.80}],
        frame_number=42,
        status=status,
    )
    h.id = hazard_id
    return h


# ---------------------------------------------------------------------------
# POST /hazards
# ---------------------------------------------------------------------------

class TestCreateHazard:
    def test_returns_201_with_valid_payload(self, client):
        mock_session = MagicMock()
        mock_hazard = _mock_hazard()

        with (
            patch("src.api.routes.hazards.require_auth", _mock_require_auth),
            patch("src.api.routes.hazards.get_session", return_value=mock_session),
            patch("src.api.routes.hazards.save_hazard", return_value="hazard-1"),
            patch("src.api.routes.hazards.increment_hazard_count"),
        ):
            resp = client.post(
                "/hazards",
                data=json.dumps({
                    "session_id": "session-1",
                    "confidence": 0.87,
                    "labels": ["pothole"],
                    "bboxes": [{"x1": 0.1, "y1": 0.55, "x2": 0.4, "y2": 0.80}],
                    "frame_number": 42,
                }),
                headers=_auth_headers(),
            )
        assert resp.status_code == 201
        body = resp.get_json()
        assert body["id"] == "hazard-1"
        assert body["event_type"] == "pothole"
        assert body["labels"] == ["pothole"]

    def test_missing_required_fields_returns_400(self, client):
        with patch("src.api.auth.require_auth", lambda f: f):
            resp = client.post(
                "/hazards",
                data=json.dumps({"session_id": "session-1"}),
                headers=_auth_headers(),
            )
        assert resp.status_code == 400
        assert "confidence" in resp.get_json()["error"]

    def test_unknown_session_returns_404(self, client):
        with (
            patch("src.api.routes.hazards.require_auth", _mock_require_auth),
            patch("src.api.routes.hazards.get_session", return_value=None),
        ):
            resp = client.post(
                "/hazards",
                data=json.dumps({
                    "session_id": "nonexistent",
                    "confidence": 0.5,
                    "labels": ["pothole"],
                }),
                headers=_auth_headers(),
            )
        assert resp.status_code == 404

    def test_event_type_derived_from_labels(self, client):
        """event_type must be set to labels[0] even if not sent explicitly."""
        mock_session = MagicMock()
        with (
            patch("src.api.routes.hazards.require_auth", _mock_require_auth),
            patch("src.api.routes.hazards.get_session", return_value=mock_session),
            patch("src.api.routes.hazards.save_hazard", return_value="h-1"),
            patch("src.api.routes.hazards.increment_hazard_count"),
        ):
            resp = client.post(
                "/hazards",
                data=json.dumps({
                    "session_id": "session-1",
                    "confidence": 0.6,
                    "labels": ["alligator cracking"],
                }),
                headers=_auth_headers(),
            )
        assert resp.status_code == 201
        assert resp.get_json()["event_type"] == "alligator cracking"


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
                data=json.dumps({
                    "reporter_name": "Jane Doe",
                    "reporter_email": "jane@example.com",
                }),
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
                data=json.dumps({
                    "reporter_name": "Jane",
                    "reporter_email": "jane@example.com",
                }),
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
