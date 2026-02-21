# Database Schema — Single Source of Truth

**Backend:** Firebase Firestore (NoSQL document store)
**SDK:** `firebase-admin` (Python)
**Models:** [`src/database/models/`](src/database/models/)
**Services:** [`src/database/services/`](src/database/services/)

---

## Collections Overview

| Collection | Purpose | Document model |
|------------|---------|---------------|
| `sessions` | One per dashcam recording run | [Session](src/database/models/session.py) |
| `hazards`  | One per detected road hazard event | [Hazard](src/database/models/hazard.py) |
| `reports`  | One per formal city report submitted for a hazard | [Report](src/database/models/report.py) |

Collections are flat (no sub-collections). Hazards reference their parent session via `session_id`. Reports reference their parent hazard via `hazard_id`.

**Firebase Storage** is used for frame snapshots. Images are stored at `frames/<session_id>/<filename>` in the configured bucket. The public URL is written back to `hazards.photo_url`.

---

## Collection: `sessions`

Represents a single continuous dashcam recording run, from start to stop.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `device_id` | `string` | ✅ | Camera source identifier (e.g. `"webcam_0"`, `"dashcam.mp4"`) |
| `start_time` | `timestamp` | ✅ | UTC datetime when the session was created |
| `status` | `string` | ✅ | `"active"` while recording, `"completed"` after `end_session()` |
| `hazard_count` | `integer` | ✅ | Running total of hazards detected; starts at `0`, incremented atomically via Firestore `Increment` |
| `end_time` | `timestamp` | ❌ | UTC datetime when the session ended; `null`/absent while active |

> `id` is the auto-generated Firestore document ID — never stored as a field inside the document.

### Indexes / Frequent Queries

| Query | Fields indexed |
|-------|---------------|
| All sessions, newest first | `start_time DESC` (single-field, Firestore default) |
| Fetch one session by ID | document ID lookup — no index needed |

### Example Document

```json
{
  "device_id": "webcam_0",
  "start_time": "2026-02-21T14:00:00Z",
  "end_time": "2026-02-21T14:12:47Z",
  "hazard_count": 3,
  "status": "completed"
}
```

### Service functions — [`session_service.py`](src/database/services/session_service.py)

| Function | Description |
|----------|-------------|
| `create_session(device_id)` | Creates and persists a new active session |
| `get_session(session_id)` | Fetch one session by document ID |
| `get_all_sessions()` | All sessions, newest first |
| `increment_hazard_count(session_id)` | Atomically increments `hazard_count` by 1 |
| `end_session(session_id)` | Sets `end_time = now` and `status = "completed"` |

---

## Collection: `hazards`

Represents a single road-hazard detection event emitted by the ML pipeline.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | `string` | ✅ | Firestore document ID of the parent `sessions` document |
| `event_type` | `string` | ✅ | Hazard category (e.g. `"pothole"`, `"crack"`) |
| `confidence` | `float` | ✅ | Fraction of sliding-window frames that fired (range `0.0 – 1.0`) |
| `timestamp` | `timestamp` | ✅ | UTC datetime of detection |
| `status` | `string` | ✅ | Lifecycle state: `"pending"` → `"reported"` or `"dismissed"`; defaults to `"pending"` |
| `photo_url` | `string` | ❌ | Firebase Storage URL of the frame snapshot; `null` if no photo was captured |
| `location` | `map` | ❌ | GPS coordinates at time of detection: `{"lat": float, "lng": float}`; `null` if unavailable |

> `id` is the auto-generated Firestore document ID — never stored as a field inside the document.

#### `location` map schema

```json
{ "lat": 38.6270, "lng": -90.1994 }
```

#### `status` values

| Value | Meaning |
|-------|---------|
| `"pending"` | Detected by ML, not yet reviewed |
| `"reported"` | Confirmed and submitted to city/authority |
| `"dismissed"` | Marked as a false positive or duplicate |

### Indexes / Frequent Queries

| Query | Fields indexed |
|-------|---------------|
| Hazards for a session, oldest first | **Composite:** `session_id ASC, timestamp ASC` — must be created in Firestore console (Firestore prints the creation link on the first query if missing) |
| All hazards, newest first | `timestamp DESC` (single-field, Firestore default) |
| Fetch one hazard by ID | document ID lookup — no index needed |

### Example Document

```json
{
  "session_id": "abc123XYZfirestore",
  "event_type": "pothole",
  "confidence": 0.85,
  "timestamp": "2026-02-21T14:03:15Z",
  "status": "pending",
  "photo_url": "https://storage.googleapis.com/your-bucket/frames/abc123.jpg",
  "location": { "lat": 38.6270, "lng": -90.1994 }
}
```

### Service functions — [`hazard_service.py`](src/database/services/hazard_service.py)

| Function | Description |
|----------|-------------|
| `save_hazard(hazard)` | Writes a new hazard document; returns the document ID |
| `get_hazard(hazard_id)` | Fetch one hazard by document ID |
| `get_hazards_by_session(session_id)` | All hazards for a session, ascending by timestamp |
| `get_all_hazards()` | All hazards, newest first |
| `delete_hazard(hazard_id)` | Permanently deletes a hazard document |
| `update_hazard_status(hazard_id, status)` | Sets `status` to `"pending"`, `"reported"`, or `"dismissed"` |

---

## Collection: `reports`

Represents a formal submission of a hazard to city/municipal authorities.
PII fields are stored as **Fernet-encrypted ciphertext** — never plaintext.
Decryption requires the `ENCRYPTION_KEY` environment variable (see [Environment Variables](#environment-variables)).

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hazard_id` | `string` | ✅ | Firestore document ID of the parent `hazards` document |
| `submitted_by_uid` | `string` | ✅ | Firebase Auth UID of the user who submitted the report |
| `submitted_at` | `timestamp` | ✅ | UTC datetime the report was created |
| `status` | `string` | ✅ | `"submitted"` \| `"acknowledged"` \| `"resolved"`; defaults to `"submitted"` |
| `reporter_name_enc` | `string` | ✅ | **Encrypted** reporter full name (Fernet ciphertext) |
| `reporter_email_enc` | `string` | ✅ | **Encrypted** reporter email address (Fernet ciphertext) |
| `reporter_phone_enc` | `string` | ❌ | **Encrypted** reporter phone number (Fernet ciphertext); `null` if not provided |

> `id` is the auto-generated Firestore document ID — never stored as a field inside the document.

### What data a report captures

When a user submits `POST /hazards/<id>/report`, the following information is combined into the report:

| Data | Source | Encrypted? |
|------|--------|-----------|
| Hazard location (lat/lng) | `hazards.location` | No |
| Photo evidence | `hazards.photo_url` | No |
| Hazard type | `hazards.event_type` | No |
| ML confidence | `hazards.confidence` | No |
| Detection timestamp | `hazards.timestamp` | No |
| Reporter name | Request body | **Yes** |
| Reporter email | Request body | **Yes** |
| Reporter phone | Request body | **Yes** (if provided) |
| Submitter UID | Firebase Auth token | No |

### Encryption details

- **Algorithm:** Fernet (AES-128-CBC + HMAC-SHA256) via the `cryptography` library
- **Key source:** `ENCRYPTION_KEY` environment variable — a URL-safe base64-encoded 32-byte key
- **Generate a key:** `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
- **Implementation:** [`src/database/services/encryption.py`](src/database/services/encryption.py)

### Indexes / Frequent Queries

| Query | Fields indexed |
|-------|---------------|
| Reports for a hazard, oldest first | **Composite:** `hazard_id ASC, submitted_at ASC` |
| Fetch one report by ID | document ID lookup — no index needed |

### Example Document (as stored in Firestore)

```json
{
  "hazard_id": "xyz789firestore",
  "submitted_by_uid": "firebase-auth-uid-abc",
  "submitted_at": "2026-02-21T14:10:00Z",
  "status": "submitted",
  "reporter_name_enc":  "gAAAAABh...<fernet ciphertext>",
  "reporter_email_enc": "gAAAAABh...<fernet ciphertext>",
  "reporter_phone_enc": "gAAAAABh...<fernet ciphertext>"
}
```

### Service functions — [`report_service.py`](src/database/services/report_service.py)

| Function | Description |
|----------|-------------|
| `create_report(hazard_id, submitted_by_uid, reporter_name, reporter_email, reporter_phone)` | Encrypts PII and writes a new report; returns document ID |
| `get_report(report_id)` | Fetch one report by document ID (ciphertext fields remain encrypted) |
| `get_reports_by_hazard(hazard_id)` | All reports for a hazard, oldest first |

---

## Firebase Storage

Frame snapshots are uploaded to Firebase Storage by [`storage_service.py`](src/database/services/storage_service.py).

**Storage path:** `frames/<session_id>/<filename>`
**Example URL:** `https://storage.googleapis.com/<bucket>/frames/abc123/frame_0050.jpg`

The returned public URL is stored in `hazards.photo_url`.

**Service function:**

| Function | Description |
|----------|-------------|
| `upload_frame(image_bytes, session_id, filename)` | Uploads a JPEG to Storage and returns its public URL |

---

## Relationships

```
sessions/{session_id}
    └── (referenced by) hazards/{hazard_id}.session_id
                            └── (referenced by) reports/{report_id}.hazard_id
```

- One `session` → many `hazards` (1-to-many).
- One `hazard` → many `reports` (1-to-many, typically 1).
- All three collections are flat (no Firestore sub-collections); relationships use foreign key fields.
- `sessions.hazard_count` is a denormalized count kept in sync via `increment_hazard_count()` — avoids an expensive collection count query at read time.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_KEY_PATH` | ✅ | Path to service account JSON key (default: `serviceAccountKey.json`) |
| `FIREBASE_STORAGE_BUCKET` | ✅ for Storage | Storage bucket name (e.g. `your-project.appspot.com`) |
| `ENCRYPTION_KEY` | ✅ for reports | Fernet key for encrypting PII; generate with `Fernet.generate_key()` |

---

## Optional / Future Collections

| Collection | Purpose |
|------------|---------|
| `devices` | Registry of known cameras/dashcams with metadata (owner, location, last seen) |
| `detections` | Raw per-frame ML outputs before the sliding-window alert threshold — useful for analytics or replay |
| `users` | If multi-user auth is added (Firebase Auth UIDs as document IDs) |

---

## Required Firestore Composite Indexes

Create these indexes in the Firestore console (or via `firestore.indexes.json`):

| Collection | Field 1 | Order | Field 2 | Order | Used by |
|------------|---------|-------|---------|-------|---------|
| `hazards` | `session_id` | ASC | `timestamp` | ASC | `get_hazards_by_session()` |
| `reports` | `hazard_id` | ASC | `submitted_at` | ASC | `get_reports_by_hazard()` |

Firestore prints a direct creation link in the console on the first query if an index is missing.
