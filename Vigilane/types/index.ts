// ---------------------------------------------------------------------------
// Firestore-backed types — mirrors SCHEMA.md exactly
// ---------------------------------------------------------------------------

export interface BoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface HazardLocation {
  lat: number;
  lng: number;
}

/** Hazard document as returned by GET /hazards and GET /hazards/<id> */
export interface Hazard {
  id: string;           // Firestore document ID (injected by API)
  user_uid: string;     // Firebase Auth UID of the creator
  event_type: string;   // Primary hazard category, e.g. "pothole"
  confidence: number;   // 0.0 – 1.0
  labels: string[];     // e.g. ["pothole"]
  bboxes: BoundingBox[];
  frame_number: number;
  timestamp: string;    // ISO-8601 UTC string
  // Fields from SCHEMA.md (may be absent in older records)
  status?: 'pending' | 'reported' | 'dismissed';
  photo_url?: string | null;
  location?: HazardLocation | null;
}

// ---------------------------------------------------------------------------
// Request payloads
// ---------------------------------------------------------------------------

/** POST /hazards */
export interface CreateHazardPayload {
  // user_uid is set server-side from the auth token — never send from client
  // status is always forced to "pending" on creation by the server
  confidence: number;
  labels: string[];
  bboxes: BoundingBox[];
  frame_number?: number;
  photo_url?: string | null;
  location?: HazardLocation | null;
}

// ---------------------------------------------------------------------------
// Local-only types (no backend endpoint yet)
// ---------------------------------------------------------------------------

/**
 * Settings are persisted locally only — there is no /settings endpoint.
 * Future: add a Firestore `settings` collection and wire up via api.ts.
 */
export interface Settings {
  potholesEnabled: boolean;
  debrisEnabled: boolean;
  stalledVehiclesEnabled: boolean;
  trafficAccidentsEnabled: boolean;
  sensitivity: number;
  audioAlertsEnabled: boolean;
  visualFlashesEnabled: boolean;
  autoUploadEnabled: boolean;
}
