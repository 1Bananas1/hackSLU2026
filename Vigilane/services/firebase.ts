/**
 * Firebase Web SDK initialisation.
 *
 * Required environment variables (copy .env.example → .env):
 *   EXPO_PUBLIC_FIREBASE_API_KEY
 *   EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
 *   EXPO_PUBLIC_FIREBASE_PROJECT_ID
 *   EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
 *   EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
 *   EXPO_PUBLIC_FIREBASE_APP_ID
 *
 * Import `auth` or `db` from this module rather than calling initializeApp
 * yourself — Firebase guards against double-initialisation, but keeping a
 * single entry point makes it easier to swap implementations later.
 */

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Re-use the existing app if already initialised (e.g. Fast Refresh).
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
