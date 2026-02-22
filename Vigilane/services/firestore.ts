/**
 * Vigilane/services/firestore.ts
 *
 * Persists confirmed hazard detections and user settings directly to Cloud Firestore.
 *
 * Hazard schema matches src/database/models/hazard.py:
 *   session_id, confidence, labels, bboxes, frame_number, timestamp,
 *   status, photo_url, location
 *
 * Settings are stored as a `settings` map field on the user's document:
 *   users/{uid} → { settings: Settings }
 */

import { addDoc, collection, doc, getDoc, getDocs, increment, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';

import { auth } from './firebase';
import { db } from './firebase';
import type { BoundingBox, Hazard, Settings } from '@/types';

// ---------------------------------------------------------------------------
// User settings — stored as users/{uid}.settings
// ---------------------------------------------------------------------------

export const DEFAULT_SETTINGS: Settings = {
  potholesEnabled: true,
  debrisEnabled: true,
  stalledVehiclesEnabled: true,
  trafficAccidentsEnabled: false,
  audioAlertsEnabled: true,
  visualFlashesEnabled: false,
  autoUploadEnabled: true,
  alertVolume: 100,
};

/**
 * Reads the `settings` field from `users/{uid}`.
 * Falls back to DEFAULT_SETTINGS if the document or field is absent.
 * Never throws.
 */
export async function getUserSettings(uid: string): Promise<Settings> {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return DEFAULT_SETTINGS;
    const data = snap.data();
    // Merge with defaults so newly-added fields are backfilled automatically.
    return { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) } as Settings;
  } catch (err) {
    console.warn('[firestore] getUserSettings failed:', err);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Upserts the `settings` field on `users/{uid}`.
 * Uses merge: true so other fields on the user document are untouched.
 * Never throws.
 */
export async function saveUserSettings(uid: string, settings: Settings): Promise<void> {
  try {
    await setDoc(doc(db, 'users', uid), { settings }, { merge: true });
    console.log('[firestore] settings saved for', uid);
  } catch (err) {
    console.error('[firestore] saveUserSettings failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Hazards
// ---------------------------------------------------------------------------

export interface WriteHazardInput {
  confidence: number;
  bboxes: BoundingBox[];
  labels: string[];
  frameNumber?: number;
  user_uid?: string;
}

/**
 * Fetch all hazards belonging to the current user, sorted newest first.
 * Uses a simple where-only query (no composite index required).
 */
export async function getUserHazards(): Promise<Hazard[]> {
  console.log('[firestore] getUserHazards started');
  const user = auth.currentUser;
  console.log('[firestore] currentUser:', user?.uid ?? 'No user logged in');
  if (!user) {
    console.warn('[firestore] No user logged in, returning empty array');
    return [];
  }
  try {
    console.log('[firestore] Querying hazards for user:', user.uid);
    const q = query(collection(db, 'hazards'), where('user_uid', '==', user.uid));
    const snap = await getDocs(q);
    console.log('[firestore] Query completed, found', snap.docs.length, 'documents');
    const docs: Hazard[] = snap.docs.map((d) => {
      const data = d.data();
      const raw = data.timestamp;
      const timestamp =
        raw?.toDate?.()?.toISOString?.() ??
        (typeof raw === 'string' ? raw : new Date().toISOString());
      return {
        id: d.id,
        user_uid: data.user_uid ?? '',
        event_type: data.labels?.[0] ?? data.event_type ?? 'unknown',
        confidence: data.confidence ?? 0,
        labels: data.labels ?? [],
        bboxes: data.bboxes ?? [],
        frame_number: data.frame_number ?? 0,
        timestamp,
        status: data.status ?? 'pending',
        photo_url: data.photo_url ?? null,
      } as Hazard;
    });
    // Sort newest first in memory (avoids composite index requirement)
    docs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    console.log('[firestore] Returning', docs.length, 'sorted hazards');
    return docs;
  } catch (err) {
    console.error('[firestore] getUserHazards failed:', err);
    throw err;
  }
}

/**
 * Write a confirmed on-device detection directly to Firestore.
 * user_uid is taken from the currently signed-in Firebase user.
 * Never throws — failures are swallowed so detection never blocks on I/O.
 */
export async function writeHazard(sessionId: string, input: WriteHazardInput): Promise<void> {
  if (!sessionId) {
    console.warn('[firestore] writeHazard skipped: missing sessionId');
    return;
  }
  const { confidence, bboxes, labels, frameNumber = 0, user_uid } = input;

  try {
    const ref = await addDoc(collection(db, 'hazards'), {
      session_id: sessionId,
      user_uid: user_uid ?? null,
      confidence,
      labels,
      bboxes,
      frame_number: frameNumber,
      timestamp: serverTimestamp(),
      status: 'pending',
      photo_url: null,
    });

    console.log('[firestore] hazard written', ref.id);
  } catch (err) {
    console.error('[firestore] writeHazard failed:', err);
  }
}
