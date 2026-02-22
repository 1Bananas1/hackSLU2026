"""
Session routes — /api/sessions

Endpoints:
    POST  /api/sessions                       — start a new session
    PATCH /api/sessions/<id>/end              — end an active session
    GET   /api/sessions/<id>/hazards          — hazards recorded in a session
"""

from flask import Blueprint, jsonify, request

from src.api.services.session_service import create_session, end_session, get_session
from src.api.services.hazard_service import get_hazards_by_session

sessions_bp = Blueprint("sessions", __name__)


def _session_to_json(session) -> dict:
    def _iso(dt):
        return dt.isoformat() if dt else None

    return {
        "id": session.id,
        "device_id": session.device_id,
        "status": session.status,
        "start_time": _iso(session.created_at),
        "end_time": _iso(session.ended_at),
        "hazard_count": session.hazard_count,
    }


def _hazard_to_json(hazard) -> dict:
    return {
        "id": hazard.id,
        "event_type": hazard.event_type,
        "confidence": hazard.confidence,
        "labels": hazard.labels,
        "bboxes": hazard.bboxes,
        "session_id": getattr(hazard, "session_id", None),
        "timestamp": hazard.timestamp.isoformat() if hazard.timestamp else None,
        "frame_number": hazard.frame_number,
        "status": hazard.status,
    }


@sessions_bp.post("/api/sessions")
def api_create_session():
    payload = request.get_json(silent=True) or {}
    device_id = payload.get("device_id", "mobile")
    session = create_session(device_id=device_id)
    return jsonify(_session_to_json(session)), 201


@sessions_bp.patch("/api/sessions/<session_id>/end")
def api_end_session(session_id: str):
    session = get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    end_session(session_id)
    updated = get_session(session_id)
    return jsonify(_session_to_json(updated))


@sessions_bp.get("/api/sessions/<session_id>/hazards")
def api_get_session_hazards(session_id: str):
    hazards = get_hazards_by_session(session_id)
    return jsonify([_hazard_to_json(h) for h in hazards])
