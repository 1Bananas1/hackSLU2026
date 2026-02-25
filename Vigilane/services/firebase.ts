/**
 * Firebase Web SDK initialisation for Expo (native + web).
 *
 * Note:
 * - firebase@11.x does NOT provide `firebase/auth/react-native` as a module path,
 *   but getReactNativePersistence is still available via require('firebase/auth').
 * - On native we use AsyncStorage for persistence so auth survives app restarts.
 * - On web we use indexedDBLocalPersistence so refresh keeps the session.
 */

import { Platform } from 'react-native';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  browserPopupRedirectResolver,
  type Auth,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const isFirstInit = getApps().length === 0;
const app = isFirstInit ? initializeApp(firebaseConfig) : getApp();

/**
 * initializeAuth must only be called once per app instance.
 * On fast refresh, fall back to getAuth(app).
 *
 * We guard browser-specific options with `typeof window !== 'undefined'`
 * because Expo Router's SSR renderer runs on Node.js where browser classes
 * (browserPopupRedirectResolver, indexedDBLocalPersistence) don't exist.
 */
function initAuth(): Auth {
  if (!isFirstInit) return getAuth(app);

  const isBrowser = typeof window !== 'undefined';

  if (isBrowser && Platform.OS === 'web') {
    return initializeAuth(app, {
      persistence: indexedDBLocalPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  }

  if (isBrowser) {
    // Native iOS/Android — persist auth state across app restarts via AsyncStorage.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getReactNativePersistence } = require('firebase/auth');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  }

  // Server-side rendering on Node.js — no persistence
  return initializeAuth(app);
}

export const auth = initAuth();
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
