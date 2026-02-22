"""
Fine-tune YOLOv8 on a Roboflow pothole dataset.
HackSLU 2026 - Dashcam Infrastructure Auto Reporter

Steps:
  1. Get your Roboflow API key from https://app.roboflow.com/ → Settings → API Keys
  2. Find your workspace/project slugs in your Roboflow project URL:
       https://app.roboflow.com/<WORKSPACE>/<PROJECT>/<VERSION>
  3. Fill in the three variables below, then run:
       python src/ML/training/train.py

Output: runs/detect/pothole_finetune/weights/best.pt
  → Swap this into main.py to use your fine-tuned model.
"""

# ---------------------------------------------------------------------------
# Credentials — loaded from .env at project root
# ---------------------------------------------------------------------------
import os
from dotenv import load_dotenv

load_dotenv()  # loads .env from cwd or any parent directory

ROBOFLOW_API_KEY = os.environ["ROBOFLOW_API_KEY"]  # set in .env
ROBOFLOW_WORKSPACE = "major-project-ye1u4"
ROBOFLOW_PROJECT = "pavement-distress-analysis-siokj"
ROBOFLOW_VERSION = 1  # bump this if Roboflow shows a higher version on the dataset page

# ---------------------------------------------------------------------------
# Training settings — tuned for RTX 4070 Ti (12 GB VRAM)
# ---------------------------------------------------------------------------
BASE_MODEL = (
    "yolov8m.pt"  # medium — much better accuracy than nano, fits easily in 12 GB
)
EPOCHS = 20
IMAGE_SIZE = 640
BATCH_SIZE = 32  # 4070 Ti handles 32 comfortably; try 64 if VRAM allows
DEVICE = 0  # GPU index — 0 = first GPU (your 4070 Ti)
RUN_NAME = "pothole_finetune"

# ---------------------------------------------------------------------------
# Download dataset + train
# ---------------------------------------------------------------------------
from roboflow import Roboflow
from ultralytics import YOLO

if __name__ == "__main__":
    print("[INFO] Downloading dataset from Roboflow...")
    rf = Roboflow(api_key=ROBOFLOW_API_KEY)
    project = rf.workspace(ROBOFLOW_WORKSPACE).project(ROBOFLOW_PROJECT)
    dataset = project.version(ROBOFLOW_VERSION).download("yolov8")

    print(f"[INFO] Dataset ready at: {dataset.location}")
    print(f"[INFO] Starting training: {EPOCHS} epochs, base={BASE_MODEL}")

    checkpoint = f"runs/detect/{RUN_NAME}/weights/last.pt"
    if os.path.exists(checkpoint):
        print(f"[INFO] Resuming from checkpoint: {checkpoint}")
        model = YOLO(checkpoint)
        model.train(resume=True)
    else:
        model = YOLO(BASE_MODEL)
        model.train(
            data=f"{dataset.location}/data.yaml",
            epochs=EPOCHS,
            imgsz=IMAGE_SIZE,
            batch=BATCH_SIZE,
            device=DEVICE,
            name=RUN_NAME,
            exist_ok=True,
        )

    print("\n[INFO] Training complete.")
    print(f"[INFO] Best weights: runs/detect/{RUN_NAME}/weights/best.pt")
    print("[INFO] To use in main.py, replace load_model() with:")
    print(f'         model = YOLO("runs/detect/{RUN_NAME}/weights/best.pt")')
