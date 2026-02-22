from datetime import datetime
from flask import Flask, jsonify, request
import os

from database.models.hazard import Hazard

SERVICE_IMPORT_ERROR = None
try:
    from database.services import (
        create_session,
        delete_hazard,
        end_session,
        get_all_hazards,
        get_all_sessions,
        get_hazard,
        get_hazards_by_session,
        get_session,
        increment_hazard_count,
        save_hazard,
    )
except Exception as exc:  # pragma: no cover - startup safeguard
    SERVICE_IMPORT_ERROR = str(exc)

app = Flask(__name__)


def _iso(value):
    if isinstance(value, datetime):
        return value.isoformat() + "Z"
    return value


def _session_to_json(session):
    return {
        "id": session.id,
        "device_id": session.device_id,
        "start_time": _iso(session.start_time),
        "end_time": _iso(session.end_time),
        "hazard_count": session.hazard_count,
        "status": session.status,
    }


def _hazard_to_json(hazard):
    labels = getattr(hazard, "labels", None) or []
    event_type = getattr(hazard, "event_type", None) or (labels[0] if labels else None)

    return {
        "id": hazard.id,
        "event_type": event_type,
        "confidence": hazard.confidence,
        "bboxes": getattr(hazard, "bboxes", []) or [],
        "labels": labels,
        "session_id": hazard.session_id,
        "timestamp": _iso(hazard.timestamp),
        "frame_number": hazard.frame_number,
    }


def _service_ready():
    return SERVICE_IMPORT_ERROR is None


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = (
        "GET, POST, PATCH, DELETE, OPTIONS"
    )
    return response


@app.route("/api/<path:_>", methods=["OPTIONS"])
def options_handler(_):
    return ("", 204)


@app.get("/")
def home():
    return jsonify({"message": "Flask server is running", "api_base": "/api"})


@app.get("/health")
def health():
    if _service_ready():
        return jsonify({"status": "ok"})
    return jsonify({"status": "degraded", "error": SERVICE_IMPORT_ERROR}), 500


@app.get("/api/health")
def api_health():
    return health()


@app.post("/api/sessions")
def api_create_session():
    if not _service_ready():
        return jsonify({"error": SERVICE_IMPORT_ERROR}), 500
    payload = request.get_json(silent=True) or {}
    device_id = payload.get("device_id", "webcam_0")
    session = create_session(device_id=device_id)
    return jsonify(_session_to_json(session)), 201


@app.get("/api/sessions")
def api_get_sessions():
    if not _service_ready():
        return jsonify({"error": SERVICE_IMPORT_ERROR}), 500
    sessions = get_all_sessions()
    return jsonify([_session_to_json(s) for s in sessions])


@app.get("/api/sessions/<session_id>")
def api_get_session(session_id):
    if not _service_ready():
        return jsonify({"error": SERVICE_IMPORT_ERROR}), 500
    session = get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    return jsonify(_session_to_json(session))


@app.patch("/api/sessions/<session_id>/end")
def api_end_session(session_id):
    if not _service_ready():
        return jsonify({"error": SERVICE_IMPORT_ERROR}), 500
    session = get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    end_session(session_id)
    updated = get_session(session_id)
    return jsonify(_session_to_json(updated))


@app.get("/api/hazards")
def api_get_hazards():
    if not _service_ready():
        return jsonify({"error": SERVICE_IMPORT_ERROR}), 500
    session_id = request.args.get("session_id")
    hazards = get_hazards_by_session(session_id) if session_id else get_all_hazards()
    return jsonify([_hazard_to_json(h) for h in hazards])


@app.get("/api/sessions/<session_id>/hazards")
def api_get_session_hazards(session_id):
    if not _service_ready():
        return jsonify({"error": SERVICE_IMPORT_ERROR}), 500
    hazards = get_hazards_by_session(session_id)
    return jsonify([_hazard_to_json(h) for h in hazards])


@app.post("/api/hazards")
def api_create_hazard():
    if not _service_ready():
        return jsonify({"error": SERVICE_IMPORT_ERROR}), 500
    payload = request.get_json(silent=True) or {}

    required = ["confidence", "labels", "session_id"]
    missing = [field for field in required if field not in payload]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    session = get_session(payload["session_id"])
    if not session:
        return jsonify({"error": "Session not found"}), 404

    hazard = Hazard(
        confidence=float(payload["confidence"]),
        bboxes=payload.get("bboxes", []),
        labels=payload["labels"],
        session_id=payload["session_id"],
        frame_number=int(payload.get("frame_number", 0)),
    )
    hazard_id = save_hazard(hazard)
    increment_hazard_count(payload["session_id"])

    saved = get_hazard(hazard_id)
    return jsonify(_hazard_to_json(saved)), 201


@app.delete("/api/hazards/<hazard_id>")
def api_delete_hazard(hazard_id):
    if not _service_ready():
        return jsonify({"error": SERVICE_IMPORT_ERROR}), 500
    hazard = get_hazard(hazard_id)
    if not hazard:
        return jsonify({"error": "Hazard not found"}), 404
    delete_hazard(hazard_id)
    return jsonify({"deleted": True, "hazard_id": hazard_id})


# ---------------------------------------------------------------------------
# Route aliases (tests expect non-/api paths)
# ---------------------------------------------------------------------------


@app.post("/sessions")
def create_session_alias():
    return api_create_session()


@app.get("/sessions")
def get_sessions_alias():
    return api_get_sessions()


@app.get("/sessions/<session_id>")
def get_session_alias(session_id):
    return api_get_session(session_id)


@app.patch("/sessions/<session_id>/end")
def end_session_alias(session_id):
    return api_end_session(session_id)


@app.get("/hazards")
def get_hazards_alias():
    return api_get_hazards()


@app.post("/hazards")
def create_hazard_alias():
    return api_create_hazard()


@app.delete("/hazards/<hazard_id>")
def delete_hazard_alias(hazard_id):
    return api_delete_hazard(hazard_id)


if __name__ == "__main__":
    host = os.getenv("FLASK_HOST", "0.0.0.0")
    port = int(os.getenv("FLASK_PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    app.run(host=host, port=port, debug=debug)
