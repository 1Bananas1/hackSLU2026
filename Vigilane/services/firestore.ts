/**
 * Vigilane/services/firestore.ts
 *
 * Persists confirmed hazard detections directly to Cloud Firestore.
 *
 * Schema matches src/database/models/hazard.py:
 *   user_uid, confidence, labels, bboxes, frame_number, timestamp,
 *   status, photo_url, location
 */

import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

import { auth, db } from './firebase';
import type { BoundingBox } from '@/types';

export interface WriteHazardInput {
  confidence: number;
  bboxes: BoundingBox[];
  labels: string[];
  frameNumber?: number;
  location?: { lat: number; lng: number } | null;
}

/**
 * Write a confirmed on-device detection directly to Firestore.
 * user_uid is taken from the currently signed-in Firebase user.
 * Never throws — failures are swallowed so detection never blocks on I/O.
 */
export async function writeHazard(input: WriteHazardInput): Promise<void> {
  const { confidence, bboxes, labels, frameNumber = 0, location = null } = input;

  const uid = auth.currentUser?.uid;
  if (!uid) {
    if (__DEV__) console.warn('[firestore] writeHazard: no authenticated user');
    return;
  }

  try {
    const ref = await addDoc(collection(db, 'hazards'), {
      user_uid: uid,
      confidence,
      labels,
      bboxes,
      frame_number: frameNumber,
      timestamp: serverTimestamp(),
      status: 'pending',
      photo_url: null,
      location,
    });

    if (__DEV__) console.debug('[firestore] hazard written', ref.id);
  } catch (err) {
    if (__DEV__) console.warn('[firestore] writeHazard failed:', err);
  }
}
