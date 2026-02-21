"""
CRUD operations for the 'hazards' Firestore collection.

Henry's Flask routes should call these functions directly — never touch `db` from outside
this service layer.

Typical usage from the Flask backend:

    from src.database.services import save_hazard, get_hazards_by_session
    from src.database.models import Hazard

    hazard = Hazard(
        confidence=0.82,
        bboxes=[[120, 200, 300, 380]],
        labels=["pothole"],
        session_id=session_id,
        frame_number=frame_number,
    )
    hazard_id = save_hazard(hazard)
"""

from typing import List, Optional

from google.cloud.firestore import Query

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


def get_hazards_by_session(session_id: str) -> List[Hazard]:
    """
    Return all hazards belonging to a session, ordered by timestamp ascending.
    Requires a composite index on (session_id ASC, timestamp ASC) — Firestore
    will print a direct link to create it on the first query if it is missing.
    """
    docs = (
        db.collection(COLLECTION)
        .where("session_id", "==", session_id)
        .order_by("timestamp", direction=Query.ASCENDING)
        .stream()
    )
    return [Hazard.from_dict(doc.to_dict(), doc.id) for doc in docs]


def get_all_hazards() -> List[Hazard]:
    """Return every hazard in the collection, newest first."""
    docs = (
        db.collection(COLLECTION)
        .order_by("timestamp", direction=Query.DESCENDING)
        .stream()
    )
    return [Hazard.from_dict(doc.to_dict(), doc.id) for doc in docs]


def delete_hazard(hazard_id: str) -> None:
    """Permanently delete a hazard document."""
    db.collection(COLLECTION).document(hazard_id).delete()
