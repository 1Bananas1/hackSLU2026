import { Hazard, LiveDetection, Settings, ReportPayload } from '../types';

export const BASE_URL = 'http://localhost:5000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/**
 * GET /api/hazards?filter=<filter>
 * Returns list of hazards, optionally filtered by type or status.
 * filter: 'All' | 'Potholes' | 'Accidents' | 'Debris' | 'Reported'
 */
export function getHazards(filter = 'All'): Promise<Hazard[]> {
  const params = filter !== 'All' ? `?filter=${encodeURIComponent(filter)}` : '';
  return request<Hazard[]>(`/api/hazards${params}`);
}

/**
 * GET /api/hazards/:id
 * Returns a single hazard by ID with full details including activityLog.
 */
export function getHazard(id: string): Promise<Hazard> {
  return request<Hazard>(`/api/hazards/${id}`);
}

/**
 * POST /api/hazards
 * Manually report a new hazard from the live dashboard.
 */
export function reportHazard(payload: ReportPayload): Promise<{ id: string }> {
  return request<{ id: string }>('/api/hazards', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * GET /api/live/detection
 * Returns the most recent active detection for the live dashboard.
 * Returns null body (204) when nothing is currently detected.
 */
export async function getLiveDetection(): Promise<LiveDetection | null> {
  const res = await fetch(`${BASE_URL}/api/live/detection`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return res.json() as Promise<LiveDetection>;
}

/**
 * GET /api/settings
 * Returns current device/app settings.
 */
export function getSettings(): Promise<Settings> {
  return request<Settings>('/api/settings');
}

/**
 * PUT /api/settings
 * Persists a partial or full settings update.
 */
export function updateSettings(settings: Partial<Settings>): Promise<Settings> {
  return request<Settings>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}
