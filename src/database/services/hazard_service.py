"""
CRUD operations for the 'hazards' Firestore collection.

Flask routes should call these functions directly — never touch `db` from outside
this service layer.

Typical usage from the Flask backend:

    from src.database.services.hazard_service import save_hazard, get_hazards_by_user
    from src.database.models.hazard import Hazard

    hazard = Hazard(
        user_uid=g.user["uid"],
        confidence=0.85,
        labels=["pothole"],
        photo_url="https://storage.googleapis.com/...",
        location={"lat": 38.627, "lng": -90.199},
    )
    hazard_id = save_hazard(hazard)
"""

from datetime import datetime
from typing import List, Optional

from ..client import db
from ..models.hazard import Hazard

COLLECTION = "hazards"


def save_hazard(hazard: Hazard) -> str:
    """
    Write a Hazard to Firestore. Populates hazard.id with the new document ID.
    Returns the document ID.
    """
    doc_ref = db.collection(COLLECTION).document()
    doc_ref.set(hazard.to_dict())
    hazard.id = doc_ref.id
    return doc_ref.id


def get_hazard(hazard_id: str) -> Optional[Hazard]:
    """Fetch a single Hazard by its document ID. Returns None if not found."""
    doc = db.collection(COLLECTION).document(hazard_id).get()
    if not doc.exists:
        return None
    return Hazard.from_dict(doc.to_dict(), doc.id)


def get_hazards_by_user(user_uid: str) -> List[Hazard]:
    """Return all hazards owned by a user, newest first."""
    docs = (
        db.collection(COLLECTION)
        .where("user_uid", "==", user_uid)
        .stream()
    )
    hazards = [Hazard.from_dict(doc.to_dict(), doc.id) for doc in docs]
    hazards.sort(key=lambda h: h.timestamp or datetime.min, reverse=True)
    return hazards


def get_hazards_by_session(session_id: str) -> List[Hazard]:
    """Return all hazards for a session, newest first."""
    docs = (
        db.collection(COLLECTION)
        .where("session_id", "==", session_id)
        .stream()
    )
    hazards = [Hazard.from_dict(doc.to_dict(), doc.id) for doc in docs]
    hazards.sort(key=lambda h: h.timestamp or datetime.min, reverse=True)
    return hazards


def delete_hazard(hazard_id: str) -> None:
    """Permanently delete a hazard document."""
    db.collection(COLLECTION).document(hazard_id).delete()


def update_hazard_status(hazard_id: str, status: str) -> None:
    """
    Update the status field of a hazard document.
    Valid values: "pending" | "reported" | "dismissed"
    """
    db.collection(COLLECTION).document(hazard_id).update({"status": status})
