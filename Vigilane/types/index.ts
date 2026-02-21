export interface ActivityLogEntry {
  time: string;
  title: string;
  sub?: string;
  ticketId?: string;
}

export interface Hazard {
  id: string;
  type: 'pothole' | 'accident' | 'debris' | 'construction';
  dateGroup: string;
  location: string;
  time: string;
  description: string;
  status: 'Reported' | 'In Review' | 'Ignored';
  thumbnailUrl: string;
  icon: string;
  iconBg: string;
  confidence: number;
  vehicleSpeed: number;
  gForce: number;
  latitude: number;
  longitude: number;
  videoUrl: string;
  activityLog: ActivityLogEntry[];
  createdAt: string;
}

export interface LiveDetection {
  hazardType: string;
  confidence: number;
  distanceFt: number;
  lane: string;
  isActive: boolean;
}

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

export interface ReportPayload {
  type: string;
  location: string;
  latitude: number;
  longitude: number;
  vehicleSpeed: number;
  gForce: number;
  videoPath?: string;
}
