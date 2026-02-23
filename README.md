# Vigilane

Vigilane is an AI-powered road hazard detection system. A YOLOv8 model processes dashcam/webcam video in real time to detect potholes and road damage, optionally prompts the driver for voice confirmation, and automatically reports confirmed incidents to a Flask backend backed by Firebase Firestore. A React Native mobile app lets users view live alerts, browse incident history, and submit formal city reports.

---

## Features

- **Real-time Hazard Detection** — YOLOv8 (6 road damage classes) with configurable confidence threshold and sliding-window frame smoothing
- **Voice Confirmation** — TTS prompt + speech recognition (`pyttsx3` / `SpeechRecognition`) verifies detections before reporting
- **On-Device ML** — TFLite INT8 quantized model for live inference directly in the mobile app via `react-native-fast-tflite`
- **Flask REST API** — manages hazards and sessions; all routes protected by Firebase ID token authentication
- **Firebase Firestore** — cloud document store for users, hazards, and reports
- **Firebase Auth + Google Sign-In** — OAuth 2.0 PKCE flow (Android native via `expo-auth-session`)
- **PII Encryption** — reporter contact info (name, email, phone) encrypted at rest with Fernet (AES-128-CBC + HMAC-SHA256)
- **React Native Mobile App** — Expo / Expo Router, TypeScript; live camera feed with on-device inference, dashboard, hazard history, and settings

---

## Team

| Name | Role |
|---|---|
| **Jackson Parrack** | Frontend (React Native / TypeScript), Android build, system architecture |
| **Jimmy Macdonald** | AI model training, computer vision integration |
| **Aleksandre Khvadagadze** | Database integration (Firestore) |
| **Henry Wang** | Backend integration (Python / Flask) |

---

## Repository Layout

```
Vigilane/
├── Vigilane/                  # React Native / Expo mobile app
│   ├── app/                   # Expo Router (login.tsx, hazardDetails.tsx, (tabs)/)
│   ├── components/            # Shared UI components
│   ├── context/               # AuthContext (Firebase auth state)
│   ├── hooks/                 # TFLite + camera hooks
│   ├── services/              # Firebase, API, Firestore clients
│   ├── constants/             # Design tokens (theme.ts)
│   ├── types/                 # Shared TypeScript interfaces
│   └── web-stubs/             # Web polyfills for native-only packages
├── src/
│   ├── api/                   # Flask application
│   │   ├── main.py            # App factory + health endpoint (entry point)
│   │   ├── middleware/        # @require_auth decorator (Firebase token verification)
│   │   ├── routes/            # Blueprints: hazards.py, sessions.py
│   │   └── services/          # Business logic layer
│   ├── database/              # Firestore models, services, seed scripts
│   │   ├── config.py          # Firebase Admin SDK initialization
│   │   ├── client.py          # Lazy Firestore client singleton
│   │   ├── models/            # Hazard, Report, Session dataclasses
│   │   ├── services/          # Firestore CRUD operations
│   │   └── seed/              # Dev data seeding
│   └── ML/                    # YOLOv8 detection pipeline
│       ├── main.py            # Live inference loop
│       ├── api_client.py      # Posts confirmed detections to Flask
│       ├── voice_confirmation.py  # TTS + STT confirmation loop
│       ├── export_tflite.py   # YOLOv8 → TFLite INT8 exporter
│       ├── best.pt            # Trained YOLOv8 weights
│       └── best_saved_model/  # Exported TFLite models
├── docs/                      # API.md, SCHEMA.md
├── tests/                     # Integration tests
├── .github/workflows/ci.yml   # Python lint + Expo lint
├── firestore.rules            # Firestore security rules
└── .env.example               # Environment variable template
```

---

## Prerequisites

| Tool | Version |
|---|---|
| Python | 3.11+ |
| Node.js | 18+ |
| npm | 9+ |
| Android Studio + SDK | For Android dev builds |
| Java (JDK) | 17+ (required by Gradle) |

---

## 1 — Clone

```bash
git clone https://github.com/1Bananas1/Vigilane.git
cd Vigilane
```

---

## 2 — Secrets & credentials

### 2a — Firebase service account key (backend)

1. Go to [Firebase Console](https://console.firebase.google.com) → Project Settings → Service accounts.
2. Click **Generate new private key** and save as `serviceAccountKey.json` in the repo root.

Create `src/.env`:

```dotenv
FIREBASE_KEY_PATH=../serviceAccountKey.json
FIREBASE_STORAGE_BUCKET=your-project.appspot.com

# Required for POST /hazards/<id>/report — encrypts reporter PII before Firestore storage
# Generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
ENCRYPTION_KEY=<your-fernet-key>

# Optional — restrict CORS origins (comma-separated); defaults to *
# CORS_ORIGINS=http://localhost:3000,http://192.168.1.x:5000
```

### 2b — Frontend environment variables

Create `Vigilane/.env.local` (never commit this file):

```dotenv
# Firebase web config — Firebase Console → Project Settings → Your apps → Web app
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=

# Google OAuth 2.0 client IDs — Google Cloud Console → APIs & Services → Credentials
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=        # Web client — used everywhere
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=    # Android client — required for dev/prod builds
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=        # iOS client — optional

# Backend URL — use your machine's LAN IP when testing on a physical device
# Defaults: http://10.0.2.2:5000 (Android emulator) / http://127.0.0.1:5000 (iOS sim)
# EXPO_PUBLIC_API_BASE_URL=http://192.168.x.x:5000
```

---

## 3 — Backend (Flask)

```bash
# Create and activate a virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux

# Install dependencies
pip install -r src/requirements.txt

# Start the Flask server
python -m src.api.main
```

The server starts on `http://0.0.0.0:5000`.

> **Note:** `serviceAccountKey.json` must exist (or `FIREBASE_KEY_PATH` must point to it) and `ENCRYPTION_KEY` must be set before the server will start.

Alternatively via Flask CLI:

```bash
flask --app src.api.main:app run --debug
```

---

## 4 — ML Pipeline (YOLOv8 detection)

The pipeline detects 6 road damage classes: **pothole**, **alligator cracking**, **longitudinal cracking**, **transverse cracking**, **rutting**, and **patching**.

```bash
# Install ML-specific dependencies (in the same venv)
pip install -r src/ML/requirements.txt

# Run on webcam (index 0)
python src/ML/main.py --webcam 0

# Run on a video file
python src/ML/main.py --video dashcam.mp4

# Headless with API reporting (replace <token> with a Firebase ID token)
python src/ML/main.py --webcam 0 --no-display --api-url http://127.0.0.1:5000 --auth-token <token>
```

Key flags:

| Flag | Default | Description |
|---|---|---|
| `--webcam N` | — | Use webcam index N |
| `--video PATH` | — | Use a video file |
| `--threshold F` | `0.12` | Minimum YOLO confidence to count a frame |
| `--no-display` | off | Disable OpenCV window (headless mode) |
| `--no-voice` | off | Disable voice confirmation prompt |
| `--api-url URL` | — | Flask backend URL for auto-reporting |
| `--auth-token T` | — | Firebase ID token for API authentication |

Detection algorithm:
- **Sliding window** — 3 consecutive frames; alert fires if ≥34% contain detections above threshold
- **ROI filtering** — top 55% (sky) and bottom 12% (car hood) of each frame are ignored
- **Alert cooldown** — minimum 30 frames between consecutive alerts
- **Voice confirmation** — optional two-turn TTS + STT loop before a detection is reported

Trained weights: `src/ML/best.pt`. TFLite INT8 model for mobile: `src/ML/best_saved_model/best_int8.tflite`.

---

## 5 — Mobile App (React Native / Expo)

```bash
cd Vigilane
npm install --legacy-peer-deps
```

### Option A — Android dev build (recommended, required for Google Sign-In)

Google Sign-In requires a custom dev build. The reversed client ID redirect scheme (`com.googleusercontent.apps.…`) is **not** supported in Expo Go.

```bash
# Build and install on a connected device or running emulator
npx expo run:android
```

After the first build, verify your debug keystore SHA-1 matches the fingerprint registered in the Android OAuth client (Google Cloud Console):

```bash
keytool -list -v \
  -keystore %USERPROFILE%\.android\debug.keystore \
  -alias androiddebugkey \
  -storepass android
```

Subsequent launches (no native code change):

```bash
npx expo start
# press 'a' to open on the connected Android device / emulator
```

### Option B — Expo Go (limited)

All screens work **except Google Sign-In** (the `exp://` redirect URI is rejected by Google OAuth).

```bash
npx expo start
# scan the QR code with the Expo Go app
```

### Pointing the app at the backend

When running on a physical device, `localhost` won't reach your dev machine. Set `EXPO_PUBLIC_API_BASE_URL` in `.env.local` to your machine's LAN IP:

```dotenv
EXPO_PUBLIC_API_BASE_URL=http://192.168.x.x:5000
```

---

## Environment summary

| File | Location | Committed? |
|---|---|---|
| `serviceAccountKey.json` | repo root | No |
| `src/.env` | `src/` | No |
| `Vigilane/.env.local` | `Vigilane/` | No |

All three files are listed in `.gitignore` and must be created locally after cloning.

---

## Documentation

| File | Contents |
|---|---|
| [`docs/API.md`](docs/API.md) | Full REST API reference (endpoints, request/response shapes, error codes) |
| [`docs/SCHEMA.md`](docs/SCHEMA.md) | Firestore schema, collections, indexes, and encryption details |

---

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main`, `develop`, and `feature/**`:

| Job | Steps |
|---|---|
| `python-validation` | Ruff lint, Ruff format check, `compileall`, `pytest` |
| `mobile-lint` | `npm ci`, `expo lint` |
