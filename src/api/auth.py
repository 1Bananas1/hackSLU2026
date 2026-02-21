"""
Firebase Auth middleware.

Provides `require_auth`, a decorator that verifies a Firebase ID token
from the Authorization header and injects the decoded token into Flask's
request context as `g.user`.

Usage:
    from src.api.auth import require_auth

    @app.route("/protected")
    @require_auth
    def protected():
        uid = g.user["uid"]
        ...

The client must send:
    Authorization: Bearer <firebase-id-token>
"""

from functools import wraps

import firebase_admin.auth as firebase_auth
from flask import g, jsonify, request

from src.database.config import initialize_firebase

# Ensure Firebase is initialized before any auth calls.
initialize_firebase()


def _extract_token() -> str | None:
    """Pull the Bearer token out of the Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[len("Bearer "):]
    return None


def require_auth(f):
    """
    Decorator that enforces Firebase ID token authentication.

    On success: sets g.user to the decoded token dict (keys: uid, email, …).
    On failure: returns 401 JSON with an error message.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = _extract_token()
        if not token:
            return jsonify({"error": "Missing Authorization header"}), 401

        try:
            decoded = firebase_auth.verify_id_token(token)
        except firebase_auth.ExpiredIdTokenError:
            return jsonify({"error": "Token has expired"}), 401
        except firebase_auth.RevokedIdTokenError:
            return jsonify({"error": "Token has been revoked"}), 401
        except firebase_auth.InvalidIdTokenError:
            return jsonify({"error": "Invalid token"}), 401
        except Exception:
            return jsonify({"error": "Authentication failed"}), 401

        g.user = decoded
        return f(*args, **kwargs)

    return decorated
