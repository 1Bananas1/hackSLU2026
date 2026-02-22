"""
Hazard document model.

Represents a single road hazard detection event (pothole, crack, etc.).
Maps 1-to-1 with a document in the Firestore 'hazards' collection.

Fields:
    user_uid     — Firebase Auth UID of the user who created this hazard
    confidence   — model confidence score (0.0 – 1.0)
    labels       — list of class names detected in this frame (e.g. ["pothole"])
    bboxes       — normalised [0,1] bounding boxes [{"x1","y1","x2","y2"}, ...]
    frame_number — frame index within the detection run (0-based)
    event_type   — primary hazard category; derived from labels[0] when omitted
    timestamp    — UTC datetime of detection
    photo_url    — Firebase Storage URL of the frame snapshot
    location     — GPS coords at time of detection {"lat": ..., "lng": ...}
    status       — lifecycle state: "pending" | "reported" | "dismissed"
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional


@dataclass
class Hazard:
    user_uid: str
    confidence: float
    labels: List[str] = field(default_factory=list)
    bboxes: List[Dict] = field(default_factory=list)
    frame_number: int = 0
    # event_type is optional — defaults to labels[0] when not supplied
    event_type: str = ""
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    photo_url: Optional[str] = None
    location: Optional[Dict[str, float]] = None  # {"lat": ..., "lng": ...}
    status: str = "pending"  # "pending" | "reported" | "dismissed"
    id: Optional[str] = None  # populated after Firestore write

    def __post_init__(self) -> None:
        # Derive event_type from the first label if caller did not set it.
        if not self.event_type and self.labels:
            self.event_type = self.labels[0]

    def to_dict(self) -> dict:
        """Serialize to a plain dict suitable for Firestore."""
        return {
            "user_uid": self.user_uid,
            "confidence": self.confidence,
            "labels": self.labels or [self.event_type],
            "bboxes": self.bboxes or [],
            "frame_number": self.frame_number,
            "event_type": self.event_type,
            "timestamp": self.timestamp,
            "photo_url": self.photo_url,
            "location": self.location,
            "status": self.status,
        }

    @classmethod
    def from_dict(cls, data: dict, doc_id: Optional[str] = None) -> "Hazard":
        """Deserialize from a Firestore document dict."""
        labels = data.get("labels") or []
        # Back-compat: old docs may only have event_type, not labels.
        event_type = data.get("event_type") or (labels[0] if labels else "")
        return cls(
            user_uid=data["user_uid"],
            confidence=data["confidence"],
            labels=labels,
            bboxes=data.get("bboxes") or [],
            frame_number=data.get("frame_number", 0),
            event_type=event_type,
            timestamp=data.get("timestamp", datetime.now(timezone.utc)),
            photo_url=data.get("photo_url"),
            location=data.get("location"),
            status=data.get("status", "pending"),
            id=doc_id,
        )
