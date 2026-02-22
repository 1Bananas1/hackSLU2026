"""
CRUD operations for the 'users' Firestore collection.

Documents are keyed by Firebase Auth UID (same as the document ID).

Schema:
    users/{uid}
        uid:          string     — Firebase Auth UID
        email:        string|null
        display_name: string|null
        photo_url:    string|null
        last_seen:    timestamp  — UTC, set/updated on every sign-in
"""

from datetime import datetime, timezone
from typing import Optional

from src.database.client import db

COLLECTION = "users"


def upsert_user(
    uid: str,
    email: Optional[str] = None,
    display_name: Optional[str] = None,
    photo_url: Optional[str] = None,
) -> None:
    """
    Create or update a user profile document at users/{uid}.

    Uses Firestore merge so existing fields not listed here are never removed.
    Typically called by the seed script or a future /users/me endpoint.
    """
    db.collection(COLLECTION).document(uid).set(
        {
            "uid": uid,
            "email": email,
            "display_name": display_name,
            "photo_url": photo_url,
            "last_seen": datetime.now(timezone.utc),
        },
        merge=True,
    )


def get_user(uid: str) -> Optional[dict]:
    """Fetch a user profile by UID. Returns None if not found."""
    doc = db.collection(COLLECTION).document(uid).get()
    return doc.to_dict() if doc.exists else None
