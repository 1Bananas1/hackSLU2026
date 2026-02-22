"""Export YOLO best.pt weights to TFLite for on-device inference.

Usage (from repo root):
    python src/ML/export_tflite.py

Output:
    src/ML/best_saved_model/best_float32.tflite   (primary ultralytics output)
    Vigilane/assets/models/best.tflite             (copied into app bundle)

Output tensor shape (nms=True):
    [1, num_detections, 6]
    Each row: [x1_norm, y1_norm, x2_norm, y2_norm, confidence, class_id]
    Coordinates are normalised to [0, 1] relative to 640×640 input size.

Class index mapping (6 classes):
    0: pothole
    1: alligator cracking
    2: longitudinal cracking
    3: transverse cracking
    4: rutting
    5: patching
"""

import shutil
from pathlib import Path

MODEL_PATH = Path(__file__).parent / "best.pt"
OUTPUT_DIR = Path(__file__).parent / "best_saved_model"
ASSETS_DIR = Path(__file__).parent.parent.parent / "Vigilane" / "assets" / "models"
DEST_FILE = ASSETS_DIR / "best.tflite"


def export() -> None:
    try:
        from ultralytics import YOLO
    except ImportError:
        raise SystemExit("ultralytics is not installed. Run: pip install ultralytics")

    if not MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Trained weights not found: {MODEL_PATH}\n"
            "Place best.pt from your YOLO training run next to this script."
        )

    print(f"Exporting {MODEL_PATH} → TFLite (imgsz=640, nms=True) …")
    model = YOLO(str(MODEL_PATH))
    model.export(format="tflite", imgsz=640, nms=True)

    tflite_file = OUTPUT_DIR / "best_float32.tflite"
    if not tflite_file.exists():
        raise FileNotFoundError(
            f"Expected TFLite output not found at {tflite_file}.\n"
            "Check the ultralytics export log above for errors."
        )

    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(tflite_file, DEST_FILE)

    print("\nExport complete:")
    print(f"  TFLite model : {tflite_file}")
    print(f"  App bundle   : {DEST_FILE}")
    print("\nModel output tensor: [1, num_detections, 6]")
    print("  Columns: x1_norm, y1_norm, x2_norm, y2_norm, confidence, class_id")
    print("  Classes: 0=pothole, 1=alligator cracking, 2=longitudinal cracking,")
    print("           3=transverse cracking, 4=rutting, 5=patching")


if __name__ == "__main__":
    export()
