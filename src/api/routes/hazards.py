"""
Hazard routes — /hazards

All endpoints require a valid Firebase ID token
(Authorization: Bearer <token>).

Endpoints:
    POST   /hazards                     — record a new hazard (ownership from auth token)
    GET    /hazards                     — list the requesting user's hazards (newest first)
    GET    /hazards/<id>                — fetch one hazard
    DELETE /hazards/<id>                — delete a hazard (owner only)
    POST   /hazards/<id>/dismiss        — mark a hazard dismissed (owner only)
    POST   /hazards/<id>/report         — submit a formal city report (encrypts PII)

POST /hazards accepts:
    {
        "confidence":   0.85,
        "labels":       ["pothole"],          (list of YOLO class names, required)
        "bboxes":       [{"x1":0.1,...}],     (normalised [0,1] bounding boxes, optional)
        "frame_number": 0,                    (optional)
        "photo_url":    "https://...",        (optional)
        "location":     {"lat":38.6,"lng":-90.2},  (optional)
    }
    event_type is derived automatically as labels[0].
    user_uid is set server-side from the auth token — never accepted from the client.
    status is always forced to "pending" on creation.
"""

from flask import Blueprint, g, jsonify, request

from src.api.auth import require_auth
from src.database.models.hazard import Hazard
from src.database.services.hazard_service import (
    delete_hazard,
    get_hazard,
    get_hazards_by_user,
    save_hazard,
    update_hazard_status,
)
from src.database.services.report_service import create_report

hazards_bp = Blueprint("hazards", __name__)


@hazards_bp.post("/hazards")
@require_auth
def create_hazard():
    """
    Record a new hazard. user_uid is extracted from the auth token — the client
    must not include it in the request body.
    """
    data = request.get_json(silent=True) or {}

    # Reject any attempt to set ownership from the client.
    if "user_uid" in data:
        return jsonify({"error": "user_uid must not be provided by the client"}), 400

    required = ("confidence", "labels")
    missing = [k for k in required if k not in data]
    if missing:
        return jsonify({"error": f"Missing required fields: {missing}"}), 400

    # Validate confidence is a number in [0.0, 1.0].
    try:
        confidence = float(data["confidence"])
    except (TypeError, ValueError):
        return jsonify({"error": "confidence must be a number"}), 400
    if not (0.0 <= confidence <= 1.0):
        return jsonify({"error": "confidence must be between 0.0 and 1.0"}), 400

    # Validate labels is a non-empty list of strings.
    labels = data["labels"]
    if not isinstance(labels, list) or len(labels) == 0:
        return jsonify({"error": "labels must be a non-empty list"}), 400

    # Validate location ranges if provided.
    location = data.get("location")
    if location is not None:
        lat = location.get("lat")
        lng = location.get("lng")
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            return jsonify(
                {"error": "location.lat and location.lng must be numbers"}
            ), 400
        if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
            return jsonify({"error": "location out of valid range"}), 400

    hazard = Hazard(
        user_uid=g.user["uid"],  # always from auth token
        confidence=confidence,
        labels=labels,
        bboxes=data.get("bboxes", []),
        frame_number=int(data.get("frame_number", 0)),
        event_type=data.get(
            "event_type", ""
        ),  # derived from labels[0] in __post_init__
        photo_url=data.get("photo_url"),
        location=location,
        status="pending",  # always forced; ignore client-provided status
    )

    hazard_id = save_hazard(hazard)

    return jsonify({**_hazard_to_json(hazard), "id": hazard_id}), 201


@hazards_bp.get("/hazards")
@require_auth
def list_hazards():
    """Return the authenticated user's hazards, newest first."""
    hazards = get_hazards_by_user(g.user["uid"])
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
    """Permanently delete a hazard document. Only the owner may delete."""
    hazard = get_hazard(hazard_id)
    if hazard is None:
        return jsonify({"error": "Hazard not found"}), 404
    if hazard.user_uid != g.user["uid"]:
        return jsonify({"error": "Forbidden"}), 403
    delete_hazard(hazard_id)
    return jsonify({"message": "Hazard deleted", "hazard_id": hazard_id})


@hazards_bp.post("/hazards/<hazard_id>/dismiss")
@require_auth
def dismiss_hazard(hazard_id: str):
    """
    Mark a hazard as dismissed — used when the driver denies the detection
    via voice confirmation. Only the owner may dismiss.

    Transitions status: "pending" -> "dismissed".
    A dismissed hazard cannot be reported to the city (POST /hazards/<id>/report
    will return 409).
    """
    hazard = get_hazard(hazard_id)
    if hazard is None:
        return jsonify({"error": "Hazard not found"}), 404
    if hazard.user_uid != g.user["uid"]:
        return jsonify({"error": "Forbidden"}), 403
    if hazard.status == "dismissed":
        return jsonify({"error": "Hazard is already dismissed"}), 409
    if hazard.status == "reported":
        return jsonify(
            {"error": "Cannot dismiss a hazard that has already been reported"}
        ), 409

    update_hazard_status(hazard_id, "dismissed")
    return jsonify({"message": "Hazard dismissed", "hazard_id": hazard_id})


@hazards_bp.post("/hazards/<hazard_id>/report")
@require_auth
def report_hazard(hazard_id: str):
    """
    Submit a formal city report for a hazard.

    Encrypts all PII (name, email, phone) with Fernet before writing to Firestore.
    Transitions the hazard status from "pending" -> "reported".
    Any authenticated user may report any hazard (community reporting).

    Body (JSON):
    {
        "reporter_name":  "Jane Doe",
        "reporter_email": "jane@example.com",
        "reporter_phone": "+1-314-555-0199"   (optional)
    }
    """
    hazard = get_hazard(hazard_id)
    if hazard is None:
        return jsonify({"error": "Hazard not found"}), 404
    if hazard.status == "dismissed":
        return jsonify({"error": "Cannot report a dismissed hazard"}), 409
    if hazard.status == "reported":
        return jsonify({"error": "Hazard has already been reported"}), 409

    data = request.get_json(silent=True) or {}
    required = ("reporter_name", "reporter_email")
    missing = [k for k in required if k not in data]
    if missing:
        return jsonify({"error": f"Missing required fields: {missing}"}), 400

    report_id = create_report(
        hazard_id=hazard_id,
        submitted_by_uid=g.user["uid"],
        reporter_name=data["reporter_name"],
        reporter_email=data["reporter_email"],
        reporter_phone=data.get("reporter_phone"),
    )

    update_hazard_status(hazard_id, "reported")

    return jsonify(
        {
            "message": "Report submitted",
            "report_id": report_id,
            "hazard_id": hazard_id,
        }
    ), 201


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _hazard_to_json(hazard) -> dict:
    return {
        "id": hazard.id,
        "user_uid": hazard.user_uid,
        "event_type": hazard.event_type,
        "confidence": hazard.confidence,
        "labels": hazard.labels,
        "bboxes": hazard.bboxes,
        "frame_number": hazard.frame_number,
        "timestamp": hazard.timestamp.isoformat() if hazard.timestamp else None,
        "photo_url": hazard.photo_url,
        "location": hazard.location,
        "status": hazard.status,
    }
