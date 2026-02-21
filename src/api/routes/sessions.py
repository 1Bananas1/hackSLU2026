"""
Session routes — /sessions

All endpoints require a valid Firebase ID token
(Authorization: Bearer <token>).

Endpoints:
    POST   /sessions              — start a new session
    GET    /sessions              — list all sessions (newest first)
    GET    /sessions/<id>         — fetch one session
    POST   /sessions/<id>/end     — mark a session completed
"""

from flask import Blueprint, g, jsonify, request

from src.api.auth import require_auth
from src.database.services.session_service import (
    create_session,
    end_session,
    get_all_sessions,
    get_session,
)

sessions_bp = Blueprint("sessions", __name__, url_prefix="/sessions")


@sessions_bp.post("")
@require_auth
def start_session():
    """
    Body (JSON): { "device_id": "webcam_0" }
    Returns the new session document.
    """
    data = request.get_json(silent=True) or {}
    device_id = data.get("device_id")
    if not device_id:
        return jsonify({"error": "device_id is required"}), 400

    session = create_session(device_id=device_id)
    return jsonify(_session_to_json(session)), 201


@sessions_bp.get("")
@require_auth
def list_sessions():
    """Return all sessions, newest first."""
    sessions = get_all_sessions()
    return jsonify([_session_to_json(s) for s in sessions])


@sessions_bp.get("/<session_id>")
@require_auth
def fetch_session(session_id: str):
    """Return a single session by ID."""
    session = get_session(session_id)
    if session is None:
        return jsonify({"error": "Session not found"}), 404
    return jsonify(_session_to_json(session))


@sessions_bp.post("/<session_id>/end")
@require_auth
def close_session(session_id: str):
    """Mark the session as completed."""
    session = get_session(session_id)
    if session is None:
        return jsonify({"error": "Session not found"}), 404
    if session.status == "completed":
        return jsonify({"error": "Session is already completed"}), 409

    end_session(session_id)
    return jsonify({"message": "Session ended", "session_id": session_id})


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _session_to_json(session) -> dict:
    return {
        "id": session.id,
        "device_id": session.device_id,
        "status": session.status,
        "hazard_count": session.hazard_count,
        "start_time": session.start_time.isoformat() if session.start_time else None,
        "end_time": session.end_time.isoformat() if session.end_time else None,
    }
