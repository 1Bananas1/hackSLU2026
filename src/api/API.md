# API Reference — Single Source of Truth

**Framework:** Flask 3.x (Python)
**Auth:** Firebase Authentication (ID token verification)
**Base URL (dev):** `http://127.0.0.1:5000`
**Entry point:** [`src/main.py`](../main.py) → [`src/api/__init__.py`](__init__.py)

---

## Authentication

Every endpoint (except `GET /`) requires a Firebase ID token obtained from the client-side Firebase Auth SDK.

**Header format:**
```
Authorization: Bearer <firebase-id-token>
```

The token is verified server-side via `firebase_admin.auth.verify_id_token()`. On success the decoded token (including `uid`, `email`, etc.) is available inside route handlers as `g.user`.

**Auth errors (all protected routes):**

| Status | Body | Cause |
|--------|------|-------|
| `401` | `{"error": "Missing Authorization header"}` | No `Authorization` header |
| `401` | `{"error": "Token has expired"}` | Token is past its expiry |
| `401` | `{"error": "Token has been revoked"}` | Token was revoked in Firebase |
| `401` | `{"error": "Invalid token"}` | Malformed or tampered token |
| `401` | `{"error": "Authentication failed"}` | Any other verification error |

**Implementation:** [`src/api/auth.py`](auth.py) — `require_auth` decorator

---

## Endpoints Overview

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/` | ❌ | Health check |
| `POST` | `/sessions` | ✅ | Start a new session |
| `GET` | `/sessions` | ✅ | List all sessions (newest first) |
| `GET` | `/sessions/<id>` | ✅ | Fetch one session |
| `POST` | `/sessions/<id>/end` | ✅ | End an active session |
| `GET` | `/sessions/<id>/hazards` | ✅ | Hazards for a session (asc by time) |
| `POST` | `/hazards` | ✅ | Record a new hazard |
| `GET` | `/hazards` | ✅ | List all hazards (newest first) |
| `GET` | `/hazards/<id>` | ✅ | Fetch one hazard |
| `DELETE` | `/hazards/<id>` | ✅ | Delete a hazard |

---

## Health Check

### `GET /`

No authentication required.

**Response `200`:**
```json
{ "status": "ok", "service": "HackSLU2026 API" }
```

---

## Sessions

Routes defined in [`src/api/routes/sessions.py`](routes/sessions.py).
Backed by [`src/database/services/session_service.py`](../database/services/session_service.py).

---

### `POST /sessions`

Start a new dashcam recording session.

**Request body (JSON):**
```json
{ "device_id": "webcam_0" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `device_id` | `string` | ✅ | Camera source identifier |

**Response `201`:**
```json
{
  "id": "abc123XYZfirestore",
  "device_id": "webcam_0",
  "status": "active",
  "hazard_count": 0,
  "start_time": "2026-02-21T14:00:00",
  "end_time": null
}
```

**Errors:**

| Status | Body | Cause |
|--------|------|-------|
| `400` | `{"error": "device_id is required"}` | Missing or empty `device_id` |

---

### `GET /sessions`

Return all sessions, newest first.

**Response `200`:** Array of session objects (same shape as above).

---

### `GET /sessions/<session_id>`

Fetch a single session by its Firestore document ID.

**Response `200`:** Single session object.

**Errors:**

| Status | Body | Cause |
|--------|------|-------|
| `404` | `{"error": "Session not found"}` | No document with that ID |

---

### `POST /sessions/<session_id>/end`

Mark an active session as completed and record its `end_time`.

**Request body:** None required.

**Response `200`:**
```json
{ "message": "Session ended", "session_id": "abc123XYZfirestore" }
```

**Errors:**

| Status | Body | Cause |
|--------|------|-------|
| `404` | `{"error": "Session not found"}` | No document with that ID |
| `409` | `{"error": "Session is already completed"}` | Already ended |

---

### `GET /sessions/<session_id>/hazards`

Return all hazards belonging to a session, ordered by `timestamp` ascending.

> Requires the composite Firestore index on `(session_id ASC, timestamp ASC)` — see [SCHEMA.md](../../SCHEMA.md).

**Response `200`:** Array of hazard objects (same shape as `GET /hazards/<id>`).

**Errors:**

| Status | Body | Cause |
|--------|------|-------|
| `404` | `{"error": "Session not found"}` | No document with that ID |

---

## Hazards

Routes defined in [`src/api/routes/hazards.py`](routes/hazards.py).
Backed by [`src/database/services/hazard_service.py`](../database/services/hazard_service.py).

---

### `POST /hazards`

Record a new hazard event. Automatically increments the parent session's `hazard_count`.

**Request body (JSON):**
```json
{
  "session_id":   "abc123XYZfirestore",
  "confidence":   0.85,
  "labels":       ["pothole"],
  "bboxes":       [{ "x1": 120, "y1": 200, "x2": 300, "y2": 380 }],
  "frame_number": 50
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | `string` | ✅ | Firestore ID of the parent session |
| `confidence` | `float` | ✅ | Fraction of sliding-window frames that fired (`0.0 – 1.0`) |
| `labels` | `array<string>` | ✅ | Label(s) from the ML model (e.g. `["pothole"]`) |
| `bboxes` | `array<object>` | ✅ | Bounding boxes; each `{x1, y1, x2, y2}` in pixels |
| `frame_number` | `integer` | ❌ | Absolute frame index in the stream; defaults to `0` |

**Response `201`:**
```json
{
  "id": "xyz789firestore",
  "session_id": "abc123XYZfirestore",
  "confidence": 0.85,
  "labels": ["pothole"],
  "bboxes": [{ "x1": 120, "y1": 200, "x2": 300, "y2": 380 }],
  "frame_number": 50,
  "timestamp": "2026-02-21T14:03:15"
}
```

**Errors:**

| Status | Body | Cause |
|--------|------|-------|
| `400` | `{"error": "Missing required fields: [...]"}` | One or more required fields absent |
| `404` | `{"error": "Parent session not found"}` | `session_id` does not exist |

---

### `GET /hazards`

Return all hazards, newest first.

**Response `200`:** Array of hazard objects.

---

### `GET /hazards/<hazard_id>`

Fetch a single hazard by its Firestore document ID.

**Response `200`:** Single hazard object.

**Errors:**

| Status | Body | Cause |
|--------|------|-------|
| `404` | `{"error": "Hazard not found"}` | No document with that ID |

---

### `DELETE /hazards/<hazard_id>`

Permanently delete a hazard document. Does **not** decrement the parent session's `hazard_count`.

**Response `200`:**
```json
{ "message": "Hazard deleted", "hazard_id": "xyz789firestore" }
```

**Errors:**

| Status | Body | Cause |
|--------|------|-------|
| `404` | `{"error": "Hazard not found"}` | No document with that ID |

---

## Running the Server

```bash
# From repo root, with .venv active:
python -m src.main

# Or via Flask CLI:
flask --app src.main:app run --debug
```

Ensure `serviceAccountKey.json` exists in the repo root, or set `FIREBASE_KEY_PATH` in a `.env` file.

---

## File Map

```
src/api/
├── __init__.py          create_app() factory + GET / health check
├── auth.py              require_auth decorator (Firebase token verification)
├── requirements.txt     flask, firebase-admin, python-dotenv
├── API.md               ← this file
└── routes/
    ├── __init__.py      register_routes() — wires blueprints onto the app
    ├── sessions.py      POST/GET /sessions, POST /sessions/<id>/end
    └── hazards.py       POST/GET/DELETE /hazards, GET /sessions/<id>/hazards
```
