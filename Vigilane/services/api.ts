import { Platform } from 'react-native';

type Session = {
  id: string;
  device_id: string;
  start_time: string;
  end_time: string | null;
  hazard_count: number;
  status: string;
};

type Hazard = {
  id: string;
  confidence: number;
  bboxes: number[][];
  labels: string[];
  session_id: string;
  timestamp: string;
  frame_number: number;
};

const defaultApiBase =
  Platform.OS === 'android' ? 'http://10.0.2.2:5000' : 'http://127.0.0.1:5000';

export const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? defaultApiBase;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = (data as { error?: string })?.error ?? 'Request failed';
    throw new Error(message);
  }

  return data as T;
}

export async function createSession(deviceId: string): Promise<Session> {
  return request<Session>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ device_id: deviceId }),
  });
}

export async function endSession(sessionId: string): Promise<Session> {
  return request<Session>(`/api/sessions/${sessionId}/end`, {
    method: 'PATCH',
  });
}

export async function getSessionHazards(sessionId: string): Promise<Hazard[]> {
  return request<Hazard[]>(`/api/sessions/${sessionId}/hazards`);
}

export async function createHazard(payload: {
  confidence: number;
  bboxes: number[][];
  labels: string[];
  session_id: string;
  frame_number?: number;
}): Promise<Hazard> {
  return request<Hazard>('/api/hazards', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type { Session, Hazard };
