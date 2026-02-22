import { Hazard, Session, CreateHazardPayload, CreateSessionPayload } from '../types';

// Re-export types so callers can import them from this module
export type { Hazard, Session, CreateHazardPayload, CreateSessionPayload };
import { Platform } from 'react-native';
import { auth } from './firebase';

const defaultBaseUrl =
  Platform.OS === 'android' ? 'http://10.0.2.2:5000' : 'http://127.0.0.1:5000';
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
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
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
// Sessions  —  POST/GET /sessions, POST /sessions/<id>/end
// ---------------------------------------------------------------------------

/** POST /sessions — start a new dashcam recording session */
export function createSession(device_id: string): Promise<Session> {
  const payload: CreateSessionPayload = { device_id };
  return request<Session>('/sessions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** GET /sessions — all sessions, newest first */
export function getSessions(): Promise<Session[]> {
  return request<Session[]>('/sessions');
}

/** GET /sessions/<id> — fetch one session */
export function getSession(id: string): Promise<Session> {
  return request<Session>(`/sessions/${id}`);
}

/** POST /sessions/<id>/end — mark session as completed */
export function endSession(id: string): Promise<{ message: string; session_id: string }> {
  return request<{ message: string; session_id: string }>(`/sessions/${id}/end`, {
    method: 'POST',
  });
}

/** GET /sessions/<id>/hazards — hazards for a session, ascending by timestamp */
export function getSessionHazards(sessionId: string): Promise<Hazard[]> {
  return request<Hazard[]>(`/sessions/${sessionId}/hazards`);
}

// ---------------------------------------------------------------------------
// Hazards  —  POST/GET/DELETE /hazards
// ---------------------------------------------------------------------------

/** GET /hazards — all hazards, newest first */
export function getHazards(): Promise<Hazard[]> {
  return request<Hazard[]>('/hazards');
}

/** GET /hazards/<id> — fetch one hazard */
export function getHazard(id: string): Promise<Hazard> {
  return request<Hazard>(`/hazards/${id}`);
}

/** POST /hazards — record a new hazard event (also used for manual reports) */
export function createHazard(payload: CreateHazardPayload): Promise<Hazard> {
  return request<Hazard>('/hazards', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** DELETE /hazards/<id> — permanently delete a hazard */
export function deleteHazard(id: string): Promise<{ message: string; hazard_id: string }> {
  return request<{ message: string; hazard_id: string }>(`/hazards/${id}`, {
    method: 'DELETE',
  });
}
