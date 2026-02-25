from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from ..client import db

SESSION_TTL_HOURS = 24


@dataclass
class Session:
    id: str
    device_id: str
    status: str = "active"  # "active" | "ended"
    created_at: datetime = datetime.now(timezone.utc)
    ended_at: Optional[datetime] = None
    hazard_count: int = 0
    expires_at: datetime = datetime.now(timezone.utc)


SESSIONS_COLLECTION = "sessions"


def create_session(device_id: str) -> Session:
    """
    Create a new session document in Firestore.
    """
    doc_ref = db.collection(SESSIONS_COLLECTION).document()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=SESSION_TTL_HOURS)
    data = {
        "device_id": device_id,
        "status": "active",
        "created_at": now,
        "ended_at": None,
        "hazard_count": 0,
        "expires_at": expires_at,
    }
    doc_ref.set(data)
    return Session(
        id=doc_ref.id,
        device_id=device_id,
        status="active",
        created_at=now,
        hazard_count=0,
        expires_at=expires_at,
    )


def get_session(session_id: str) -> Optional[Session]:
    """
    Fetch a session by ID. Returns None if missing.
    """
    snap = db.collection(SESSIONS_COLLECTION).document(session_id).get()
    if not snap.exists:
        return None

    data = snap.to_dict() or {}
    return Session(
        id=snap.id,
        device_id=data.get("device_id", ""),
        status=data.get("status", "active"),
        created_at=data.get("created_at") or datetime.now(timezone.utc),
        ended_at=data.get("ended_at"),
        hazard_count=int(data.get("hazard_count", 0)),
        expires_at=data.get("expires_at") or datetime.now(timezone.utc),
    )


def increment_hazard_count(session_id: str) -> None:
    """
    Increment hazard_count for the session.
    """
    doc_ref = db.collection(SESSIONS_COLLECTION).document(session_id)
    snap = doc_ref.get()
    if not snap.exists:
        return

    data = snap.to_dict() or {}
    current = int(data.get("hazard_count", 0))
    doc_ref.update({"hazard_count": current + 1})


def end_session(session_id: str) -> None:
    """
    Mark session ended.
    """
    doc_ref = db.collection(SESSIONS_COLLECTION).document(session_id)
    if not doc_ref.get().exists:
        return
    doc_ref.update({"status": "ended", "ended_at": datetime.now(timezone.utc)})


def get_all_sessions() -> list[Session]:
    """Return all sessions, newest first."""
    docs = db.collection(SESSIONS_COLLECTION).stream()
    sessions = []
    for doc in docs:
        data = doc.to_dict() or {}
        sessions.append(
            Session(
                id=doc.id,
                device_id=data.get("device_id", ""),
                status=data.get("status", "active"),
                created_at=data.get("created_at") or datetime.now(timezone.utc),
                ended_at=data.get("ended_at"),
                hazard_count=int(data.get("hazard_count", 0)),
                expires_at=data.get("expires_at") or datetime.now(timezone.utc),
            )
        )
    sessions.sort(key=lambda s: s.created_at, reverse=True)
    return sessions
