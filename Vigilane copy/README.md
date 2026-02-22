# Vigilane — Mobile App

React Native (Expo Router) frontend for the Vigilane road hazard detection system.

See the root [`docs/readme.md`](../docs/readme.md) for full project setup instructions.

## Quick start

```bash
# Install dependencies
npm install --legacy-peer-deps

# Create .env.local with your Firebase + Google OAuth keys (see docs/readme.md §2b)

# Android dev build — required for Google Sign-In
npx expo run:android

# Or start the dev server for an already-installed build
npx expo start
```

> **Google Sign-In does not work in Expo Go.** Use `npx expo run:android` to build a dev client with the correct redirect URI scheme.

## App structure

```
app/
  _layout.tsx          # Root layout + AuthProvider + AuthGuard
  login.tsx            # Google Sign-In screen
  hazardDetails.tsx    # Single hazard detail view
  (tabs)/
    index.tsx          # Home / dashboard
    liveDashboard.tsx  # Live detection feed
    hazardHistory.tsx  # Past incidents
    settings.tsx       # User settings + sign out

components/            # Shared UI components
context/               # AuthContext (Firebase auth state)
services/
  firebase.ts          # Firebase app init (reads EXPO_PUBLIC_FIREBASE_* vars)
  api.ts               # Backend API client (reads EXPO_PUBLIC_API_BASE_URL)
constants/
  theme.ts             # Design tokens
types/
  index.ts             # Shared TypeScript types
```

