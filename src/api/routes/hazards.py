"""
Hazard routes — /hazards and /sessions/<id>/hazards

All endpoints require a valid Firebase ID token
(Authorization: Bearer <token>).

Endpoints:
    POST   /hazards                         — record a new hazard
    GET    /hazards                         — list all hazards (newest first)
    GET    /hazards/<id>                    — fetch one hazard
    DELETE /hazards/<id>                    — delete a hazard
    GET    /sessions/<id>/hazards           — hazards for a session (asc by time)
"""

from flask import Blueprint, jsonify, request

from src.api.auth import require_auth
from src.database.models.hazard import Hazard
from src.database.services.hazard_service import (
    delete_hazard,
    get_all_hazards,
    get_hazard,
    get_hazards_by_session,
    save_hazard,
)
from src.database.services.session_service import (
    get_session,
    increment_hazard_count,
)

hazards_bp = Blueprint("hazards", __name__)


@hazards_bp.post("/hazards")
@require_auth
def create_hazard():
    """
    Record a new hazard and atomically increment its parent session's count.

    Body (JSON):
    {
        "session_id":   "abc123",
        "confidence":   0.85,
        "labels":       ["pothole"],
        "bboxes":       [{"x1": 120, "y1": 200, "x2": 300, "y2": 380}],
        "frame_number": 50        (optional, defaults to 0)
    }
    """
    data = request.get_json(silent=True) or {}

    required = ("session_id", "confidence", "labels", "bboxes")
    missing = [k for k in required if k not in data]
    if missing:
        return jsonify({"error": f"Missing required fields: {missing}"}), 400

    session_id = data["session_id"]
    if get_session(session_id) is None:
        return jsonify({"error": "Parent session not found"}), 404

    hazard = Hazard(
        session_id=session_id,
        confidence=float(data["confidence"]),
        labels=data["labels"],
        bboxes=data["bboxes"],
        frame_number=int(data.get("frame_number", 0)),
    )

    hazard_id = save_hazard(hazard)
    increment_hazard_count(session_id)

    return jsonify({"id": hazard_id, **_hazard_to_json(hazard)}), 201


@hazards_bp.get("/hazards")
@require_auth
def list_hazards():
    """Return all hazards, newest first."""
    hazards = get_all_hazards()
    return jsonify([_hazard_to_json(h) for h in hazards])


@hazards_bp.get("/hazards/<hazard_id>")
@require_auth
def fetch_hazard(hazard_id: str):
    """Return a single hazard by ID."""
    hazard = get_hazard(hazard_id)
    if hazard is None:
        return jsonify({"error": "Hazard not found"}), 404
    return jsonify(_hazard_to_json(hazard))


@hazards_bp.delete("/hazards/<hazard_id>")
@require_auth
def remove_hazard(hazard_id: str):
    """Permanently delete a hazard document."""
    if get_hazard(hazard_id) is None:
        return jsonify({"error": "Hazard not found"}), 404
    delete_hazard(hazard_id)
    return jsonify({"message": "Hazard deleted", "hazard_id": hazard_id})


@hazards_bp.get("/sessions/<session_id>/hazards")
@require_auth
def list_hazards_for_session(session_id: str):
    """Return all hazards for a session, ordered by timestamp ascending."""
    if get_session(session_id) is None:
        return jsonify({"error": "Session not found"}), 404
    hazards = get_hazards_by_session(session_id)
    return jsonify([_hazard_to_json(h) for h in hazards])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _hazard_to_json(hazard) -> dict:
    return {
        "id": hazard.id,
        "session_id": hazard.session_id,
        "confidence": hazard.confidence,
        "labels": hazard.labels,
        "bboxes": hazard.bboxes,
        "frame_number": hazard.frame_number,
        "timestamp": hazard.timestamp.isoformat() if hazard.timestamp else None,
    }
