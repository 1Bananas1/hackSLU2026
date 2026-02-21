"""
Evaluate the pothole detector on all videos in dataset/.
HackSLU 2026 - Dashcam Infrastructure Auto Reporter

Usage:
    # Step 1: Process all videos, save frames for manual review
    python src/ML/eval.py

    # Step 2: Label frames interactively
    python src/ML/eval.py --label
    #   y = yes, real road hazard
    #   n = no, false positive / nothing there
    #   s = skip (label later)
    #   q = quit and save progress

    # Step 3: Compute metrics
    python src/ML/eval.py --score

NOTE: These videos are for evaluation only — do NOT include them in training data.
"""

import argparse
import csv
import os
import sys

import cv2
import numpy as np

# Import shared model/inference logic from main.py
sys.path.insert(0, os.path.dirname(__file__))
from main import load_model, run_inference, annotate_frame

EVAL_DIR = "dataset/eval"
CONF_THRESHOLD = 0.12     # must match main.py CONFIDENCE_THRESHOLD
SAMPLE_EVERY = 45         # save one non-detected frame every N frames (false-negative check)
DETECT_COOLDOWN = 30      # min frames between saving detected frames (avoid duplicates)
VIDEO_EXTS = {".mp4", ".avi", ".mov", ".mkv", ".m4v"}


def find_videos():
    videos = []
    for entry in os.scandir("dataset"):
        if entry.is_file() and os.path.splitext(entry.name)[1].lower() in VIDEO_EXTS:
            videos.append(entry.path)
    return sorted(videos)


def process_videos(model):
    os.makedirs(EVAL_DIR, exist_ok=True)
    rows = []

    video_paths = find_videos()
    if not video_paths:
        print("[ERROR] No video files found in dataset/")
        return rows

    for video_path in video_paths:
        video_stem = os.path.splitext(os.path.basename(video_path))[0]
        out_dir = os.path.join(EVAL_DIR, video_stem)
        os.makedirs(out_dir, exist_ok=True)

        print(f"\n[INFO] Processing: {video_path}")
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            print(f"[WARN] Could not open {video_path}, skipping")
            continue

        frame_count = 0
        detected_count = 0
        last_saved_frame = -DETECT_COOLDOWN

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            frame_count += 1
            max_conf, detections = run_inference(model, frame, CONF_THRESHOLD)

            if detections and (frame_count - last_saved_frame) >= DETECT_COOLDOWN:
                detected_count += 1
                last_saved_frame = frame_count
                raw_path = os.path.join(out_dir, f"detected_f{frame_count:05d}_raw.jpg")
                ann_path = os.path.join(out_dir, f"detected_f{frame_count:05d}_ann.jpg")
                cv2.imwrite(raw_path, frame)
                cv2.imwrite(ann_path, annotate_frame(frame.copy(), detections, max_conf))
                rows.append({
                    "video": video_stem,
                    "frame": frame_count,
                    "type": "detected",
                    "conf": f"{max_conf:.2f}",
                    "raw_path": raw_path,
                    "ann_path": ann_path,
                    "ground_truth": "",
                })

            elif not detections and frame_count % SAMPLE_EVERY == 0:
                # Sample non-detected frames so user can spot false negatives
                raw_path = os.path.join(out_dir, f"sample_f{frame_count:05d}.jpg")
                cv2.imwrite(raw_path, frame)
                rows.append({
                    "video": video_stem,
                    "frame": frame_count,
                    "type": "sample",
                    "conf": "0.00",
                    "raw_path": raw_path,
                    "ann_path": "",
                    "ground_truth": "",
                })

        cap.release()
        print(f"[INFO] {video_stem}: {frame_count} frames, {detected_count} detections saved")

    return rows


def write_labels_csv(rows):
    csv_path = os.path.join(EVAL_DIR, "labels.csv")
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["video", "frame", "type", "conf", "raw_path", "ann_path", "ground_truth"],
        )
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n[INFO] Saved {len(rows)} rows to: {csv_path}")
    print("[INFO] Fill in the ground_truth column, then run:")
    print("         python src/ML/eval.py --score")
    print()
    print("  detected rows: 1 = true positive (real damage), 0 = false positive")
    print("  sample rows:   1 = false negative (missed damage), 0 = correct negative")


def label_interactive():
    csv_path = os.path.join(EVAL_DIR, "labels.csv")
    if not os.path.exists(csv_path):
        print(f"[ERROR] {csv_path} not found — run without flags first to generate it")
        sys.exit(1)

    with open(csv_path, newline="") as f:
        rows = list(csv.DictReader(f))

    unlabeled = [r for r in rows if r["ground_truth"].strip() == ""]
    if not unlabeled:
        print("[INFO] All frames already labeled. Run --score to see results.")
        return

    print(f"[INFO] {len(unlabeled)} frames to label. Keys: y=hazard  n=not hazard  s=skip  q=quit")
    print("[INFO] Detected frames show raw (left) + annotated (right). Sample frames show raw only.")

    labeled_count = 0

    for i, row in enumerate(unlabeled):
        raw_path = row["raw_path"]
        ann_path = row.get("ann_path", "")

        if not os.path.exists(raw_path):
            row["ground_truth"] = ""
            continue

        raw = cv2.imread(raw_path)
        if raw is None:
            continue

        # Side-by-side: annotated on right if available, otherwise mirror raw
        if ann_path and os.path.exists(ann_path):
            ann = cv2.imread(ann_path)
            display = np.concatenate([raw, ann], axis=1)
        else:
            display = raw.copy()

        # Info overlay
        label = f"{i+1}/{len(unlabeled)}  [{row['type']}]  video={row['video']}  f={row['frame']}  conf={row['conf']}"
        cv2.putText(display, label, (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
        cv2.putText(display, "y=hazard  n=not hazard  s=skip  q=quit", (10, 55),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)

        cv2.imshow("Label Frames", display)

        while True:
            key = cv2.waitKey(0) & 0xFF
            if key == ord("y"):
                row["ground_truth"] = "1"
                labeled_count += 1
                break
            elif key == ord("n"):
                row["ground_truth"] = "0"
                labeled_count += 1
                break
            elif key == ord("s"):
                break
            elif key == ord("q"):
                cv2.destroyAllWindows()
                _save_rows(csv_path, rows)
                print(f"[INFO] Saved {labeled_count} labels. Resume with --label.")
                return

    cv2.destroyAllWindows()
    _save_rows(csv_path, rows)
    print(f"[INFO] Done! Labeled {labeled_count} frames. Run --score to see results.")


def _save_rows(csv_path, rows):
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["video", "frame", "type", "conf", "raw_path", "ann_path", "ground_truth"],
        )
        writer.writeheader()
        writer.writerows(rows)


def score():
    csv_path = os.path.join(EVAL_DIR, "labels.csv")
    if not os.path.exists(csv_path):
        print(f"[ERROR] {csv_path} not found — run without --score first")
        sys.exit(1)

    tp = fp = fn = tn = unlabeled = 0

    with open(csv_path, newline="") as f:
        for row in csv.DictReader(f):
            gt = row["ground_truth"].strip()
            if gt == "":
                unlabeled += 1
                continue
            gt = int(gt)
            if row["type"] == "detected":
                tp += gt
                fp += 1 - gt
            else:  # sample
                fn += gt
                tn += 1 - gt

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall    = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1        = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    print("\n=== Evaluation Results ===")
    print(f"  True Positives  (correct detections):  {tp}")
    print(f"  False Positives (wrong detections):     {fp}")
    print(f"  False Negatives (missed damage):        {fn}")
    print(f"  True Negatives  (correct non-alerts):   {tn}")
    if unlabeled:
        print(f"  Unlabeled (skipped):                    {unlabeled}")
    print()
    print(f"  Precision: {precision:.3f}  ({tp}/{tp+fp} detections were correct)")
    print(f"  Recall:    {recall:.3f}  ({tp}/{tp+fn} actual hazards were caught)")
    print(f"  F1 Score:  {f1:.3f}")
    if unlabeled:
        print(f"\n  [WARN] {unlabeled} rows unlabeled — metrics may be incomplete")


def main():
    parser = argparse.ArgumentParser(
        description="Evaluate pothole detector on all videos in dataset/"
    )
    parser.add_argument(
        "--score", action="store_true",
        help="Compute precision/recall from filled-in labels.csv",
    )
    parser.add_argument(
        "--label", action="store_true",
        help="Interactively label saved frames (y=hazard, n=not hazard, s=skip, q=quit)",
    )
    args = parser.parse_args()

    if args.score:
        score()
        return

    if args.label:
        label_interactive()
        return

    model = load_model()
    rows = process_videos(model)
    if rows:
        write_labels_csv(rows)
    else:
        print("[WARN] No frames saved.")


if __name__ == "__main__":
    main()
