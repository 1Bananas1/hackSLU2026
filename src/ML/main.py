"""
Live Pothole Detection using YOLOv8 (keremberke/yolov8n-pothole-segmentation)
HackSLU 2026 - Dashcam Infrastructure Auto Reporter

Detects potholes from a webcam or video file using a YOLOv8 model
pre-trained on pothole data. Prints to console when detected above threshold.

Usage:
    python main.py --webcam 0
    python main.py --video dashcam.mp4
    python main.py --webcam 0 --threshold 0.4 --skip 2 --no-display
"""

import argparse
import datetime
import os
import sys
from collections import deque

import cv2
from ultralytics import YOLO

# ---------------------------------------------------------------------------
# Constants — override via CLI flags
# ---------------------------------------------------------------------------
MODEL_PATH = "src/ML/best.pt"

CONFIDENCE_THRESHOLD = 0.12   # min per-detection YOLO confidence to count
HAZARD_CLASSES = {            # all pavement distress types worth alerting on
    "pothole",
    "alligator cracking",
    "longitudinal cracking",
    "transverse cracking",
    "rutting",
    "patching",
}
ROI_TOP_FRACTION = 0.55       # ignore detections in the top N% of frame (sky/horizon can't be potholes)
ROI_BOTTOM_FRACTION = 0.88    # ignore detections below this point (car hood reflections)
FRAME_SKIP = 1                 # run inference every frame (damage passes fast at highway speeds)
WINDOW_SIZE = 3                # rolling window for smoothing (processed frames)
SMOOTHED_THRESHOLD = 0.34      # fraction of window frames with a detection to alert (1/3 frames)
ALERT_COOLDOWN = 30            # min frames between printed alerts
OUTPUT_DIR = "dataset/output"  # where to save detection snapshots


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------
def load_model():
    print(f"[INFO] Loading fine-tuned YOLOv8 model from {MODEL_PATH}...")
    model = YOLO(MODEL_PATH)
    print("[INFO] Model ready.")
    return model


# ---------------------------------------------------------------------------
# Single-frame inference
# ---------------------------------------------------------------------------
def run_inference(model, frame, conf_threshold):
    """
    Run YOLO on a BGR frame.
    Returns (max_conf: float, detections: list[dict])
    where each detection is {"conf": float, "bbox": [x1,y1,x2,y2], "label": str}.
    Only returns detections matching POTHOLE_CLASS.
    """
    results = model(frame, conf=conf_threshold, verbose=False)
    boxes = results[0].boxes

    if boxes is None or len(boxes) == 0:
        return 0.0, []

    confs = boxes.conf.cpu().numpy()
    xyxy = boxes.xyxy.cpu().numpy()
    cls_ids = boxes.cls.cpu().numpy().astype(int)
    names = results[0].names

    import os as _os
    if _os.environ.get("YOLO_RAW_DEBUG"):
        for c, b, cls_id in zip(confs, xyxy, cls_ids):
            print(f"  RAW: {names[cls_id]} conf={float(c):.2f} y1={b[1]:.0f}")

    h = frame.shape[0]
    roi_min_y = h * ROI_TOP_FRACTION
    roi_max_y = h * ROI_BOTTOM_FRACTION

    detections = [
        {"conf": float(c), "bbox": b.tolist(), "label": names[cls_id]}
        for c, b, cls_id in zip(confs, xyxy, cls_ids)
        if names[cls_id] in HAZARD_CLASSES and roi_min_y <= b[1] < roi_max_y
    ]

    if not detections:
        return 0.0, []
    return max(d["conf"] for d in detections), detections


# ---------------------------------------------------------------------------
# Alert
# ---------------------------------------------------------------------------
def trigger_alert(max_conf, detections, frame_number):
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(
        f"[{timestamp}] POTHOLE DETECTED | "
        f"Confidence: {max_conf:.2f} | "
        f"Boxes: {len(detections)} | "
        f"Frame: {frame_number}"
    )


# ---------------------------------------------------------------------------
# Optional display annotation
# ---------------------------------------------------------------------------
def annotate_frame(frame, detections, max_conf):
    for det in detections:
        x1, y1, x2, y2 = (int(v) for v in det["bbox"])
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
        cv2.putText(
            frame, f"{det['conf']:.2f}", (x1, max(y1 - 8, 0)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2,
        )
    cv2.putText(
        frame, f"Max conf: {max_conf:.2f}", (10, 30),
        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 0), 2,
    )
    return frame


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def parse_args():
    parser = argparse.ArgumentParser(
        description="Live pothole detection using YOLOv8"
    )
    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument(
        "--webcam", type=int, metavar="INDEX",
        help="Webcam device index (e.g. 0 for default camera)",
    )
    source_group.add_argument(
        "--video", type=str, metavar="PATH",
        help="Path to a video file (e.g. dashcam.mp4)",
    )
    parser.add_argument(
        "--no-display", action="store_true",
        help="Disable the cv2 video window (headless/console-only mode)",
    )
    parser.add_argument(
        "--threshold", type=float, default=CONFIDENCE_THRESHOLD,
        help=f"Per-detection YOLO confidence threshold 0-1 (default: {CONFIDENCE_THRESHOLD})",
    )
    parser.add_argument(
        "--skip", type=int, default=FRAME_SKIP,
        help=f"Run inference every Nth frame (default: {FRAME_SKIP})",
    )
    parser.add_argument(
        "--window", type=int, default=WINDOW_SIZE,
        help=f"Smoothing window size in processed frames (default: {WINDOW_SIZE})",
    )
    parser.add_argument(
        "--debug", action="store_true",
        help="Print raw YOLO detections for every processed frame",
    )
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
def main():
    args = parse_args()

    model = load_model()

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    source = args.webcam if args.webcam is not None else args.video
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print(f"[ERROR] Could not open video source: {source}", file=sys.stderr)
        sys.exit(1)

    show_window = not args.no_display
    conf_threshold = args.threshold
    frame_skip = args.skip
    window_size = args.window
    debug = args.debug

    # Rolling window: 1 = pothole detected this frame, 0 = not detected
    detection_window = deque(maxlen=window_size)
    frame_count = 0
    processed_count = 0
    last_alert_frame = -ALERT_COOLDOWN

    print(f"[INFO] Starting (skip={frame_skip}, window={window_size}, threshold={conf_threshold}).")
    if show_window:
        print("[INFO] Press 'q' to quit.")
    else:
        print("[INFO] Headless mode. Press Ctrl+C to quit.")

    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                print("[INFO] End of video stream.")
                break

            frame_count += 1

            # Skip frames — still show them in display
            if frame_count % frame_skip != 0:
                if show_window:
                    cv2.imshow("Pothole Detector", frame)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break
                continue

            processed_count += 1

            # YOLO inference (native BGR frame — no conversion needed)
            max_conf, detections = run_inference(model, frame, conf_threshold)

            detected = 1 if detections else 0
            detection_window.append(detected)

            if debug:
                print(
                    f"[DEBUG] frame={frame_count} detected={detected} "
                    f"max_conf={max_conf:.2f} n_boxes={len(detections)}"
                )

            # Smoothed confidence over rolling window
            smoothed = sum(detection_window) / len(detection_window) if detection_window else 0.0

            if (
                detected
                and smoothed >= SMOOTHED_THRESHOLD
                and (frame_count - last_alert_frame) >= ALERT_COOLDOWN
            ):
                trigger_alert(max_conf, detections, frame_count)
                last_alert_frame = frame_count
                ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                raw_path = os.path.join(OUTPUT_DIR, f"pothole_{ts}_f{frame_count}_raw.jpg")
                ann_path = os.path.join(OUTPUT_DIR, f"pothole_{ts}_f{frame_count}_ann.jpg")
                cv2.imwrite(raw_path, frame)
                cv2.imwrite(ann_path, annotate_frame(frame.copy(), detections, max_conf))
                if debug:
                    print(f"[DEBUG] Saved raw: {raw_path}")
                    print(f"[DEBUG] Saved annotated: {ann_path}")

            # Display
            if show_window:
                if detections:
                    frame = annotate_frame(frame, detections, max_conf)
                elif smoothed > 0:
                    cv2.putText(
                        frame, f"Smoothed: {smoothed:.2f}", (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 200, 0), 2,
                    )
                cv2.imshow("Pothole Detector", frame)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

    except KeyboardInterrupt:
        print("\n[INFO] Interrupted by user.")
    finally:
        cap.release()
        if show_window:
            cv2.destroyAllWindows()
        print("[INFO] Done.")


if __name__ == "__main__":
    main()
