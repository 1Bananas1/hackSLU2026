"""
Hazard document model.

Represents a single road hazard detection event (pothole, crack, etc.).
Maps 1-to-1 with a document in the Firestore 'hazards' collection.

Fields:
    session_id   — Firestore document ID of the parent Session
    timestamp    — UTC datetime of detection
    event_type   — hazard category (e.g. "pothole", "crack")
    confidence   — fraction of sliding-window frames that fired (0.0 – 1.0)
    photo_url    — Firebase Storage URL of the frame snapshot
    location     — GPS coords at time of detection {"lat": ..., "lng": ...}
    status       — lifecycle state: "pending" | "reported" | "dismissed"
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Optional


@dataclass
class Hazard:
    session_id: str
    event_type: str
    confidence: float
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    photo_url: Optional[str] = None
    location: Optional[Dict[str, float]] = None  # {"lat": ..., "lng": ...}
    status: str = "pending"  # "pending" | "reported" | "dismissed"
    id: Optional[str] = None  # populated after Firestore write

    def to_dict(self) -> dict:
        """Serialize to a plain dict suitable for Firestore."""
        return {
            "session_id": self.session_id,
            "timestamp": self.timestamp,
            "event_type": self.event_type,
            "confidence": self.confidence,
            "photo_url": self.photo_url,
            "location": self.location,
            "status": self.status,
        }

    @classmethod
    def from_dict(cls, data: dict, doc_id: Optional[str] = None) -> "Hazard":
        """Deserialize from a Firestore document dict."""
        return cls(
            session_id=data["session_id"],
            event_type=data["event_type"],
            confidence=data["confidence"],
            timestamp=data.get("timestamp", datetime.now(timezone.utc)),
            photo_url=data.get("photo_url"),
            location=data.get("location"),
            status=data.get("status", "pending"),
            id=doc_id,
        )
