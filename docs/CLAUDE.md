# Vigilane — Claude Context

Vigilane is a hackathon project (HackSLU 2026) — an AI-powered road hazard detection system. Keep solutions pragmatic; this is not production enterprise software.

## Architecture overview

Three independent subsystems that communicate via HTTP:

1. **React Native mobile app** (`Vigilane/`) — Expo Router, TypeScript, on-device TFLite inference
2. **Flask REST API** (`src/`) — Python, two server modes (see below)
3. **ML pipeline** (`src/ML/`) — YOLOv8, runs on desktop/server with webcam or video file

## Two Flask server modes

**Structured server** (Firebase auth, production-quality):
- Entry: `python -m src.main` from repo root
- `src/main.py` → `src/api/__init__.py` (create_app factory)
- Auth via `src/api/auth.py` (`require_auth` decorator, Firebase ID tokens)
- Imports use `src.*` qualified paths

**Standalone server** (no auth, used by tests):
- Entry: `python flask_server.py` from within `src/`
- `src/flask_server.py` — monolithic, bare `database.*` imports
- Tested by `tests/test_flask_server_routes.py`
- Mirrors all routes at both `/api/*` and bare `/*` paths

## Key file locations

| What | Where |
| --- | --- |
| Flask app factory | `src/api/__init__.py` |
| Firebase auth decorator | `src/api/auth.py` |
| Hazard routes (auth'd) | `src/api/routes/hazards.py` |
| Standalone Flask server | `src/flask_server.py` |
| Database services (public API) | `src/database/services/__init__.py` |
| Hazard CRUD | `src/database/services/hazard_service.py` |
| Session CRUD | `src/database/services/session_service.py` |
| YOLOv8 detection loop | `src/ML/main.py` |
| ML → API client | `src/ML/api_client.py` |
| Expo app screens | `Vigilane/app/(tabs)/` + `Vigilane/app/hazardDetails.tsx` |
| Firebase/Firestore clients | `Vigilane/services/firebase.ts`, `Vigilane/services/firestore.ts` |
| API HTTP client | `Vigilane/services/api.ts` |
| Map modal component | `Vigilane/components/MapModal.tsx` |
| TypeScript types | `Vigilane/types/index.ts` |
| Firestore schema | `docs/SCHEMA.md` |
| REST API reference | `docs/API.md` |

## Firestore collections

- `hazards` — detected road incidents (owner: `user_uid`)
- `sessions` — detection sessions (`device_id`, `hazard_count`)
- `reports` — formal city reports (PII encrypted via Fernet)
- `users` — user profile / settings

## Important patterns

**Database imports**: Services in `src/database/services/` use relative imports (`from ..client import db`). The standalone `src/flask_server.py` uses bare `database.*` imports (run from `src/`). Don't mix these.

**Auth in tests**: Flask `TESTING=True` mode bypasses Firebase token verification in `require_auth` — fake user is injected as `g.user = {"uid": "test-uid-123", ...}`.

**API route prefix**: The mobile app (`Vigilane/services/api.ts`) calls `/api/hazards/*`. The standalone `flask_server.py` also aliases these at `/hazards/*` for backward compat.

**Photo uploads**: Done client-side in `Vigilane/services/firestore.ts` → `uploadHazardPhoto()` → Firebase Storage. The backend never handles binary uploads directly.

**ML confidence**: `CONFIDENCE_THRESHOLD = 0.01` (very sensitive). ROI filters out top 1% and bottom 8% of frame.

## Dev commands

```bash
# Backend (structured server)
python -m venv .venv && .venv\Scripts\activate
pip install -r src/requirements.txt
python -m src.main

# Tests
PYTHONPATH=. pytest -q

# Frontend
cd Vigilane && npm install --legacy-peer-deps
npx expo run:android   # full dev build (required for Google Sign-In)
npx expo start         # Expo Go (no Google Sign-In)
```

## Environment files

| File | Template | Purpose |
| --- | --- | --- |
| `serviceAccountKey.json` | Firebase Console download | Firebase Admin SDK (backend) |
| `src/.env` | `src/.env.example` | `FIREBASE_KEY_PATH`, `ENCRYPTION_KEY`, `CORS_ORIGINS` |
| `Vigilane/.env` | `Vigilane/.env.example` | `EXPO_PUBLIC_FIREBASE_*`, `EXPO_PUBLIC_API_BASE_URL` |

## CI

GitHub Actions (`.github/workflows/ci.yml`): Ruff lint/format on `src/` + `tests/`, `compileall`, `pytest`, then `npm ci` + `expo lint` on `Vigilane/`.
