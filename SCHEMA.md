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

Collections are flat (no sub-collections). Hazards reference their parent session via `session_id`.

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
| `confidence` | `float` | ✅ | Fraction of sliding-window frames that fired (range `0.0 – 1.0`) |
| `labels` | `array<string>` | ✅ | Label(s) from the Florence-2 model (e.g. `["pothole"]`, `["crack"]`) |
| `bboxes` | `array<object>` | ✅ | Bounding boxes; each element is `{x1, y1, x2, y2}` in pixel coordinates |
| `timestamp` | `timestamp` | ✅ | UTC datetime of detection |
| `frame_number` | `integer` | ✅ | Absolute frame index in the video/webcam stream; defaults to `0` |

> `id` is the auto-generated Firestore document ID — never stored as a field inside the document.

#### `bboxes` element schema

```json
{ "x1": 120, "y1": 200, "x2": 300, "y2": 380 }
```

Each bounding box is stored as a Firestore map (not an array of 4 numbers) to keep field names explicit.

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
  "confidence": 0.85,
  "labels": ["pothole"],
  "bboxes": [
    { "x1": 120, "y1": 200, "x2": 300, "y2": 380 }
  ],
  "timestamp": "2026-02-21T14:03:15Z",
  "frame_number": 50
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

---

## Relationships

```
sessions/{session_id}
    └── (referenced by) hazards/{hazard_id}.session_id
```

- One `session` → many `hazards` (1-to-many).
- Hazards are **not** stored as a sub-collection; they live in the top-level `hazards` collection and carry a `session_id` foreign key.
- `sessions.hazard_count` is a denormalized count kept in sync via `increment_hazard_count()` — avoids an expensive collection count query at read time.

---

## Optional / Future Collections

These are not implemented yet but are natural extensions:

| Collection | Purpose |
|------------|---------|
| `devices` | Registry of known cameras/dashcams with metadata (owner, location, last seen) |
| `detections` | Raw per-frame ML outputs before the sliding-window alert threshold — useful for analytics or replay |
| `users` | If multi-user auth is added (Firebase Auth UIDs as document IDs) |

---

## Required Firestore Composite Index

Create this index in the Firestore console (or via `firestore.indexes.json`) before querying hazards by session:

| Collection | Fields | Order |
|------------|--------|-------|
| `hazards` | `session_id` | Ascending |
| `hazards` | `timestamp` | Ascending |

Firestore will automatically print a direct creation link in the console logs on the first call to `get_hazards_by_session()` if the index is missing.
