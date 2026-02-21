import { Hazard, Session, CreateHazardPayload, CreateSessionPayload } from '../types';
import { Platform } from 'react-native';

const defaultBaseUrl =
  Platform.OS === 'android' ? 'http://10.0.2.2:5000' : 'http://127.0.0.1:5000';
export const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? defaultBaseUrl;

// ---------------------------------------------------------------------------
// Auth token
// ---------------------------------------------------------------------------

/**
 * Returns the Firebase ID token for the current user.
 * TODO: replace stub with real Firebase Auth once configured, e.g.:
 *   import auth from '@react-native-firebase/auth';
 *   return (await auth().currentUser?.getIdToken()) ?? '';
 */
async function getAuthToken(): Promise<string> {
  return '';
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

/** GET /api/health — no auth required */
export async function healthCheck(): Promise<{ status: string; error?: string }> {
  const res = await fetch(`${BASE_URL}/api/health`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Sessions  —  POST/GET /api/sessions, PATCH /api/sessions/<id>/end
// ---------------------------------------------------------------------------

/** POST /sessions — start a new dashcam recording session */
export function createSession(device_id: string): Promise<Session> {
  const payload: CreateSessionPayload = { device_id };
  return request<Session>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** GET /sessions — all sessions, newest first */
export function getSessions(): Promise<Session[]> {
  return request<Session[]>('/api/sessions');
}

/** GET /sessions/<id> — fetch one session */
export function getSession(id: string): Promise<Session> {
  return request<Session>(`/api/sessions/${id}`);
}

/** PATCH /api/sessions/<id>/end — mark session as completed */
export function endSession(id: string): Promise<Session> {
  return request<Session>(`/api/sessions/${id}/end`, {
    method: 'PATCH',
  });
}

/** GET /sessions/<id>/hazards — hazards for a session, ascending by timestamp */
export function getSessionHazards(sessionId: string): Promise<Hazard[]> {
  return request<Hazard[]>(`/api/sessions/${sessionId}/hazards`);
}

// ---------------------------------------------------------------------------
// Hazards  —  POST/GET/DELETE /api/hazards
// ---------------------------------------------------------------------------

/** GET /hazards — all hazards, newest first */
export function getHazards(): Promise<Hazard[]> {
  return request<Hazard[]>('/api/hazards');
}

/** GET /hazards/<id> — fetch one hazard */
export function getHazard(id: string): Promise<Hazard> {
  return request<Hazard>(`/api/hazards/${id}`);
}

/** POST /hazards — record a new hazard event (also used for manual reports) */
export function createHazard(payload: CreateHazardPayload): Promise<Hazard> {
  return request<Hazard>('/api/hazards', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** DELETE /api/hazards/<id> — permanently delete a hazard */
export function deleteHazard(id: string): Promise<{ deleted: boolean; hazard_id: string }> {
  return request<{ deleted: boolean; hazard_id: string }>(`/api/hazards/${id}`, {
    method: 'DELETE',
  });
}
