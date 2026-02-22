import { Hazard, Session, CreateHazardPayload, CreateSessionPayload } from '../types';

// Re-export types so callers can import them from this module
export type { Hazard, Session, CreateHazardPayload, CreateSessionPayload };
import { Platform } from 'react-native';
import { auth } from './firebase';

const defaultBaseUrl =
  Platform.OS === 'android' ? 'http://10.0.2.2:5000' : 'http://192.168.1.93:5000';
export const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? defaultBaseUrl;

// ---------------------------------------------------------------------------
// Auth token
// ---------------------------------------------------------------------------

/**
 * Returns the Firebase ID token for the current user, or '' if not signed in.
 * The token is automatically refreshed by the Firebase SDK when it expires.
 */
async function getAuthToken(): Promise<string> {
  return (await auth.currentUser?.getIdToken()) ?? '';
}

// ---------------------------------------------------------------------------
// Base fetch wrapper
// ---------------------------------------------------------------------------

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAuthToken();
  const url = `${BASE_URL}${path}`;

  console.log(`[API] Request: ${options.method || 'GET'} ${url}`);
  console.log(`[API] Auth token: ${token ? 'Present' : 'Missing'}`);

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  console.log(`[API] Response status: ${res.status} ${res.statusText}`);

  if (!res.ok) {
    const body = await res.text();
    console.error(`[API] Error response: ${body}`);
    throw new Error(`API ${res.status} ${res.statusText}: ${body}`);
  }

  const data = await res.json() as Promise<T>;
  console.log(`[API] Response received successfully`);
  return data;
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

/** GET / — no auth required */
export async function healthCheck(): Promise<{ status: string; service: string }> {
  const res = await fetch(`${BASE_URL}/`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Hazards  —  POST/GET/DELETE /hazards
// ---------------------------------------------------------------------------

/** GET /hazards — all hazards (optionally filtered by session) */
export async function getHazards(): Promise<Hazard[]> {
  console.log('[API] getHazards() called');
  const result = await request<Hazard[]>('/hazards');
  console.log(`[API] getHazards() returned ${result.length} hazards`);
  return result;
}

/** GET /api/hazards/<id> — fetch one hazard */
export function getHazard(id: string): Promise<Hazard> {
  return request<Hazard>(`/hazards/${id}`);
}

/**
 * POST /hazards — record a new hazard event.
 * user_uid is set server-side from the auth token; do not include it in payload.
 */
export function createHazard(payload: CreateHazardPayload): Promise<Hazard> {
  return request<Hazard>('/hazards', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** DELETE /hazards/<id> — permanently delete a hazard (owner only) */
export function deleteHazard(id: string): Promise<{ message: string; hazard_id: string }> {
  return request<{ message: string; hazard_id: string }>(`/hazards/${id}`, {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Sessions — POST /api/sessions, PATCH /api/sessions/<id>/end
// ---------------------------------------------------------------------------

/** POST /api/sessions — start a new recording session */
export function createSession(device_id: string): Promise<Session> {
  const payload: CreateSessionPayload = { device_id };
  return request<Session>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** PATCH /api/sessions/<id>/end — end an active session */
export function endSession(id: string): Promise<Session> {
  return request<Session>(`/api/sessions/${id}/end`, {
    method: 'PATCH',
  });
}

/** GET /api/sessions/<id>/hazards — hazards for a session */
export function getSessionHazards(id: string): Promise<Hazard[]> {
  return request<Hazard[]>(`/api/sessions/${id}/hazards`);
}
