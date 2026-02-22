/**
 * Vigilane/services/firestore.ts
 *
 * Persists confirmed hazard detections directly to Cloud Firestore.
 *
 * Schema matches src/database/models/hazard.py:
 *   session_id, confidence, labels, bboxes, frame_number, timestamp,
 *   status, photo_url, location
 */

import { addDoc, collection, doc, increment, serverTimestamp, updateDoc } from 'firebase/firestore';

import { db } from './firebase';
import type { BoundingBox } from '@/types';

export interface WriteHazardInput {
  confidence: number;
  bboxes: BoundingBox[];
  labels: string[];
  frameNumber?: number;
}

/**
 * Never throws — failures are swallowed so detection never blocks on I/O.
 */
export async function writeHazard(sessionId: string, input: WriteHazardInput): Promise<void> {
  const { confidence, bboxes, labels, frameNumber = 0 } = input;

  try {
    const ref = await addDoc(collection(db, 'hazards'), {
      session_id: sessionId,
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

    if (__DEV__) console.debug('[firestore] hazard written', ref.id);
  } catch (err) {
    if (__DEV__) console.warn('[firestore] writeHazard failed:', err);
  }
}