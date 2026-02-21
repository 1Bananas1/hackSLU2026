"""
Hazard document model.

Represents a single pothole or road hazard detection event.
Maps 1-to-1 with a document in the Firestore 'hazards' collection.

Fields sourced directly from the ML model's trigger_alert() output:
    confidence   — fraction of sliding-window frames that fired (0.0 – 1.0)
    bboxes       — list of [x1, y1, x2, y2] pixel coordinates
    labels       — list of label strings from Florence-2 (e.g. ["pothole"])
    frame_number — absolute frame index in the video/webcam stream
    timestamp    — UTC datetime of detection
    session_id   — Firestore document ID of the parent Session
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional


@dataclass
class Hazard:
    confidence: float
    bboxes: List[List[float]]
    labels: List[str]
    session_id: str
    timestamp: datetime = field(default_factory=datetime.utcnow)
    frame_number: int = 0
    id: Optional[str] = None  # populated after Firestore write

    def to_dict(self) -> dict:
        """Serialize to a plain dict suitable for Firestore."""
        return {
            "confidence": self.confidence,
            "bboxes": [
                {"x1": b[0], "y1": b[1], "x2": b[2], "y2": b[3]} for b in self.bboxes
            ],
            "labels": self.labels,
            "session_id": self.session_id,
            "timestamp": self.timestamp,
            "frame_number": self.frame_number,
        }

    @classmethod
    def from_dict(cls, data: dict, doc_id: Optional[str] = None) -> "Hazard":
        """Deserialize from a Firestore document dict."""
        raw_bboxes = data["bboxes"]
        bboxes = (
            [[b["x1"], b["y1"], b["x2"], b["y2"]] for b in raw_bboxes]
            if raw_bboxes and isinstance(raw_bboxes[0], dict)
            else raw_bboxes
        )
        return cls(
            confidence=data["confidence"],
            bboxes=bboxes,
            labels=data["labels"],
            session_id=data["session_id"],
            timestamp=data.get("timestamp", datetime.utcnow()),
            frame_number=data.get("frame_number", 0),
            id=doc_id,
        )
