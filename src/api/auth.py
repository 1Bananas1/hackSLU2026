"""
Firebase Auth middleware.

Provides `require_auth`, a decorator that verifies a Firebase ID token
from the Authorization header and injects the decoded token into Flask's
request context as `g.user`.

In TESTING mode, auth is bypassed so unit tests can run without Firebase.
"""

from __future__ import annotations

from functools import wraps
from typing import Any, Callable, Optional, TypeVar

from flask import current_app, g, jsonify, request

F = TypeVar("F", bound=Callable[..., Any])


def _extract_token() -> Optional[str]:
    """Pull the Bearer token out of the Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[len("Bearer ") :]
    return None


def require_auth(f: F) -> F:
    """
    Decorator that enforces Firebase ID token authentication.

    On success: sets g.user to the decoded token dict (keys: uid, email, …).
    On failure: returns 401 JSON with an error message.

    In Flask TESTING mode: bypasses verification and sets a fake user.
    """

    @wraps(f)
    def decorated(*args, **kwargs):
        # ✅ Unit tests: bypass Firebase auth entirely
        if current_app and current_app.config.get("TESTING"):
            g.user = {"uid": "test-uid-123", "email": "test@example.com"}
            return f(*args, **kwargs)

        token = _extract_token()
        if not token:
            return jsonify({"error": "Missing Authorization header"}), 401

        # Import lazily so tests/CI don't require firebase-admin unless needed
        try:
            import firebase_admin.auth as firebase_auth  # type: ignore
        except ModuleNotFoundError:
            return jsonify({"error": "Authentication unavailable"}), 401

        try:
            decoded = firebase_auth.verify_id_token(token)
        except Exception:
            return jsonify({"error": "Authentication failed"}), 401

        g.user = decoded
        return f(*args, **kwargs)

    return decorated  # type: ignore[return-value]
