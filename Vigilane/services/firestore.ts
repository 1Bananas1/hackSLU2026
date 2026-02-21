/**
 * Vigilane/services/firestore.ts
 *
 * Persists confirmed hazard detections directly to Cloud Firestore.
 *
 * Schema matches src/database/models/hazard.py exactly:
 *   session_id, confidence, labels, bboxes, frame_number, timestamp,
 *   status, photo_url, location
 *
 * All writes are fire-and-forget from the caller's perspective.
 * Network/Firestore errors are caught and silenced so the camera feed
 * and detection loop are never interrupted.
 */

import {
  addDoc,
  collection,
  doc,
  increment,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';

import { db } from './firebase';
import type { BoundingBox } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WriteHazardInput {
  confidence: number;
  /** Normalised [0, 1] bounding boxes from the on-device YOLO model. */
  bboxes: BoundingBox[];
  labels: string[];
  frameNumber?: number;
}

// ---------------------------------------------------------------------------
// writeHazard
// ---------------------------------------------------------------------------

/**
 * Write a confirmed hazard to Cloud Firestore — adds a document to the
 * `hazards` collection and atomically increments `hazard_count` on the
 * parent session document.
 *
 * Never throws — any failure is swallowed so detection never blocks on I/O.
 */
export async function writeHazard(
  sessionId: string,
  input: WriteHazardInput,
): Promise<void> {
  const { confidence, bboxes, labels, frameNumber = 0 } = input;

  // ── 1. Firestore ──────────────────────────────────────────────────────────
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

    // Atomically increment the session's hazard counter.
    await updateDoc(doc(db, 'sessions', sessionId), {
      hazard_count: increment(1),
    });

    if (__DEV__) {
      console.debug('[firestore] hazard written', ref.id);
    }
  } catch (err) {
    if (__DEV__) {
      console.warn('[firestore] writeHazard failed:', err);
    }
    // Swallow — Firestore may be unreachable or env vars not yet set.
  }

}
