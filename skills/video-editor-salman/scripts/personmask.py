# -*- coding: utf-8 -*-
"""قصّ الشخص من كل فريم + بيانات الوجه — نسخة ويندوز (وأي جهاز ما فيه مكتبة أبل Vision).

    python3 personmask.py <inDir> <outDir> [fast|balanced|accurate] [feather]

نفس مدخلات ومخرجات personmask.swift بالضبط، عشان الأدوات اللي تستدعيه ما تفرق:
  <outDir>/<اسم>.png  قناع رمادي للشخص (أبيض = الشخص)
  <outDir>/meta.json  [{"f": اسم الفريم, "face": {"x","y","w","h"}}]  إحداثيات بالبكسل، الأصل أعلى يسار
يحتاج: pip install mediapipe opencv-python numpy
"""
import sys, os, json
import numpy as np

try:
    import cv2
    import mediapipe as mp
except ImportError:
    print("⚠️ ناقص mediapipe أو opencv — شغّل: pip install mediapipe opencv-python")
    sys.exit(3)

a = sys.argv
if len(a) < 3:
    print("usage: personmask.py <inDir> <outDir> [quality] [feather]"); sys.exit(2)
in_dir, out_dir = a[1], a[2]
quality = a[3] if len(a) > 3 else "accurate"
feather = float(a[4]) if len(a) > 4 else 2.5
os.makedirs(out_dir, exist_ok=True)

seg = mp.solutions.selfie_segmentation.SelfieSegmentation(model_selection=0 if quality == "fast" else 1)
fd = mp.solutions.face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5)

meta = []
for f in sorted(x for x in os.listdir(in_dir) if x.lower().endswith(".jpg")):
    img = cv2.imread(os.path.join(in_dir, f))
    if img is None:
        continue
    H, W = img.shape[:2]
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    m = seg.process(rgb).segmentation_mask
    if m is None:
        continue
    m = (np.clip(m, 0, 1) * 255).astype(np.uint8)
    if feather > 0:
        k = max(1, int(feather * 2) | 1)
        m = cv2.GaussianBlur(m, (k, k), feather)
    cv2.imwrite(os.path.join(out_dir, f[:-4] + ".png"), m)

    row = {"f": f}
    r = fd.process(rgb)
    if r.detections:
        best = max(r.detections, key=lambda d: d.location_data.relative_bounding_box.width)
        b = best.location_data.relative_bounding_box
        row["face"] = {"x": b.xmin * W, "y": b.ymin * H, "w": b.width * W, "h": b.height * H}
    meta.append(row)

json.dump(meta, open(os.path.join(out_dir, "meta.json"), "w"), ensure_ascii=False)
print(f"✅ {len(meta)} فريم")
