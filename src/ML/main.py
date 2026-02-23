"""
Live Pothole Detection using YOLOv8 (keremberke/yolov8n-pothole-segmentation)
HackSLU 2026 - Dashcam Infrastructure Auto Reporter

Detects potholes from a webcam or video file using a YOLOv8 model
pre-trained on pothole data. Prints to console when detected above threshold.

When a detection is triggered the driver is prompted via audio:
  "Was that a pothole?"
A spoken yes/no response confirms or discards the event.  Confirmed
detections are posted to the Vigilane Flask backend automatically.

Usage:
    python main.py --webcam 0
    python main.py --video dashcam.mp4
    python main.py --webcam 0 --threshold 0.5 --window 15 --skip 3 --no-display

    # With voice confirmation + API reporting:
    python main.py --webcam 0 --api-url http://127.0.0.1:5000 --auth-token <firebase-id-token>

    # Headless (no voice, no display):
    python main.py --webcam 0 --no-display --no-voice
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
MODEL_PATH = os.path.join(os.path.dirname(__file__), "best.pt")

CONFIDENCE_THRESHOLD = 0.01       # min per-detection YOLO confidence (normal)
SILENT_CONFIDENCE_THRESHOLD = 0.99  # threshold when system audio is muted
HAZARD_CLASSES = {  # all pavement distress types worth alerting on
    "pothole",
    "alligator cracking",
    "longitudinal cracking",
    "transverse cracking",
    "rutting",
    "patching",
}
ROI_TOP_FRACTION = (
    0.01  # ignore detections in the top N% of frame (sky/horizon can't be potholes)
)
ROI_BOTTOM_FRACTION = 0.08  # ignore detections below this point (car hood reflections)
FRAME_SKIP = 1  # run inference every frame (damage passes fast at highway speeds)
WINDOW_SIZE = 3  # rolling window for smoothing (processed frames)
SMOOTHED_THRESHOLD = (
    0.34  # fraction of window frames with a detection to alert (1/3 frames)
)
ALERT_COOLDOWN = 30  # min frames between printed alerts
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
# System volume / mute detection
# ---------------------------------------------------------------------------
def _get_volume_controller():
    """
    Return a pycaw IAudioEndpointVolume handle for the default speakers, or
    None if pycaw is unavailable (non-Windows, not installed, etc.).
    Called once at startup; the returned handle is reused on every poll.
    """
    try:
        from ctypes import cast, POINTER
        from comtypes import CLSCTX_ALL
        from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume

        devices = AudioUtilities.GetSpeakers()
        interface = devices.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
        return cast(interface, POINTER(IAudioEndpointVolume))
    except Exception:
        return None


def _is_muted(volume_ctrl) -> bool:
    """
    Return True if the system default audio output is currently muted.
    Falls back to False on any error so the detector keeps running normally.
    """
    if volume_ctrl is None:
        return False
    try:
        return bool(volume_ctrl.GetMute())
    except Exception:
        return False


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
            frame,
            f"{det['conf']:.2f}",
            (x1, max(y1 - 8, 0)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 0, 255),
            2,
        )
    cv2.putText(
        frame,
        f"Max conf: {max_conf:.2f}",
        (10, 30),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.0,
        (0, 255, 0),
        2,
    )
    return frame


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def parse_args():
    parser = argparse.ArgumentParser(description="Live pothole detection using YOLOv8")
    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument(
        "--webcam",
        type=int,
        metavar="INDEX",
        help="Webcam device index (e.g. 0 for default camera)",
    )
    source_group.add_argument(
        "--video",
        type=str,
        metavar="PATH",
        help="Path to a video file (e.g. dashcam.mp4)",
    )
    parser.add_argument(
        "--no-display",
        action="store_true",
        help="Disable the cv2 video window (headless/console-only mode)",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=CONFIDENCE_THRESHOLD,
        help=f"Per-detection YOLO confidence threshold 0-1 (default: {CONFIDENCE_THRESHOLD})",
    )
    parser.add_argument(
        "--skip",
        type=int,
        default=FRAME_SKIP,
        help=f"Run inference every Nth frame (default: {FRAME_SKIP})",
    )
    parser.add_argument(
        "--window",
        type=int,
        default=WINDOW_SIZE,
        help=f"Smoothing window size in processed frames (default: {WINDOW_SIZE})",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Print raw YOLO detections for every processed frame",
    )

    # --- Voice confirmation options ---
    parser.add_argument(
        "--no-voice",
        action="store_true",
        help="Disable voice confirmation (detections are only logged, not confirmed by voice)",
    )
    parser.add_argument(
        "--fallback",
        choices=["discard", "keep"],
        default="discard",
        help="What to do when the driver gives no clear response after reprompt "
        "(default: discard)",
    )

    # --- Backend API options ---
    parser.add_argument(
        "--api-url",
        type=str,
        default=None,
        metavar="URL",
        help="Base URL of the Vigilane Flask backend (e.g. http://127.0.0.1:5000). "
        "If omitted, confirmed detections are logged locally only.",
    )
    parser.add_argument(
        "--auth-token",
        type=str,
        default=None,
        metavar="TOKEN",
        help="Firebase ID token for API authentication. "
        "Can also be set via the VIGILANE_AUTH_TOKEN env variable.",
    )
    parser.add_argument(
        "--device-id",
        type=str,
        default=None,
        metavar="ID",
        help="Identifier for this camera/device (informational, for logging).",
    )
    parser.add_argument(
        "--auto-confirm",
        action="store_true",
        help="When used together with --no-voice, automatically confirm every "
        "detection and post it to the backend without asking the driver. "
        "Has no effect when voice confirmation is active. "
        "Intended for fully automated/headless deployments only.",
    )

    return parser.parse_args()


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
def main():
    args = parse_args()

    # --- Voice confirmation setup ---
    voice_handler = None
    if not args.no_voice:
        try:
            from voice_confirmation import VoiceConfirmationHandler

            voice_handler = VoiceConfirmationHandler(fallback=args.fallback)
            print("[INFO] Voice confirmation enabled.")
        except ImportError as exc:
            print(
                f"[WARN] Voice confirmation unavailable (missing dependency): {exc}. "
                "Install with: pip install pyttsx3 SpeechRecognition pyaudio"
            )
        except Exception as exc:
            print(f"[WARN] Voice confirmation unavailable: {exc}")

    # --- API client setup ---
    api_client = None
    if args.api_url:
        try:
            from api_client import HazardApiClient

            api_client = HazardApiClient(
                base_url=args.api_url,
                auth_token=args.auth_token,
            )
            print(f"[INFO] API client connected to {args.api_url}")
        except ImportError as exc:
            print(
                f"[WARN] API client unavailable (missing dependency): {exc}. "
                "Install with: pip install requests"
            )
        except Exception as exc:
            print(f"[WARN] API client setup failed: {exc}")

    # --- Model loading ---
    model = load_model()

    # --- Volume / mute detection setup ---
    volume_ctrl = _get_volume_controller()
    if volume_ctrl is None:
        print("[WARN] System volume detection unavailable. Install pycaw for mute-aware thresholding.")

    source = args.webcam if args.webcam is not None else args.video
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print(f"[ERROR] Could not open video source: {source}", file=sys.stderr)
        sys.exit(1)

    show_window = not args.no_display
    # Apply mute-aware threshold from the very first frame
    _muted_at_start = _is_muted(volume_ctrl)
    conf_threshold = SILENT_CONFIDENCE_THRESHOLD if _muted_at_start else args.threshold
    if _muted_at_start:
        print("[INFO] System audio is muted — confidence threshold set to 0.99 (silent mode).")
    frame_skip = args.skip
    window_size = args.window
    debug = args.debug
    if debug:
        os.environ["YOLO_RAW_DEBUG"] = "1"

    # Rolling window: 1 = pothole detected this frame, 0 = not detected
    detection_window = deque(maxlen=window_size)
    frame_count = 0
    processed_count = 0
    last_alert_frame = -ALERT_COOLDOWN

    print(
        f"[INFO] Starting (skip={frame_skip}, window={window_size}, threshold={conf_threshold})."
    )
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

            # --- Mute-aware threshold: re-check every ~30 processed frames ---
            if processed_count % 30 == 0:
                muted = _is_muted(volume_ctrl)
                new_threshold = SILENT_CONFIDENCE_THRESHOLD if muted else args.threshold
                if new_threshold != conf_threshold:
                    conf_threshold = new_threshold
                    if muted:
                        print("[INFO] System audio muted — threshold raised to 0.99 (silent mode).")
                    else:
                        print(f"[INFO] System audio unmuted — threshold restored to {args.threshold:.2f} (default).")

            # YOLO inference (native BGR frame — no conversion needed)
            max_conf, detections = run_inference(model, frame, conf_threshold)

            detected = 1 if detections else 0
            detection_window.append(detected)

            # --- Compute confidence once window is full ---
            current_confidence = 0.0
            if len(detection_window) == window_size:
                current_confidence = sum(detection_window) / window_size

                if (
                    current_confidence >= SMOOTHED_THRESHOLD
                    and (processed_count - last_alert_frame) >= ALERT_COOLDOWN
                ):
                    # Log the raw detection
                    trigger_alert(current_confidence, detections, frame_count)
                    last_alert_frame = processed_count

                    # -------------------------------------------------------
                    # Voice confirmation flow
                    # -------------------------------------------------------
                    if voice_handler is not None:
                        confirmed = voice_handler.confirm_detection(
                            event_type="pothole",
                            confidence=current_confidence,
                        )
                    else:
                        # Voice is disabled. Only confirm (and therefore write to
                        # the database) when --auto-confirm is explicitly set.
                        # Without that flag detections are logged locally only —
                        # the database is never touched without driver confirmation.
                        confirmed = args.auto_confirm

                    if confirmed:
                        print("[INFO] Detection CONFIRMED.")
                        if api_client is not None:
                            api_client.post_hazard(
                                event_type="pothole",
                                confidence=current_confidence,
                            )
                        else:
                            print(
                                "[INFO] (No API configured — detection logged locally only.)"
                            )
                    else:
                        print("[INFO] Detection DISCARDED by user.")

                    # Clear the sliding window after any handled alert so the
                    # next event requires a fresh build-up of evidence.
                    detection_window.clear()

            # --- Annotate and show frame ---
            if show_window:
                if detections:
                    frame = annotate_frame(frame, detections, max_conf)
                elif current_confidence > 0:
                    cv2.putText(
                        frame,
                        f"Smoothed: {current_confidence:.2f}",
                        (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        1.0,
                        (0, 200, 0),
                        2,
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
        # Close the backend session cleanly
        print("[INFO] Done.")


if __name__ == "__main__":
    main()
