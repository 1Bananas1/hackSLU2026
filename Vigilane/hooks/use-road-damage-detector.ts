/**
 * useRoadDamageDetector
 *
 * Wraps react-native-fast-tflite + react-native-vision-camera to run the
 * exported YOLO road-damage model on every camera frame.
 *
 * Model: best.tflite (YOLO with NMS, imgsz=640)
 * Input:  [1, 640, 640, 3]  float32 RGB
 * Output: [1, num_detections, 6]  flat Float32Array
 *         Each detection row: [x1_norm, y1_norm, x2_norm, y2_norm, confidence, class_id]
 *
 * Class index mapping (6 classes):
 *   0: pothole
 *   1: alligator cracking
 *   2: longitudinal cracking
 *   3: transverse cracking
 *   4: rutting
 *   5: patching
 */

import { useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { useFrameProcessor } from 'react-native-vision-camera';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { Worklets } from 'react-native-worklets-core';

const CLASS_NAMES = [
  'pothole',
  'alligator cracking',
  'longitudinal cracking',
  'transverse cracking',
  'rutting',
  'patching',
] as const;

const CONFIDENCE_THRESHOLD = 0.5;

export interface Detection {
  /** Normalised [0, 1] bounding box coordinates relative to 640×640 input. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
  classId: number;
  className: string;
}

export function useRoadDamageDetector() {
  const [detections, setDetections] = useState<Detection[]>([]);

  // Use CoreML on iOS for GPU-accelerated inference; CPU on Android (GPU delegate
  // crashes on emulators — swap to 'gpu' for real-device production builds).
  const delegate = Platform.OS === 'ios' ? 'coreml' : 'default';
  const model = useTensorflowModel(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../assets/models/best.tflite'),
    delegate,
  );

  const { resize } = useResizePlugin();

  // Create a stable JS-thread callback that can be called from the worklet.
  const setDetectionsOnJS = useMemo(
    () => Worklets.createRunOnJS((dets: Detection[]) => setDetections(dets)),
    [],
  );

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      if (model.state !== 'loaded' || model.model == null) return;

      let resized: Float32Array;
      try {
        // Resize the camera frame to 640×640 float32 RGB — YOLO input format.
        resized = resize(frame, {
          scale: { width: 640, height: 640 },
          pixelFormat: 'rgb',
          dataType: 'float32',
          rotation: '0deg',
        });
      } catch {
        return;
      }

      // Run synchronous TFLite inference.
      // Output shape: [1, num_detections, 6] stored as a flat Float32Array.
      const outputs = model.model.runSync([resized]);
      const raw = outputs[0] as Float32Array;

      const parsed: Detection[] = [];
      const numDetections = raw.length / 6;
      for (let i = 0; i < numDetections; i++) {
        const base = i * 6;
        const confidence = raw[base + 4];
        if (confidence < CONFIDENCE_THRESHOLD) continue;
        const classId = Math.round(raw[base + 5]);
        parsed.push({
          x1: raw[base],
          y1: raw[base + 1],
          x2: raw[base + 2],
          y2: raw[base + 3],
          confidence,
          classId,
          className: CLASS_NAMES[classId] ?? 'unknown',
        });
      }

      setDetectionsOnJS(parsed);
    },
    [model, resize, setDetectionsOnJS],
  );

  return {
    frameProcessor,
    detections,
    /** 'loading' | 'loaded' | 'error' */
    modelState: model.state,
  };
}
