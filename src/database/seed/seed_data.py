"""
Seed Firestore with realistic sample data for local development and testing.

Run from the repo root:
    python -m src.database.seed.seed_data

Creates two hazard documents owned by a test user UID.
Safe to run multiple times — each run creates new, independent documents.
"""

import sys
import os
from datetime import datetime, timedelta, timezone

# Allow running as a top-level script from the repo root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

from src.database.models.hazard import Hazard
from src.database.services.hazard_service import save_hazard
from src.database.services.user_service import upsert_user

# A stable fake UID that represents a test user.
# Replace with a real Firebase Auth UID to seed data for an actual account.
TEST_USER_UID = "seed-test-user-uid"

SAMPLE_HAZARDS = [
    {
        "event_type": "pothole",
        "labels": ["pothole"],
        "confidence": 0.85,
        "location": {"lat": 38.6270, "lng": -90.1994},
        "photo_url": None,
        "offset_seconds": 0,
    },
    {
        "event_type": "crack",
        "labels": ["crack"],
        "confidence": 0.72,
        "location": {"lat": 38.6275, "lng": -90.1998},
        "photo_url": None,
        "offset_seconds": 5,
    },
]


def seed() -> None:
    print(f"[SEED] Upserting user document for uid={TEST_USER_UID!r} ...")
    upsert_user(
        uid=TEST_USER_UID,
        email="seed@test.com",
        display_name="Seed Test User",
    )
    print(f"[SEED] User upserted: users/{TEST_USER_UID}")

    print(f"[SEED] Writing hazards ...")
    base_time = datetime.now(timezone.utc)

    for sample in SAMPLE_HAZARDS:
        hazard = Hazard(
            user_uid=TEST_USER_UID,
            event_type=sample["event_type"],
            labels=sample["labels"],
            confidence=sample["confidence"],
            location=sample["location"],
            photo_url=sample["photo_url"],
            timestamp=base_time + timedelta(seconds=sample["offset_seconds"]),
        )
        hazard_id = save_hazard(hazard)
        print(f"[SEED] Hazard saved: {hazard_id}  ({sample['event_type']})")

    print("[SEED] Done.")


if __name__ == "__main__":
    seed()
