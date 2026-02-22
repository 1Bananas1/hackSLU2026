# paste into a temp script, run once
from PIL import Image
import cv2, torch
from transformers import AutoModelForCausalLM, AutoProcessor

processor = AutoProcessor.from_pretrained(
    "microsoft/Florence-2-base", trust_remote_code=True
)
model = AutoModelForCausalLM.from_pretrained(
    "microsoft/Florence-2-base", torch_dtype=torch.float32, trust_remote_code=True
)

cap = cv2.VideoCapture(0)
ret, frame = cap.read()
cap.release()

img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))

for task in ["<DETAILED_CAPTION>", "<DENSE_REGION_CAPTION>"]:
    inputs = processor(text=task, images=img, return_tensors="pt")
    ids = model.generate(**inputs, max_new_tokens=512, num_beams=3, do_sample=False)
    text = processor.batch_decode(ids, skip_special_tokens=False)[0]
    result = processor.post_process_generation(
        text, task=task, image_size=(img.width, img.height)
    )
    print(f"\n{task}:", result)
