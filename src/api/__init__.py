"""
Flask application factory for the HackSLU2026 backend API.

Usage:
    from src.api import create_app

    app = create_app()
    app.run(debug=True)

Environment variables:
    CORS_ORIGINS  — comma-separated allowed origins for CORS
                    (default: "*" for local development; tighten for production)
    ENCRYPTION_KEY — required Fernet key; validated at startup
"""

import os

from flask import Flask, jsonify
from flask_cors import CORS

from src.database.config import initialize_firebase
from src.database.services.encryption import validate_encryption_key

from .routes import register_routes


def create_app() -> Flask:
    # ── Firebase ──────────────────────────────────────────────────────────────
    # Initialise the Admin SDK once at startup so every request has Firestore
    # available.  Raises FileNotFoundError on missing service-account key.
    initialize_firebase()

    # ── Encryption key validation ─────────────────────────────────────────────
    # Fail loudly at boot if ENCRYPTION_KEY is absent rather than discovering
    # the problem only when a city-report endpoint is first hit.
    validate_encryption_key()

    app = Flask(__name__)

    # ── CORS ──────────────────────────────────────────────────────────────────
    # Allow configurable origins via env var.  Defaults to "*" for local dev.
    # Set CORS_ORIGINS=https://a.com,https://b.com in production (comma-separated).
    cors_origins_raw = os.getenv("CORS_ORIGINS", "*")
    cors_origins = cors_origins_raw.split(",") if cors_origins_raw != "*" else "*"
    CORS(app, origins=cors_origins)

    # ── Routes ────────────────────────────────────────────────────────────────
    register_routes(app)

    @app.get("/")
    def health():
        return jsonify({"status": "ok", "service": "HackSLU2026 API"})

    return app
