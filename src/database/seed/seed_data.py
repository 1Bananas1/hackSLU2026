"""
Seed Firestore with realistic sample data for local development and testing.

Run from the repo root:
    python -m src.database.seed.seed_data

Creates one session with two hazard detections, then closes the session.
Safe to run multiple times — each run creates a new, independent session.
"""

import sys
import os
from datetime import datetime, timedelta

# Allow running as a top-level script from the repo root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

from src.database.models.hazard import Hazard
from src.database.services.session_service import (
    create_session,
    end_session,
    increment_hazard_count,
)
from src.database.services.hazard_service import save_hazard


SAMPLE_HAZARDS = [
    {
        "confidence": 0.85,
        "bboxes": [[120, 200, 300, 380]],
        "labels": ["pothole"],
        "frame_number": 50,
        "offset_seconds": 0,
    },
    {
        "confidence": 0.72,
        "bboxes": [[400, 150, 560, 290]],
        "labels": ["crack"],
        "frame_number": 125,
        "offset_seconds": 5,
    },
]


def seed() -> None:
    print("[SEED] Creating test session...")
    session = create_session(device_id="webcam_0_seed")
    print(f"[SEED] Session created: {session.id}")

    base_time = datetime.utcnow()

    for sample in SAMPLE_HAZARDS:
        hazard = Hazard(
            confidence=sample["confidence"],
            bboxes=sample["bboxes"],
            labels=sample["labels"],
            session_id=session.id,
            timestamp=base_time + timedelta(seconds=sample["offset_seconds"]),
            frame_number=sample["frame_number"],
        )
        hazard_id = save_hazard(hazard)
        increment_hazard_count(session.id)
        print(f"[SEED] Hazard saved: {hazard_id}  ({sample['labels']})")

    end_session(session.id)
    print(f"[SEED] Session {session.id} closed. Done.")


if __name__ == "__main__":
    seed()
