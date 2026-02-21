"""
CRUD operations for the 'sessions' Firestore collection.

A Session is created when a dashcam recording starts and closed when it ends.
Hazard count is incremented atomically on the server side via Firestore's
Increment transform — safe under concurrent writes.

Typical usage from the Flask backend:

    from src.database.services import create_session, end_session, increment_hazard_count

    session = create_session(device_id="webcam_0")
    # ... during detection loop ...
    increment_hazard_count(session.id)
    # ... on shutdown ...
    end_session(session.id)
"""

from datetime import datetime
from typing import List, Optional

from google.cloud.firestore import Query
from google.cloud.firestore_v1 import Increment

from ..client import db
from ..models.session import Session

COLLECTION = "sessions"


def create_session(device_id: str) -> Session:
    """
    Create and persist a new Session. Returns the Session with its id populated.
    Call this once when the dashcam feed starts.
    """
    session = Session(device_id=device_id)
    doc_ref = db.collection(COLLECTION).document()
    doc_ref.set(session.to_dict())
    session.id = doc_ref.id
    return session


def get_session(session_id: str) -> Optional[Session]:
    """Fetch a single Session by document ID. Returns None if not found."""
    doc = db.collection(COLLECTION).document(session_id).get()
    if not doc.exists:
        return None
    return Session.from_dict(doc.to_dict(), doc.id)


def end_session(session_id: str) -> None:
    """
    Mark a session as completed and record its end time.
    Call this when the dashcam feed stops.
    """
    db.collection(COLLECTION).document(session_id).update(
        {
            "end_time": datetime.utcnow(),
            "status": "completed",
        }
    )


def increment_hazard_count(session_id: str) -> None:
    """
    Atomically increment the session's hazard_count by 1.
    Call this each time save_hazard() succeeds so totals stay in sync.
    """
    db.collection(COLLECTION).document(session_id).update(
        {"hazard_count": Increment(1)}
    )


def get_all_sessions() -> List[Session]:
    """Return all sessions, newest first."""
    docs = (
        db.collection(COLLECTION)
        .order_by("start_time", direction=Query.DESCENDING)
        .stream()
    )
    return [Session.from_dict(doc.to_dict(), doc.id) for doc in docs]
