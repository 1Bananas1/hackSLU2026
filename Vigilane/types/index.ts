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
// Session types
// ---------------------------------------------------------------------------

export interface Session {
  id: string;
  device_id: string;
  start_time: string;
  end_time: string | null;
  hazard_count: number;
  status: 'active' | 'completed';
}

// ---------------------------------------------------------------------------
// Request payloads
// ---------------------------------------------------------------------------

/** POST /hazards */
export interface CreateHazardPayload {
  // user_uid is set server-side from the auth token — never send from client
  // status is always forced to "pending" on creation by the server
  session_id: string;
  confidence: number;
  labels: string[];
  bboxes: BoundingBox[];
  frame_number?: number;
  photo_url?: string | null;
  location?: HazardLocation | null;
}

/** POST /sessions */
export interface CreateSessionPayload {
  device_id: string;
}

// ---------------------------------------------------------------------------
// User settings
// ---------------------------------------------------------------------------

/**
 * Persisted in Firestore under users/{uid}.settings.
 * Read/write via getUserSettings / saveUserSettings in services/firestore.ts.
 */
export interface Settings {
  potholesEnabled: boolean;
  debrisEnabled: boolean;
  stalledVehiclesEnabled: boolean;
  trafficAccidentsEnabled: boolean;
  audioAlertsEnabled: boolean;
  visualFlashesEnabled: boolean;
  autoUploadEnabled: boolean;
  /** Alert volume 0-100.  0 = silent → confidence threshold raised to 0.99. */
  alertVolume: number;
}
