"""
Firebase configuration and app initialization.

Reads configuration from environment variables (or a .env file):
    FIREBASE_KEY_PATH        — path to the service account JSON key
                               (defaults to 'serviceAccountKey.json')
    FIREBASE_STORAGE_BUCKET  — Firebase Storage bucket name
                               (e.g. 'your-project.appspot.com')

Usage:
    Set variables in a .env file or in your shell before running.
    Call initialize_firebase() once at startup — safe to call multiple times.
"""

import os

import firebase_admin
from dotenv import load_dotenv
from firebase_admin import credentials

load_dotenv()


def initialize_firebase() -> None:
    """Initialize the Firebase Admin SDK (no-op if already initialized)."""
    if firebase_admin._apps:
        return

    key_path = os.getenv("FIREBASE_KEY_PATH", "serviceAccountKey.json")

    if not os.path.exists(key_path):
        raise FileNotFoundError(
            f"Firebase service account key not found at '{key_path}'. "
            "Set the FIREBASE_KEY_PATH environment variable or place "
            "serviceAccountKey.json in the repo root."
        )

    cred = credentials.Certificate(key_path)

    options = {}
    storage_bucket = os.getenv("FIREBASE_STORAGE_BUCKET")
    if storage_bucket:
        options["storageBucket"] = storage_bucket

    firebase_admin.initialize_app(cred, options)
