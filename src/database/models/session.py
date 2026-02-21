"""
Session document model.

Represents a single dashcam recording session (from app launch to stop).
Maps 1-to-1 with a document in the Firestore 'sessions' collection.

Fields:
    device_id     — identifier for the camera source (e.g. "webcam_0", "dashcam.mp4")
    start_time    — UTC datetime when the session began
    end_time      — UTC datetime when the session ended (None while active)
    hazard_count  — total hazards detected in this session (incremented on each save)
    status        — "active" while running, "completed" after end_session() is called
    id            — Firestore document ID, populated after write
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class Session:
    device_id: str
    start_time: datetime = field(default_factory=datetime.utcnow)
    end_time: Optional[datetime] = None
    hazard_count: int = 0
    status: str = "active"  # "active" | "completed"
    id: Optional[str] = None  # populated after Firestore write

    def to_dict(self) -> dict:
        """Serialize to a plain dict suitable for Firestore."""
        return {
            "device_id": self.device_id,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "hazard_count": self.hazard_count,
            "status": self.status,
        }

    @classmethod
    def from_dict(cls, data: dict, doc_id: Optional[str] = None) -> "Session":
        """Deserialize from a Firestore document dict."""
        return cls(
            device_id=data["device_id"],
            start_time=data.get("start_time", datetime.utcnow()),
            end_time=data.get("end_time"),
            hazard_count=data.get("hazard_count", 0),
            status=data.get("status", "active"),
            id=doc_id,
        )
