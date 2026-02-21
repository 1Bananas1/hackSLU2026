import logging
from datetime import datetime
from flask import Flask, jsonify, request
import os

from database.models.hazard import Hazard

# ---------------------------------------------------------------------------
# Logging setup — prints every request and button press to the console
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("vigilane")

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
    log.info("Database services imported successfully")
except Exception as exc:  # pragma: no cover - startup safeguard
    SERVICE_IMPORT_ERROR = str(exc)
    log.error("Failed to import database services: %s", exc)

app = Flask(__name__)


# ---------------------------------------------------------------------------
# Request / response logging middleware
# ---------------------------------------------------------------------------
@app.before_request
def log_request():
    log.info(">>> %s %s  (from %s)", request.method, request.path, request.remote_addr)
    if request.is_json:
        log.debug("    Body: %s", request.get_json(silent=True))
    if request.args:
        log.debug("    Query: %s", dict(request.args))


@app.after_request
def log_and_cors(response):
    log.info("<<< %s %s => %s", request.method, request.path, response.status)
    # CORS headers
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
    return response


# Catch-all error handler so CORS headers are always present (even on 500s)
@app.errorhandler(Exception)
def handle_exception(e):
    log.exception("Unhandled exception on %s %s", request.method, request.path)
    response = jsonify({"error": str(e)})
    response.status_code = 500
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
    return response


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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
    return {
        "id": hazard.id,
        "session_id": hazard.session_id,
        "event_type": hazard.event_type,
        "confidence": hazard.confidence,
        "labels": hazard.labels or [hazard.event_type],
        "bboxes": hazard.bboxes or [],
        "frame_number": hazard.frame_number,
        "timestamp": _iso(hazard.timestamp),
        "photo_url": hazard.photo_url,
        "location": hazard.location,
        "status": hazard.status,
    }


def _service_ready():
    return SERVICE_IMPORT_ERROR is None


# ---------------------------------------------------------------------------
# CORS preflight
# ---------------------------------------------------------------------------
@app.route("/<path:_>", methods=["OPTIONS"])
def options_handler(_):
    return ("", 204)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/")
def home():
    log.debug("Health check hit")
    return jsonify({"message": "Flask server is running", "api_base": "/api"})


@app.get("/health")
def health():
    if _service_ready():
        return jsonify({"status": "ok"})
    return jsonify({"status": "degraded", "error": SERVICE_IMPORT_ERROR}), 500


@app.get("/api/health")
def api_health():
    return health()


# ---------------------------------------------------------------------------
# Sessions  —  /sessions  (matches frontend api.ts)
# ---------------------------------------------------------------------------

@app.post("/sessions")
def api_create_session():
    if not _service_ready():
        return jsonify({"error": SERVICE_IMPORT_ERROR}), 500
    payload = request.get_json(silent=True) or {}
    device_id = payload.get("device_id", "webcam_0")
    log.info("[SESSION] Creating session for device '%s'", device_id)
    session = create_session(device_id=device_id)
    log.info("[SESSION] Created session %s", session.id)
    return jsonify(_session_to_json(session)), 201


@app.get("/sessions")
def api_get_sessions():
    if not _service_ready():
        return jsonify({"error": SERVICE_IMPORT_ERROR}), 500
    log.info("[SESSION] Listing all sessions")
    sessions = get_all_sessions()
    log.debug("[SESSION] Found %d sessions", len(sessions))
    return jsonify([_session_to_json(s) for s in sessions])


@app.get("/sessions/<session_id>")
def api_get_session(session_id):
    if not _service_ready():
        return jsonify({"error": SERVICE_IMPORT_ERROR}), 500
    log.info("[SESSION] Fetching session %s", session_id)
    session = get_session(session_id)
    if not session:
        log.warning("[SESSION] Session %s not found", session_id)
        return jsonify({"error": "Session not found"}), 404
    return jsonify(_session_to_json(session))


@app.post("/sessions/<session_id>/end")
def api_end_session(session_id):
    if not _service_ready():
        return jsonify({"error": SERVICE_IMPORT_ERROR}), 500
    log.info("[SESSION] Ending session %s", session_id)
    session = get_session(session_id)
    if not session:
        log.warning("[SESSION] Session %s not found", session_id)
        return jsonify({"error": "Session not found"}), 404
    end_session(session_id)
    log.info("[SESSION] Session %s ended successfully", session_id)
    updated = get_session(session_id)
    return jsonify({"message": "Session ended", "session_id": session_id, **_session_to_json(updated)})


# ---------------------------------------------------------------------------
# Hazards  —  /hazards  (matches frontend api.ts)
# ---------------------------------------------------------------------------

@app.get("/hazards")
def api_get_hazards():
    if not _service_ready():
        return jsonify({"error": SERVICE_IMPORT_ERROR}), 500
    session_id = request.args.get("session_id")
    if session_id:
        log.info("[HAZARD] Listing hazards for session %s", session_id)
        hazards = get_hazards_by_session(session_id)
    else:
        log.info("[HAZARD] Listing ALL hazards")
        hazards = get_all_hazards()
    log.debug("[HAZARD] Found %d hazards", len(hazards))
    return jsonify([_hazard_to_json(h) for h in hazards])


@app.get("/sessions/<session_id>/hazards")
def api_get_session_hazards(session_id):
    if not _service_ready():
        return jsonify({"error": SERVICE_IMPORT_ERROR}), 500
    log.info("[HAZARD] Listing hazards for session %s", session_id)
    hazards = get_hazards_by_session(session_id)
    log.debug("[HAZARD] Found %d hazards for session %s", len(hazards), session_id)
    return jsonify([_hazard_to_json(h) for h in hazards])


@app.get("/hazards/<hazard_id>")
def api_get_hazard(hazard_id):
    if not _service_ready():
        return jsonify({"error": SERVICE_IMPORT_ERROR}), 500
    log.info("[HAZARD] Fetching hazard %s", hazard_id)
    hazard = get_hazard(hazard_id)
    if not hazard:
        log.warning("[HAZARD] Hazard %s not found", hazard_id)
        return jsonify({"error": "Hazard not found"}), 404
    return jsonify(_hazard_to_json(hazard))


@app.post("/hazards")
def api_create_hazard():
    if not _service_ready():
        return jsonify({"error": SERVICE_IMPORT_ERROR}), 500
    payload = request.get_json(silent=True) or {}

    # Accept both frontend format (labels/bboxes) and blueprint format (event_type)
    labels = payload.get("labels", [])
    event_type = payload.get("event_type") or (labels[0] if labels else None)

    required_present = payload.get("session_id") and payload.get("confidence") is not None and event_type
    if not required_present:
        missing = []
        if not payload.get("session_id"):
            missing.append("session_id")
        if payload.get("confidence") is None:
            missing.append("confidence")
        if not event_type:
            missing.append("labels or event_type")
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    session = get_session(payload["session_id"])
    if not session:
        log.warning("[HAZARD] Parent session %s not found", payload["session_id"])
        return jsonify({"error": "Session not found"}), 404

    hazard = Hazard(
        session_id=payload["session_id"],
        event_type=event_type,
        confidence=float(payload["confidence"]),
        labels=labels,
        bboxes=payload.get("bboxes", []),
        frame_number=int(payload.get("frame_number", 0)),
        photo_url=payload.get("photo_url"),
        location=payload.get("location"),
        status=payload.get("status", "pending"),
    )
    log.info("[HAZARD] Creating hazard: type=%s conf=%.2f session=%s frame=%d",
             event_type, hazard.confidence, hazard.session_id, hazard.frame_number)
    hazard_id = save_hazard(hazard)
    increment_hazard_count(payload["session_id"])
    log.info("[HAZARD] Created hazard %s", hazard_id)

    saved = get_hazard(hazard_id)
    return jsonify(_hazard_to_json(saved)), 201


@app.delete("/hazards/<hazard_id>")
def api_delete_hazard(hazard_id):
    if not _service_ready():
        return jsonify({"error": SERVICE_IMPORT_ERROR}), 500
    log.info("[HAZARD] Deleting hazard %s", hazard_id)
    hazard = get_hazard(hazard_id)
    if not hazard:
        log.warning("[HAZARD] Hazard %s not found", hazard_id)
        return jsonify({"error": "Hazard not found"}), 404
    delete_hazard(hazard_id)
    log.info("[HAZARD] Hazard %s deleted", hazard_id)
    return jsonify({"message": "Hazard deleted", "hazard_id": hazard_id})


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    host = os.getenv("FLASK_HOST", "0.0.0.0")
    port = int(os.getenv("FLASK_PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "true").lower() == "true"
    log.info("Starting Vigilane Flask server on %s:%d (debug=%s)", host, port, debug)
    app.run(host=host, port=port, debug=debug)
