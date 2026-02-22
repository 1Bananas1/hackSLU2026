/**
 * Web stub for useRoadDamageDetector.
 *
 * react-native-fast-tflite and react-native-vision-camera are native-only
 * packages that cannot run in a browser. This file is picked up automatically
 * by Metro/Expo on web (*.web.ts takes precedence over *.ts) and returns
 * safe no-op values so the rest of the app can compile and run.
 */

import { useState } from 'react';

export interface Detection {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
  classId: number;
  className: string;
}

export function useRoadDamageDetector() {
  const [detections] = useState<Detection[]>([]);

  return {
    frameProcessor: undefined,
    detections,
    /** Always 'error' on web — model is not supported. */
    modelState: 'error' as const,
  };
}
