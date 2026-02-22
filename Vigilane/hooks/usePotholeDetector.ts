/**
 * usePotholeDetector
 *
 * Frame-processor hook that runs the exported YOLO road-damage TFLite model
 * on every camera frame and fires a temporally-smoothed alert when a hazard
 * is confirmed over a 3-frame window.
 *
 * ── Filtering pipeline (applied per detection before smoothing) ─────────────
 *   1. confidence < CONFIDENCE_THRESHOLD (0.12)  → reject   (noise)
 *   2. classId ∉ HAZARD_CLASS_IDS                → reject   (non-hazard class)
 *   3. bbox.y1 < frame.height × 0.55            → reject   (sky / far road)
 *   4. bbox.y1 > frame.height × 0.88            → reject   (car-hood occlusion)
 *
 * ── Temporal smoothing ──────────────────────────────────────────────────────
 *   • Circular buffer: 3 Shared Values (buf0–buf2), each 0 (clear) or 1
 *     (hazard present after filtering).
 *   • smoothed = (buf0 + buf1 + buf2) / 3
 *   • Alert fires when smoothed ≥ 0.34 AND framesSinceLastAlert ≥ 30.
 *   • Resets cooldown to 0 on each alert so back-to-back frames are suppressed.
 *
 * ── Output ──────────────────────────────────────────────────────────────────
 *   • detection — Reanimated SharedValue<AlertMetadata | null>
 *     Written from the worklet (zero extra JS-thread hop for overlays that
 *     use useAnimatedStyle / useAnimatedReaction).
 *   • lastAlert — plain React state, synchronised via runOnJS for components
 *     that prefer hooks over animated values.
 *   • modelState — 'loading' | 'loaded' | 'error'
 *
 * Model: best.tflite (YOLO, NMS=true, imgsz=640)
 * Input:  float32 RGB 640×640
 * Output: [1, num_detections, 6]  (flat Float32Array)
 *         Each row: [x1_norm, y1_norm, x2_norm, y2_norm, confidence, class_id]
 *
 * Class index mapping (6 classes):
 *   0 pothole · 1 alligator cracking · 2 longitudinal cracking
 *   3 transverse cracking · 4 rutting · 5 patching
 */

import { useMemo, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { useFrameProcessor } from 'react-native-vision-camera';
import { useSharedValue } from 'react-native-reanimated';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { Worklets } from 'react-native-worklets-core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Human-readable name for each YOLO class index. */
const CLASS_NAMES: Record<number, string> = {
  0: 'pothole',
  1: 'alligator cracking',
  2: 'longitudinal cracking',
  3: 'transverse cracking',
  4: 'rutting',
  5: 'patching',
};

/**
 * Subset of class indices that warrant a driver alert.
 * Set any entry to false to suppress that damage type.
 */
const HAZARD_CLASS_IDS: Record<number, boolean> = {
  0: true,  // pothole
  1: true,  // alligator cracking
  2: true,  // longitudinal cracking
  3: true,  // transverse cracking
  4: true,  // rutting
  5: true,  // patching — repair mark (set false to suppress)
};

/** Minimum detection confidence — mirrors the ML pipeline CONFIDENCE_THRESHOLD. */
const CONFIDENCE_THRESHOLD = 0.12;

/** Number of frames in the temporal smoothing window. */
const BUFFER_SIZE = 3;

/**
 * A frame fires its alert slot when smoothed ≥ this value.
 * 0.34 ≈ 1/3, so at least one of the last three frames must contain a hazard.
 */
const SMOOTHED_THRESHOLD = 0.34;

/** Minimum frames between consecutive alerts (≈ 1 second at 30 fps). */
const COOLDOWN_FRAMES = 30;

/** Run inference every Nth frame. On device: every 3rd (~10 fps of ML). On emulator: every frame
 *  because the emulator camera already throttles itself to ~1 fps naturally. */
const FRAME_SKIP = Constants.isDevice ? 3 : 1;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BBox {
  /** Normalised [0, 1] coordinates relative to the 640 × 640 model input. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface AlertMetadata {
  /** Highest confidence score among all filtered detections in this alert. */
  confidence: number;
  /** Filtered bounding boxes (normalised). */
  bboxes: BBox[];
  /** Class name strings matching each bbox. */
  labels: string[];
  /** JS timestamp (Date.now()) at the moment the alert was triggered. */
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePotholeDetector() {
  // React state — convenient for components that prefer useState semantics.
  const [lastAlert, setLastAlert] = useState<AlertMetadata | null>(null);

  // ── Model ───────────────────────────────────────────────────────────────
  // Use CoreML (Metal) on iOS for GPU-accelerated inference; CPU on Android
  // (GPU delegate crashes on emulators).  model.state is 'loading' | 'loaded' | 'error'.
  const delegate = Platform.OS === 'ios' ? 'core-ml' : 'default';
  const model = useTensorflowModel(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../assets/models/best.tflite'),
    delegate,
  );

  const { resize } = useResizePlugin();

  // ── Circular buffer (Reanimated SharedValues — worklet-safe) ────────────
  // Three independent slots avoids array mutation inside the worklet,
  // which keeps the write path allocation-free.
  const buf0 = useSharedValue(0);
  const buf1 = useSharedValue(0);
  const buf2 = useSharedValue(0);
  const bufIdx = useSharedValue(0);

  /** Frames elapsed since the last alert; starts at COOLDOWN_FRAMES so the
   *  first valid detection can fire immediately. */
  const cooldown = useSharedValue(COOLDOWN_FRAMES);
  const frameCount = useSharedValue(0);

  /**
   * Shared detection result — written directly from the worklet, so animated
   * overlays (useAnimatedStyle / useAnimatedReaction) can read it without an
   * extra JS-thread round-trip.
   */
  const detection = useSharedValue<AlertMetadata | null>(null);

  // ── JS-thread alert callback ─────────────────────────────────────────────
  const syncAlertToState = useMemo(
    () =>
      Worklets.createRunOnJS((meta: AlertMetadata) => {
        setLastAlert(meta);
      }),
    [],
  );

  // ── Frame processor worklet ─────────────────────────────────────────────
  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';

      // Guard: model may still be loading on the first frames.
      if (model.state !== 'loaded' || model.model == null) return;

      // Run inference every Nth frame (3 on device, 15 on emulator).
      frameCount.value += 1;
      if (frameCount.value % FRAME_SKIP !== 0) return;

      cooldown.value += 1;

      // Resize the camera frame to the model's expected 640×640 float32 RGB
      // input before calling runSync.  The vision-camera-resize-plugin
      // performs this conversion inside the worklet (no JS round-trip).
      const resized = resize(frame, {
        scale: { width: 640, height: 640 },
        pixelFormat: 'rgb',
        dataType: 'float32',
        rotation: '0deg',
      });

      // Run synchronous TFLite inference — equivalent to model.runSync([frame])
      // once the frame has been pre-processed to the correct tensor format.
      // Output[0]: flat Float32Array of shape [1, num_detections, 6].
      // Each detection row: [x1_norm, y1_norm, x2_norm, y2_norm, conf, class_id]
      const outputs = model.model.runSync([resized]);
      const raw = outputs[0] as Float32Array;

      // ── Parse & filter detections ──────────────────────────────────────
      const bboxes: BBox[] = [];
      const labels: string[] = [];
      let maxConfidence = 0;
      const numDetections = raw.length / 6;

      for (let i = 0; i < numDetections; i++) {
        const base = i * 6;
        const confidence = raw[base + 4];

        // 1. Confidence gate — mirrors ML pipeline CONFIDENCE_THRESHOLD.
        if (confidence < CONFIDENCE_THRESHOLD) continue;

        const classId = Math.round(raw[base + 5]);

        // 2. Hazard class filter.
        if (!HAZARD_CLASS_IDS[classId]) continue;

        // Bounding box in normalised [0, 1] coordinates.
        const x1 = raw[base];
        const y1 = raw[base + 1];
        const x2 = raw[base + 2];
        const y2 = raw[base + 3];

        // 3. Sky filter — top edge of bbox above 55 % of frame height.
        //    y1 is normalised, so y1 * frame.height gives the pixel position.
        if (y1 * frame.height < frame.height * 0.55) continue;

        // 4. Car-hood filter — top edge of bbox below 88 % of frame height.
        if (y1 * frame.height > frame.height * 0.88) continue;

        bboxes.push({ x1, y1, x2, y2 });
        labels.push(CLASS_NAMES[classId] ?? 'unknown');
        if (confidence > maxConfidence) maxConfidence = confidence;
      }

      // ── Circular buffer update ─────────────────────────────────────────
      const hasHazard = bboxes.length > 0 ? 1 : 0;
      const idx = bufIdx.value;

      // Write to the slot corresponding to the current frame.
      if (idx === 0) buf0.value = hasHazard;
      else if (idx === 1) buf1.value = hasHazard;
      else buf2.value = hasHazard;

      // Advance write head (wraps at BUFFER_SIZE).
      bufIdx.value = (idx + 1) % BUFFER_SIZE;

      // ── Temporal smoothing ─────────────────────────────────────────────
      // smoothed is in [0, 1]: 1.0 means all 3 recent frames had detections.
      const smoothed = (buf0.value + buf1.value + buf2.value) / BUFFER_SIZE;

      // ── Alert trigger ──────────────────────────────────────────────────
      if (
        smoothed >= SMOOTHED_THRESHOLD &&
        cooldown.value >= COOLDOWN_FRAMES &&
        hasHazard === 1
      ) {
        cooldown.value = 0; // reset cooldown

        const meta: AlertMetadata = {
          confidence: maxConfidence,
          bboxes,
          labels,
          timestamp: Date.now(),
        };

        // Write to Shared Value first (zero-latency for animated overlays).
        detection.value = meta;

        // Then synchronise to React state for non-animated consumers.
        syncAlertToState(meta);
      }
    },
    // Shared values (buf0–buf2, bufIdx, cooldown, detection) are captured by
    // reference and do not need to appear in the dependency array — they are
    // stable JSI objects that mutate in place.
    [model, resize, syncAlertToState, frameCount],
  );

  return {
    frameProcessor,
    /**
     * Reanimated SharedValue holding the most recent alert metadata.
     * Use with useAnimatedStyle / useAnimatedReaction for zero-JS-thread-hop
     * overlay rendering.
     */
    detection,
    /**
     * Same alert mirrored as plain React state.  Convenient for components
     * that don't need animated styling.
     */
    lastAlert,
    /** 'loading' | 'loaded' | 'error' */
    modelState: model.state,
  };
}
