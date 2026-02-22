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

import { addDoc, collection, doc, getDoc, increment, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

import { db } from './firebase';
import type { BoundingBox, Settings } from '@/types';

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
 * Never throws — failures are swallowed so detection never blocks on I/O.
 */
export async function writeHazard(sessionId: string, input: WriteHazardInput): Promise<void> {
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
      location: null,
    });

    await updateDoc(doc(db, 'sessions', sessionId), {
      hazard_count: increment(1),
    });

    console.log('[firestore] hazard written', ref.id);
  } catch (err) {
    console.error('[firestore] writeHazard failed:', err);
  }
}