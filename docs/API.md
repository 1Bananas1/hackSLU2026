# API Reference — Single Source of Truth

**Framework:** Flask 3.x (Python)
**Auth:** Firebase Authentication (ID token verification)
**Base URL (dev):** `http://127.0.0.1:5000`
**Entry point:** [`src/main.py`](../src/main.py) → [`src/api/__init__.py`](../src/api/__init__.py)

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

**Implementation:** [`src/api/auth.py`](../src/api/auth.py) — `require_auth` decorator

---

## Endpoints Overview

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/` | ❌ | Health check |
| `POST` | `/hazards` | ✅ | Record a new hazard |
| `GET` | `/hazards` | ✅ | List the authenticated user's hazards (newest first) |
| `GET` | `/hazards/<id>` | ✅ | Fetch one hazard |
| `DELETE` | `/hazards/<id>` | ✅ | Delete a hazard (owner only) |
| `POST` | `/hazards/<id>/dismiss` | ✅ | Dismiss a hazard as false positive (owner only) |
| `POST` | `/hazards/<id>/report` | ✅ | Submit a formal city report (any authenticated user; PII encrypted at rest) |

---

## Health Check

### `GET /`

No authentication required.

**Response `200`:**
```json
{ "status": "ok", "service": "HackSLU2026 API" }
```

---

## Hazards

Routes defined in [`src/api/routes/hazards.py`](../src/api/routes/hazards.py).
Backed by [`src/database/services/hazard_service.py`](../src/database/services/hazard_service.py).

---

### `POST /hazards`

Record a new hazard event. The `user_uid` is taken from the authenticated Firebase token — it must **not** be included in the request body.

**Request body (JSON):**
```json
{
  "confidence":  0.85,
  "labels":      ["pothole"],
  "bboxes":      [{ "x1": 120, "y1": 200, "x2": 300, "y2": 380 }],
  "frame_number": 7,
  "event_type":  "pothole",
  "photo_url":   "https://storage.googleapis.com/bucket/frames/uid123/frame_0050.jpg",
  "location":    { "lat": 38.6270, "lng": -90.1994 }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `confidence` | `float` | ✅ | Detection confidence score (`0.0 – 1.0`) |
| `labels` | `string[]` | ✅ | Non-empty list of detected hazard categories (e.g. `["pothole"]`) |
| `bboxes` | `object[]` | ❌ | Bounding boxes in pixel coordinates: `[{"x1", "y1", "x2", "y2"}]` |
| `frame_number` | `integer` | ❌ | 0-based frame index; defaults to `0` |
| `event_type` | `string` | ❌ | Hazard category; defaults to `labels[0]` if omitted |
| `photo_url` | `string` | ❌ | Firebase Storage URL of the frame snapshot |
| `location` | `object` | ❌ | GPS coords: `{"lat": float, "lng": float}` (`lat` in `[-90, 90]`, `lng` in `[-180, 180]`) |

> **Security:** `user_uid` is always set server-side from the auth token. Sending `user_uid` in the request body returns `400`. `status` is always forced to `"pending"` on creation regardless of any client-provided value.

**Response `201`:**
```json
{
  "id": "xyz789firestore",
  "user_uid": "firebase-auth-uid-abc",
  "event_type": "pothole",
  "confidence": 0.85,
  "labels": ["pothole"],
  "bboxes": [{ "x1": 120, "y1": 200, "x2": 300, "y2": 380 }],
  "frame_number": 7,
  "timestamp": "2026-02-21T14:03:15+00:00",
  "photo_url": null,
  "location": { "lat": 38.6270, "lng": -90.1994 },
  "status": "pending"
}
```

**Errors:**

| Status | Body | Cause |
|--------|------|-------|
| `400` | `{"error": "user_uid must not be provided by the client"}` | `user_uid` present in request body |
| `400` | `{"error": "Missing required fields: [...]"}` | `confidence` or `labels` absent |
| `400` | `{"error": "confidence must be a number"}` | Non-numeric confidence |
| `400` | `{"error": "confidence must be between 0.0 and 1.0"}` | Out-of-range confidence |
| `400` | `{"error": "labels must be a non-empty list"}` | Empty or non-list labels |
| `400` | `{"error": "location.lat and location.lng must be numbers"}` | Non-numeric GPS coords |
| `400` | `{"error": "location out of valid range"}` | `lat` outside `[-90, 90]` or `lng` outside `[-180, 180]` |

---

### `GET /hazards`

Return all hazards owned by the authenticated user, newest first.

> Requires the composite Firestore index on `(user_uid ASC, timestamp DESC)` — see [SCHEMA.md](../../SCHEMA.md).

**Response `200`:** Array of hazard objects (same shape as `POST /hazards` response).

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

Permanently delete a hazard document. Only the hazard's owner may delete it.

**Response `200`:**
```json
{ "message": "Hazard deleted", "hazard_id": "xyz789firestore" }
```

**Errors:**

| Status | Body | Cause |
|--------|------|-------|
| `403` | `{"error": "Forbidden"}` | Authenticated user is not the hazard owner |
| `404` | `{"error": "Hazard not found"}` | No document with that ID |

---

### `POST /hazards/<hazard_id>/dismiss`

Mark a hazard as a false positive or duplicate. Only the hazard's owner may dismiss it.

Transitions `status`: `"pending"` → `"dismissed"`.

**Request body:** None required.

**Response `200`:**
```json
{ "message": "Hazard dismissed", "hazard_id": "xyz789firestore" }
```

**Errors:**

| Status | Body | Cause |
|--------|------|-------|
| `403` | `{"error": "Forbidden"}` | Authenticated user is not the hazard owner |
| `404` | `{"error": "Hazard not found"}` | No document with that ID |
| `409` | `{"error": "Hazard is not in pending status"}` | Status is not `"pending"` |

---

### `POST /hazards/<hazard_id>/report`

Submit a formal city report for a detected hazard. Any authenticated user may report a hazard (community reporting).

- **Encrypts** `reporter_name`, `reporter_email`, and `reporter_phone` with Fernet (AES-128-CBC) before writing to Firestore — plaintext never touches the database.
- Transitions the hazard's `status` from `"pending"` → `"reported"`.
- Creates a document in the `reports` Firestore collection.

**Request body (JSON):**
```json
{
  "reporter_name":  "Jane Doe",
  "reporter_email": "jane@example.com",
  "reporter_phone": "+1-314-555-0199"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reporter_name` | `string` | ✅ | Full name — encrypted before storage |
| `reporter_email` | `string` | ✅ | Email address — encrypted before storage |
| `reporter_phone` | `string` | ❌ | Phone number — encrypted before storage |

**Response `201`:**
```json
{
  "message": "Report submitted",
  "report_id": "rpt456firestore",
  "hazard_id": "xyz789firestore"
}
```

**Errors:**

| Status | Body | Cause |
|--------|------|-------|
| `400` | `{"error": "Missing required fields: [...]"}` | `reporter_name` or `reporter_email` absent |
| `404` | `{"error": "Hazard not found"}` | No hazard with that ID |
| `409` | `{"error": "Hazard has already been reported"}` | Status is already `"reported"` |
| `409` | `{"error": "Cannot report a dismissed hazard"}` | Status is `"dismissed"` |

---

## Running the Server

```bash
# From repo root, with .venv active:
python -m src.main

# Or via Flask CLI:
flask --app src.main:app run --debug
```

Required `.env` variables:

```
FIREBASE_KEY_PATH=serviceAccountKey.json
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
ENCRYPTION_KEY=<output of Fernet.generate_key()>
```

---

## File Map

```
src/api/
├── __init__.py          create_app() factory + GET / health check
├── auth.py              require_auth decorator (Firebase token verification)
├── requirements.txt     flask, firebase-admin, python-dotenv, cryptography
└── routes/
    ├── __init__.py      register_routes() — wires blueprints onto the app
    └── hazards.py       POST/GET/DELETE /hazards, POST /hazards/<id>/dismiss,
                         POST /hazards/<id>/report
```
