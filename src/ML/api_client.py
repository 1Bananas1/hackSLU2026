"""
Hazard API Client for Pothole Detection ML pipeline
HackSLU 2026 - Vigilane

Thin HTTP wrapper around the Flask REST API for creating sessions
and persisting confirmed hazard detections.

Usage:
    client = HazardApiClient("http://127.0.0.1:5000", auth_token="<firebase-id-token>")
    session_id = client.create_session("webcam_0")
    hazard_id  = client.post_hazard(session_id, "pothole", confidence=0.85)
    client.end_session(session_id)

Auth note:
    The Flask API validates Firebase ID tokens.  Pass the token via
    --auth-token on the CLI, or set the VIGILANE_AUTH_TOKEN env variable.
    Without a valid token, all mutating calls will receive 401 and return None.
"""

import os
from typing import Optional

try:
    import requests

    _REQUESTS_AVAILABLE = True
except ImportError:
    _REQUESTS_AVAILABLE = False


class HazardApiClient:
    """
    Wraps the Vigilane REST API for session and hazard management.

    Args:
        base_url  (str): Base URL of the Flask backend, e.g. "http://127.0.0.1:5000".
        auth_token (str | None): Firebase ID token for Authorization header.
                                 Falls back to VIGILANE_AUTH_TOKEN env var.
        timeout   (int): Request timeout in seconds (default: 10).
    """

    def __init__(
        self,
        base_url: str,
        auth_token: Optional[str] = None,
        timeout: int = 10,
    ):
        if not _REQUESTS_AVAILABLE:
            raise RuntimeError("requests not installed. Run: pip install requests")

        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

        token = auth_token or os.getenv("VIGILANE_AUTH_TOKEN")
        self._headers = {"Content-Type": "application/json"}
        if token:
            self._headers["Authorization"] = f"Bearer {token}"
        else:
            print(
                "[API] Warning: No auth token provided. "
                "API calls requiring authentication will fail with 401."
            )

    # ------------------------------------------------------------------
    # Session management
    # ------------------------------------------------------------------

    def create_session(self, device_id: str) -> Optional[str]:
        """
        POST /sessions  →  returns the new session ID string, or None on error.
        """
        try:
            resp = requests.post(
                f"{self.base_url}/sessions",
                json={"device_id": device_id},
                headers=self._headers,
                timeout=self.timeout,
            )
            resp.raise_for_status()
            session_id = resp.json().get("id")
            print(f"[API] Session created: {session_id}")
            return session_id
        except requests.HTTPError as exc:
            print(
                f"[API] Failed to create session (HTTP {exc.response.status_code}): {exc}"
            )
            return None
        except Exception as exc:
            print(f"[API] Failed to create session: {exc}")
            return None

    def dismiss_hazard(self, hazard_id: str) -> bool:
        """
        POST /hazards/<id>/dismiss  →  returns True on success.

        Call this when the driver says "no" after a hazard was already
        written to the database (two-step confirmation flow).  In the
        current single-step flow the hazard is never created before
        confirmation, so this method is only needed if the caller chose
        to pre-create the hazard document.
        """
        try:
            resp = requests.post(
                f"{self.base_url}/hazards/{hazard_id}/dismiss",
                headers=self._headers,
                timeout=self.timeout,
            )
            resp.raise_for_status()
            print(f"[API] Hazard dismissed: {hazard_id}")
            return True
        except Exception as exc:
            print(f"[API] Failed to dismiss hazard {hazard_id}: {exc}")
            return False

    def end_session(self, session_id: str) -> bool:
        """
        POST /sessions/<id>/end  →  returns True on success.
        """
        try:
            resp = requests.post(
                f"{self.base_url}/sessions/{session_id}/end",
                headers=self._headers,
                timeout=self.timeout,
            )
            resp.raise_for_status()
            print(f"[API] Session ended: {session_id}")
            return True
        except Exception as exc:
            print(f"[API] Failed to end session {session_id}: {exc}")
            return False

    # ------------------------------------------------------------------
    # Hazard reporting
    # ------------------------------------------------------------------

    def post_hazard(
        self,
        session_id: str,
        event_type: str,
        confidence: float,
        labels: Optional[list] = None,
        photo_url: Optional[str] = None,
        location: Optional[dict] = None,
    ) -> Optional[str]:
        """
        POST /hazards  →  returns the new hazard ID string, or None on error.

        Args:
            session_id  : Active session ID returned by create_session().
            event_type  : Hazard type string, e.g. "pothole".
            confidence  : Float 0.0-1.0 from the ML sliding window.
            labels      : List of detected class names (defaults to [event_type]).
            photo_url   : Optional Firebase Storage URL for the frame snapshot.
            location    : Optional dict {"lat": float, "lng": float}.
        """
        body = {
            "session_id": session_id,
            "event_type": event_type,
            "labels": labels if labels is not None else [event_type],
            "confidence": round(confidence, 4),
        }
        if photo_url:
            body["photo_url"] = photo_url
        if location:
            body["location"] = location

        try:
            resp = requests.post(
                f"{self.base_url}/hazards",
                json=body,
                headers=self._headers,
                timeout=self.timeout,
            )
            resp.raise_for_status()
            hazard_id = resp.json().get("id")
            print(f"[API] Hazard reported: {hazard_id} (confidence={confidence:.2f})")
            return hazard_id
        except requests.HTTPError as exc:
            print(
                f"[API] Failed to post hazard (HTTP {exc.response.status_code}): {exc}"
            )
            return None
        except Exception as exc:
            print(f"[API] Failed to post hazard: {exc}")
            return None
