"""
Flask application factory for the HackSLU2026 backend API.
"""

import os

from flask import Flask, jsonify

try:
    from flask_cors import CORS  # type: ignore
except ModuleNotFoundError:  # pragma: no cover
    CORS = None

from src.database.config import initialize_firebase
from src.database.services.encryption import validate_encryption_key

from .routes import register_routes


def create_app() -> Flask:
    initialize_firebase()
    validate_encryption_key()

    app = Flask(__name__)

    cors_origins_raw = os.getenv("CORS_ORIGINS", "*")
    cors_origins = cors_origins_raw.split(",") if cors_origins_raw != "*" else "*"
    if CORS:
        CORS(app, origins=cors_origins)

    register_routes(app)

    @app.get("/")
    def health():
        return jsonify({"status": "ok", "service": "HackSLU2026 API"})

    return app
