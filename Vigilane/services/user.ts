/**
 * Vigilane/services/user.ts
 *
 * Persists a Firebase Auth user's profile to the `users` Firestore collection.
 *
 * Schema:  users/{uid}
 *   uid:          string     — Firebase Auth UID (same as document ID)
 *   email:        string|null
 *   display_name: string|null
 *   photo_url:    string|null
 *   last_seen:    timestamp  — server-set, updated on every sign-in
 */

import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';

import { db } from './firebase';

/**
 * Write (or merge) a user profile document into `users/{uid}`.
 *
 * Called automatically by AuthContext whenever Firebase reports a signed-in
 * user. Uses merge:true so existing fields (e.g. a future `created_at`) are
 * never overwritten.
 *
 * Never throws — failures are swallowed so auth never blocks on Firestore I/O.
 */
export async function upsertUser(user: User): Promise<void> {
  try {
    await setDoc(
      doc(db, 'users', user.uid),
      {
        uid: user.uid,
        email: user.email ?? null,
        display_name: user.displayName ?? null,
        photo_url: user.photoURL ?? null,
        last_seen: serverTimestamp(),
      },
      { merge: true },
    );
    if (__DEV__) console.debug('[user] upserted', user.uid);
  } catch (err) {
    if (__DEV__) console.warn('[user] upsertUser failed:', err);
  }
}
