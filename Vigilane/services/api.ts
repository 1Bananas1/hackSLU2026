import { Hazard, CreateHazardPayload } from '../types';

// Re-export types so callers can import them from this module
export type { Hazard, CreateHazardPayload };
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
// Hazards  —  POST/GET/DELETE /hazards
// ---------------------------------------------------------------------------

/** GET /hazards — the authenticated user's hazards, newest first */
export function getHazards(): Promise<Hazard[]> {
  return request<Hazard[]>('/hazards');
}

/** GET /hazards/<id> — fetch one hazard */
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
