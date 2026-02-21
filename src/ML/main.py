"""
Live Pothole Detection using Microsoft Florence-2
HackSLU 2026 - Dashcam Infrastructure Auto Reporter

Detects potholes from a webcam or video file using Florence-2's
CAPTION_TO_PHRASE_GROUNDING task and a temporal sliding window for confidence.

Usage:
    python main.py --webcam 0
    python main.py --video dashcam.mp4
    python main.py --webcam 0 --threshold 0.5 --window 15 --skip 3 --no-display
"""

import argparse
import datetime
import sys
from collections import deque

import cv2
import torch
from PIL import Image
from transformers import AutoModelForCausalLM, AutoProcessor

# ---------------------------------------------------------------------------
# Tuneable constants — override via CLI flags
# ---------------------------------------------------------------------------
MODEL_ID = "microsoft/Florence-2-base"
TASK_PROMPT = "<CAPTION_TO_PHRASE_GROUNDING>"
# Richer scene description helps Florence-2 ground the phrase correctly
TEXT_PROMPT = "A road surface with a pothole crack or depression."

FRAME_SKIP = 5        # run inference every Nth captured frame
WINDOW_SIZE = 10      # sliding window depth (processed frames)
THRESHOLD = 0.40      # fraction of window frames that must detect pothole to alert
ALERT_COOLDOWN = 30   # minimum processed frames between consecutive printed alerts

# Keywords to match against Florence-2 output labels
POTHOLE_KEYWORDS = {"pothole", "hole", "crack", "depression", "damage", "road damage"}


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------
def load_model():
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if torch.cuda.is_available() else torch.float32

    print(f"[INFO] Loading Florence-2 on {device} ({dtype})...")
    print("[INFO] First run will download ~460MB of model weights.")

    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        torch_dtype=dtype,
        trust_remote_code=True,  # Required: Florence-2 ships custom modeling code
    ).to(device)
    model.eval()

    processor = AutoProcessor.from_pretrained(
        MODEL_ID,
        trust_remote_code=True,
    )

    print("[INFO] Model ready.")
    return model, processor, device, dtype


# ---------------------------------------------------------------------------
# Single-frame inference
# ---------------------------------------------------------------------------
def run_inference(model, processor, device, dtype, pil_image):
    """
    Run Florence-2 grounding on a PIL image.
    Returns (labels: list[str], bboxes: list[[x1, y1, x2, y2]]).
    """
    full_prompt = TASK_PROMPT + TEXT_PROMPT

    inputs = processor(
        text=full_prompt,
        images=pil_image,
        return_tensors="pt",
    ).to(device, dtype)

    with torch.no_grad():
        generated_ids = model.generate(
            input_ids=inputs["input_ids"],
            pixel_values=inputs["pixel_values"],
            max_new_tokens=1024,
            num_beams=3,
            do_sample=False,
        )

    # skip_special_tokens=False is required: post_process_generation needs
    # Florence-2's special <loc_N> tokens to reconstruct bounding boxes
    generated_text = processor.batch_decode(
        generated_ids, skip_special_tokens=False
    )[0]

    parsed = processor.post_process_generation(
        generated_text,
        task=TASK_PROMPT,
        image_size=(pil_image.width, pil_image.height),
    )

    result = parsed.get(TASK_PROMPT, {})
    labels = result.get("labels", [])
    bboxes = result.get("bboxes", [])
    return labels, bboxes


# ---------------------------------------------------------------------------
# Detection logic
# ---------------------------------------------------------------------------
def contains_pothole(labels):
    """Return True if any label matches a pothole-related keyword."""
    for lbl in labels:
        if any(kw in lbl.lower() for kw in POTHOLE_KEYWORDS):
            return True
    return False


def trigger_alert(confidence, bboxes, frame_number):
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    n_boxes = len(bboxes)
    print(
        f"[{timestamp}] POTHOLE DETECTED | "
        f"Confidence: {confidence:.2f} | "
        f"Boxes: {n_boxes} | "
        f"Frame: {frame_number}"
    )


# ---------------------------------------------------------------------------
# Optional display annotation
# ---------------------------------------------------------------------------
def annotate_frame(frame, bboxes, labels, confidence):
    """Draw bounding boxes and confidence overlay on frame (in-place)."""
    for i, bbox in enumerate(bboxes):
        x1, y1, x2, y2 = (int(v) for v in bbox)
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
        label_text = labels[i] if i < len(labels) else "pothole"
        cv2.putText(
            frame, label_text, (x1, max(y1 - 8, 0)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2,
        )
    cv2.putText(
        frame, f"Confidence: {confidence:.2f}", (10, 30),
        cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 0), 2,
    )
    return frame


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def parse_args():
    parser = argparse.ArgumentParser(
        description="Live pothole detection using Microsoft Florence-2"
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
        "--threshold", type=float, default=THRESHOLD,
        help=f"Detection confidence threshold 0-1 (default: {THRESHOLD})",
    )
    parser.add_argument(
        "--skip", type=int, default=FRAME_SKIP,
        help=f"Run inference every Nth frame (default: {FRAME_SKIP}). "
             "Increase to 15-30 on CPU for usable speed.",
    )
    parser.add_argument(
        "--window", type=int, default=WINDOW_SIZE,
        help=f"Sliding window size in processed frames (default: {WINDOW_SIZE})",
    )
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
def main():
    args = parse_args()

    model, processor, device, dtype = load_model()

    source = args.webcam if args.webcam is not None else args.video
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print(f"[ERROR] Could not open video source: {source}", file=sys.stderr)
        sys.exit(1)

    show_window = not args.no_display
    threshold = args.threshold
    frame_skip = args.skip
    window_size = args.window

    detection_window = deque(maxlen=window_size)
    frame_count = 0        # total captured frames
    processed_count = 0    # frames actually sent to Florence-2
    last_alert_processed = -ALERT_COOLDOWN

    print(f"[INFO] Starting detection loop (skip={frame_skip}, window={window_size}, threshold={threshold}).")
    if show_window:
        print("[INFO] Press 'q' in the video window to quit.")
    else:
        print("[INFO] Running headless. Press Ctrl+C to quit.")

    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                print("[INFO] End of video stream.")
                break

            frame_count += 1

            # --- Frame skip gate: display non-inference frames as-is ---
            if frame_count % frame_skip != 0:
                if show_window:
                    cv2.imshow("Pothole Detector", frame)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break
                continue

            processed_count += 1

            # --- BGR (OpenCV) -> RGB -> PIL for Florence-2 processor ---
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            pil_image = Image.fromarray(rgb_frame)

            # --- Florence-2 inference ---
            labels, bboxes = run_inference(model, processor, device, dtype, pil_image)

            # --- Update sliding window ---
            detected = 1 if contains_pothole(labels) else 0
            detection_window.append(detected)

            # --- Compute confidence once window is full ---
            current_confidence = 0.0
            if len(detection_window) == window_size:
                current_confidence = sum(detection_window) / window_size

                if (
                    current_confidence >= threshold
                    and (processed_count - last_alert_processed) >= ALERT_COOLDOWN
                ):
                    trigger_alert(current_confidence, bboxes, frame_count)
                    last_alert_processed = processed_count

            # --- Annotate and show frame ---
            if show_window:
                if detected and bboxes:
                    frame = annotate_frame(frame, bboxes, labels, current_confidence)
                elif current_confidence > 0:
                    cv2.putText(
                        frame, f"Confidence: {current_confidence:.2f}", (10, 30),
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
