"""Register all API blueprints onto the Flask app."""

from flask import Flask

from .hazards import hazards_bp
from .sessions import sessions_bp


def register_routes(app: Flask) -> None:
    app.register_blueprint(hazards_bp)
    app.register_blueprint(sessions_bp)
