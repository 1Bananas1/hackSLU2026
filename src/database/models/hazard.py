from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

HAZARD_TTL_HOURS = 24


@dataclass
class Hazard:
    # --- compat with tests / older API ---
    session_id: str = ""

    # --- new/current ownership ---
    user_uid: str = ""

    confidence: float = 0.0
    labels: List[str] = field(default_factory=list)
    bboxes: List[Dict] = field(default_factory=list)
    frame_number: int = 0
    event_type: str = ""
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    photo_url: Optional[str] = None
    location: Optional[Dict[str, float]] = None  # {"lat": ..., "lng": ...}
    status: str = "pending"  # "pending" | "reported" | "dismissed"
    expires_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc) + timedelta(hours=HAZARD_TTL_HOURS)
    )
    id: Optional[str] = None  # populated after Firestore write

    def __post_init__(self) -> None:
        if not self.event_type and self.labels:
            self.event_type = self.labels[0]

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "user_uid": self.user_uid,
            "confidence": self.confidence,
            "labels": self.labels or ([self.event_type] if self.event_type else []),
            "bboxes": self.bboxes or [],
            "frame_number": self.frame_number,
            "event_type": self.event_type,
            "timestamp": self.timestamp,
            "photo_url": self.photo_url,
            "location": self.location,
            "status": self.status,
            "expires_at": self.expires_at,
        }

    @classmethod
    def from_dict(cls, data: dict, doc_id: Optional[str] = None) -> "Hazard":
        labels = data.get("labels") or []
        event_type = data.get("event_type") or (labels[0] if labels else "")

        return cls(
            session_id=data.get("session_id", ""),
            user_uid=data.get("user_uid", ""),
            confidence=float(data.get("confidence", 0.0)),
            labels=labels,
            bboxes=data.get("bboxes") or [],
            frame_number=int(data.get("frame_number", 0)),
            event_type=event_type,
            timestamp=data.get("timestamp", datetime.now(timezone.utc)),
            photo_url=data.get("photo_url"),
            location=data.get("location"),
            status=data.get("status", "pending"),
            expires_at=data.get(
                "expires_at",
                datetime.now(timezone.utc) + timedelta(hours=HAZARD_TTL_HOURS),
            ),
            id=doc_id,
        )
