"""
Flask application factory for the HackSLU2026 backend API.

Usage:
    from src.api import create_app

    app = create_app()
    app.run(debug=True)
"""

from flask import Flask, jsonify

from .routes import register_routes


def create_app() -> Flask:
    app = Flask(__name__)

    register_routes(app)

    @app.get("/")
    def health():
        return jsonify({"status": "ok", "service": "HackSLU2026 API"})

    return app
