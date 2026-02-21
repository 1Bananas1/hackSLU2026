"""
Firebase configuration and app initialization.

Reads the path to the service account key from the FIREBASE_KEY_PATH
environment variable (defaults to 'serviceAccountKey.json' in the repo root).

Usage:
    Set FIREBASE_KEY_PATH in a .env file or in your shell before running.
    Call initialize_firebase() once at startup — safe to call multiple times.
"""

import os
from pathlib import Path

import firebase_admin
from dotenv import load_dotenv
from firebase_admin import credentials

PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv()


def initialize_firebase() -> None:
    """Initialize the Firebase Admin SDK (no-op if already initialized)."""
    if firebase_admin._apps:
        return

    key_path = os.getenv("FIREBASE_KEY_PATH")
    resolved_key_path = Path(key_path) if key_path else PROJECT_ROOT / "serviceAccountKey.json"

    if not resolved_key_path.exists():
        raise FileNotFoundError(
            f"Firebase service account key not found at '{resolved_key_path}'. "
            "Set the FIREBASE_KEY_PATH environment variable or place "
            f"serviceAccountKey.json in '{PROJECT_ROOT}'."
        )

    cred = credentials.Certificate(str(resolved_key_path))
    firebase_admin.initialize_app(cred)
