# Vigilane

Vigilane is an AI-powered road hazard detection system. A YOLOv8 model runs on a dashcam feed, detects potholes and road hazards in real time, and automatically reports confirmed detections to a Flask backend that persists them in Firebase Firestore. A React Native mobile app lets drivers view live alerts, browse incident history, and manage sessions.

---

## Features

- **Real-time Hazard Detection** — YOLOv8 model processes webcam / dashcam video, raises alerts above a configurable confidence threshold, and optionally prompts the driver for voice confirmation before reporting.
- **Voice Confirmation** — Text-to-speech prompt + speech recognition (offline via `pyttsx3` / `SpeechRecognition`).
- **Flask REST API** — Manages sessions, hazards, and reports; authenticated via Firebase ID tokens.
- **Firebase Firestore** — Cloud database for sessions, hazards, and reports.
- **Firebase Auth + Google Sign-In** — OAuth 2.0 (Android native PKCE flow via `expo-auth-session`).
- **React Native Mobile App** — Expo / Expo Router, TypeScript. Live dashboard, hazard history, and settings screens.

---

## Team

| Name | Role |
|---|---|
| **Jackson Parrack** | Frontend (React Native / TSX), Android build, system architecture |
| **Jimmy Macdonald** | AI model training, computer vision integration |
| **Aleksandre Khvadagadze** | Database integration (Firestore) |
| **Henry Wang** | Backend integration (Python / Flask) |

---

## Repository Layout

```
Vigilane/
├── Vigilane/          # React Native app (Expo Router)
├── src/
│   ├── flask_server.py     # Flask REST API entry point
│   ├── api/                # Route blueprints (hazards, sessions, auth)
│   ├── database/           # Firestore models + services
│   └── ML/                 # YOLOv8 inference pipeline
├── serviceAccountKey.json  # Firebase Admin SDK key (⚠ NOT committed)
└── docs/
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
| Git | any |

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
2. Click **Generate new private key** and save the file as `serviceAccountKey.json` in the repo root (`Vigilane/serviceAccountKey.json`).

Optionally create a `src/.env` to override the default path:

```dotenv
FIREBASE_KEY_PATH=../serviceAccountKey.json
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
```

### 2b — Frontend environment variables

Create `Vigilane/.env.local` (never commit this file):

```dotenv
# Firebase web config
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=

# Google OAuth 2.0 client IDs
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=        # Web client — used everywhere
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=    # Android client — used in dev/prod builds only
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=        # iOS client — optional

# Backend URL (change to your machine's LAN IP when testing on a physical device)
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:5000
```

All values are available in the Firebase / Google Cloud Console.

---

## 3 — Backend (Flask)

```bash
# Create and activate a virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux

# Install dependencies
pip install -r src/requirements.txt

# Run the Flask server
python src/flask_server.py
```

The server starts on `http://127.0.0.1:5000` by default.

> **Note:** `serviceAccountKey.json` must exist in the repo root (or `FIREBASE_KEY_PATH` must point to it) before the server will start.

---

## 4 — ML Pipeline (YOLOv8 dashcam detection)

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
| `--threshold F` | `0.12` | Minimum YOLO confidence to count |
| `--no-display` | off | Disable OpenCV window (headless) |
| `--no-voice` | off | Disable voice confirmation prompt |
| `--api-url URL` | — | Flask backend URL for auto-reporting |
| `--auth-token T` | — | Firebase ID token for API authentication |

The trained model weights are in `src/ML/best.pt`.

---

## 5 — Mobile App (React Native / Expo)

```bash
cd Vigilane

# Install dependencies
npm install --legacy-peer-deps
```

### Option A — Android dev build (recommended, required for Google Sign-In)

Google Sign-In uses an Android OAuth 2.0 client whose redirect URI is the reversed client ID scheme (`com.googleusercontent.apps.…`). This only works in a custom dev build, **not in Expo Go**.

```bash
# Build and install the app on a connected device or running emulator
npx expo run:android
```

After the first build, grab the debug keystore SHA-1 and ensure it matches the fingerprint registered in your Android OAuth client in Google Cloud Console:

```bash
keytool -list -v \
  -keystore %USERPROFILE%\.android\debug.keystore \
  -alias androiddebugkey \
  -storepass android
```

Subsequent launches (without a native code change) are faster:

```bash
npx expo start
# press 'a' to open on the connected Android device / emulator
```

### Option B — Expo Go (limited)

Expo Go works for all screens **except Google Sign-In** (the `exp://` redirect URI is rejected by Google OAuth).

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

| File | Where | Committed? |
|---|---|---|
| `serviceAccountKey.json` | repo root | ❌ No |
| `src/.env` | `src/` | ❌ No |
| `Vigilane/.env.local` | `Vigilane/` | ❌ No |

All three files are in `.gitignore` and must be created locally after cloning.
