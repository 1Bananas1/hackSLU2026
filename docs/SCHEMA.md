# Database Schema — Single Source of Truth

**Backend:** Firebase Firestore (NoSQL document store)
**SDK:** `firebase-admin` (Python)
**Models:** [`src/database/models/`](src/database/models/)
**Services:** [`src/database/services/`](src/database/services/)

---

## Collections Overview

| Collection | Purpose | Document model |
|------------|---------|---------------|
| `users`    | One per Firebase Auth user; created/updated on every sign-in | [user_service.py](src/database/services/user_service.py) |
| `hazards`  | One per detected road hazard event | [Hazard](src/database/models/hazard.py) |
| `reports`  | One per formal city report submitted for a hazard | [Report](src/database/models/report.py) |

Collections are flat (no sub-collections). Hazards are owned by a Firebase Auth user via `user_uid`. Reports reference their parent hazard via `hazard_id`.

**Firebase Storage** is used for frame snapshots. Images are stored at `frames/<user_uid>/<filename>` in the configured bucket. The public URL is written back to `hazards.photo_url`.

---

## Collection: `users`

Stores a profile document for every Firebase Auth user. Created automatically on the user's first sign-in; updated on every subsequent sign-in via `upsertUser` (frontend) or `upsert_user` (seed/backend).

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `uid` | `string` | ✅ | Firebase Auth UID (same as the Firestore document ID) |
| `email` | `string` | ❌ | Email address from the auth provider; `null` if unavailable |
| `display_name` | `string` | ❌ | Display name from the auth provider (e.g. Google full name); `null` if unavailable |
| `photo_url` | `string` | ❌ | Profile photo URL from the auth provider; `null` if unavailable |
| `last_seen` | `timestamp` | ✅ | UTC datetime of the most recent sign-in; always updated on every auth event |

> The document ID is always the Firebase Auth UID — no separate `id` field is needed.

### Who writes it

| Writer | When |
|--------|------|
| Frontend (`upsertUser` in `services/user.ts`) | Every time `onAuthStateChanged` fires with a non-null user (first login + subsequent logins) |
| Seed script (`upsert_user` in `user_service.py`) | When seeding local dev data with a fake UID |

### Example Document

```json
{
  "uid": "firebase-auth-uid-abc",
  "email": "jane@example.com",
  "display_name": "Jane Doe",
  "photo_url": "https://lh3.googleusercontent.com/...",
  "last_seen": "2026-02-22T14:00:00Z"
}
```

### Service functions — [`user_service.py`](src/database/services/user_service.py)

| Function | Description |
|----------|-------------|
| `upsert_user(uid, email, display_name, photo_url)` | Create or merge a user profile document |
| `get_user(uid)` | Fetch a user profile dict by UID; returns `None` if not found |

---

## Collection: `hazards`

Represents a single road-hazard detection event emitted by the ML pipeline or reported directly by a user.

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user_uid` | `string` | ✅ | Firebase Auth UID of the user who owns this hazard; always set server-side from the auth token — never accepted from the client |
| `event_type` | `string` | ✅ | Hazard category (e.g. `"pothole"`, `"alligator cracking"`); derived from `labels[0]` if not provided |
| `confidence` | `float` | ✅ | Detection confidence score (range `0.0 – 1.0`) |
| `labels` | `string[]` | ✅ | Non-empty list of detected hazard labels (e.g. `["pothole"]`) |
| `bboxes` | `map[]` | ❌ | Bounding boxes `[{x1, y1, x2, y2}]` (normalised 0–1); empty list if not available |
| `frame_number` | `integer` | ✅ | 0-based frame index; defaults to `0` |
| `timestamp` | `timestamp` | ✅ | UTC datetime of detection; always set server-side |
| `status` | `string` | ✅ | Lifecycle state: `"pending"` → `"reported"` or `"dismissed"`; always `"pending"` on creation |
| `photo_url` | `string` | ❌ | Firebase Storage URL of the frame snapshot; `null` if no photo was captured |
| `location` | `map` | ❌ | GPS coordinates at time of detection: `{"lat": float, "lng": float}`; `null` if unavailable |

> `id` is the auto-generated Firestore document ID — never stored as a field inside the document.

#### `location` map schema

```json
{ "lat": 38.6270, "lng": -90.1994 }
```

Valid ranges: `lat` in `[-90, 90]`, `lng` in `[-180, 180]`. The API returns `400` if values are out of range.

#### `status` state machine

```
CREATE → "pending"
"pending"  → "dismissed"  (POST /hazards/<id>/dismiss — owner only)
"pending"  → "reported"   (POST /hazards/<id>/report — any authenticated user)
All other transitions → 409
```

| Value | Meaning |
|-------|---------|
| `"pending"` | Detected by ML or reported by user, not yet reviewed |
| `"reported"` | Confirmed and submitted to city/authority |
| `"dismissed"` | Marked as a false positive or duplicate |

### Indexes / Frequent Queries

| Query | Fields indexed |
|-------|---------------|
| User's hazards, newest first | **Composite:** `user_uid ASC, timestamp DESC` — **must be created in Firestore console before deploying** |
| Fetch one hazard by ID | document ID lookup — no index needed |

### Example Document

```json
{
  "user_uid": "firebase-auth-uid-abc",
  "event_type": "pothole",
  "confidence": 0.85,
  "labels": ["pothole"],
  "bboxes": [{ "x1": 0.12, "y1": 0.20, "x2": 0.30, "y2": 0.38 }],
  "frame_number": 7,
  "timestamp": "2026-02-21T14:03:15Z",
  "status": "pending",
  "photo_url": "https://storage.googleapis.com/your-bucket/frames/uid-abc/frame_0050.jpg",
  "location": { "lat": 38.6270, "lng": -90.1994 }
}
```

### Service functions — [`hazard_service.py`](src/database/services/hazard_service.py)

| Function | Description |
|----------|-------------|
| `save_hazard(hazard)` | Writes a new hazard document; returns the document ID |
| `get_hazard(hazard_id)` | Fetch one hazard by document ID |
| `get_hazards_by_user(user_uid)` | All hazards owned by a user, newest first (requires composite index) |
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

**Storage path:** `frames/<user_uid>/<filename>`
**Example URL:** `https://storage.googleapis.com/<bucket>/frames/firebase-auth-uid-abc/frame_0050.jpg`

The returned public URL is stored in `hazards.photo_url`.

**Service function:**

| Function | Description |
|----------|-------------|
| `upload_frame(image_bytes, user_uid, filename)` | Uploads a JPEG to Storage and returns its public URL |

---

## Relationships

```
hazards/{hazard_id}   (user_uid → Firebase Auth user)
    └── (referenced by) reports/{report_id}.hazard_id
```

- One Firebase Auth user → many `hazards` (1-to-many, via `user_uid` field).
- One `hazard` → many `reports` (1-to-many, typically 1).
- Both collections are flat (no Firestore sub-collections); relationships use foreign key fields.

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

---

## Required Firestore Composite Indexes

Create these indexes in the Firestore console (or via `firestore.indexes.json`):

| Collection | Field 1 | Order | Field 2 | Order | Used by |
|------------|---------|-------|---------|-------|---------|
| `hazards` | `user_uid` | ASC | `timestamp` | DESC | `get_hazards_by_user()` — user's hazards, newest first |
| `reports` | `hazard_id` | ASC | `submitted_at` | ASC | `get_reports_by_hazard()` |

> **Important:** The `(user_uid ASC, timestamp DESC)` index must be created **before** deploying the API. Without it, the first `GET /hazards` call will throw a Firestore error with a direct link to create the missing index.

Firestore prints a direct creation link in the console on the first query if an index is missing.
