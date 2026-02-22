"""
Firebase configuration and app initialization.

Reads configuration from environment variables (or a .env file):
    FIREBASE_KEY_PATH        — path to the service account JSON key
                               (defaults to 'serviceAccountKey.json')
    FIREBASE_STORAGE_BUCKET  — Firebase Storage bucket name
                               (e.g. 'your-project.appspot.com')

Usage:
    Call initialize_firebase() once at startup — safe to call multiple times.
"""

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]

# Optional: load .env if python-dotenv is installed
try:
    from dotenv import load_dotenv  # type: ignore
except ModuleNotFoundError:  # pragma: no cover
    load_dotenv = None

if load_dotenv:
    load_dotenv(PROJECT_ROOT / ".env")
    load_dotenv()


def initialize_firebase() -> None:
    """Initialize the Firebase Admin SDK (no-op if already initialized)."""
    try:
        import firebase_admin  # type: ignore
        from firebase_admin import credentials  # type: ignore
    except ModuleNotFoundError as exc:  # pragma: no cover
        raise RuntimeError(
            "firebase_admin is not installed. Install firebase-admin to use Firebase."
        ) from exc

    # Check if already initialized using the proper method
    try:
        firebase_admin.get_app()
        return  # Already initialized
    except ValueError:
        pass  # Not initialized, proceed

    key_path = os.getenv("FIREBASE_KEY_PATH")
    resolved_key_path = (
        Path(key_path) if key_path else PROJECT_ROOT / "serviceAccountKey.json"
    )

    if not resolved_key_path.exists():
        raise FileNotFoundError(
            f"Firebase service account key not found at '{resolved_key_path}'. "
            "Set the FIREBASE_KEY_PATH environment variable or place "
            f"serviceAccountKey.json in '{PROJECT_ROOT}'."
        )

    cred = credentials.Certificate(str(resolved_key_path))

    options = {}
    storage_bucket = os.getenv("FIREBASE_STORAGE_BUCKET")
    if storage_bucket:
        options["storageBucket"] = storage_bucket

    firebase_admin.initialize_app(cred, options)
