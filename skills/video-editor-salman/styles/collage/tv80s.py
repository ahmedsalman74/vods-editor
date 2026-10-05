# معالجة «تلفزيون الثمانينات» للصور (الستايل أ المعتمد): تشبّع 0.62 · أسود مرفوع · دفء · انزياح ألوان 3 بكسل · نعومة خفيفة
# python3 tv80s.py in out [--crop x0,y0,x1,y1] [--bw] [--w 1400] [--soft 0.6]
# ⛔ لا يُطبَّق على فيديو المتحدث أبداً — الصور بس. والحبيبات وخطوط الشاشة تتحرّك بريموشن (مو محروقة بالصورة).
import sys, argparse, numpy as np
from PIL import Image, ImageFilter
ap = argparse.ArgumentParser(); ap.add_argument('i'); ap.add_argument('o')
ap.add_argument('--crop'); ap.add_argument('--bw', action='store_true'); ap.add_argument('--w', type=int, default=1400)
ap.add_argument('--sat', type=float, default=0.62); ap.add_argument('--soft', type=float, default=0.6); ap.add_argument('--shift', type=int, default=3)
a = ap.parse_args()
im = Image.open(a.i).convert('RGB')
if a.crop: im = im.crop(tuple(int(v) for v in a.crop.split(',')))
if im.width != a.w: im = im.resize((a.w, round(im.height * a.w / im.width)), Image.LANCZOS)
x = np.asarray(im).astype(np.float32) / 255
L = (x * [0.299, 0.587, 0.114]).sum(2, keepdims=True)
x = L + (x - L) * (0.0 if a.bw else a.sat)
x = 0.075 + x * 0.87                                   # أسود مرفوع وأبيض مطفي
x = x * ([1.0, 0.985, 0.94] if a.bw else [1.04, 1.0, 0.90]) + ([0.01, 0.005, 0.0] if a.bw else [0.018, 0.008, 0.0])
if not a.bw and a.shift:                                # انزياح الأحمر يمين والأزرق يسار (شاشة CRT)
    s = a.shift; x[:, s:, 0] = x[:, :-s, 0].copy(); x[:, :-s, 2] = x[:, s:, 2].copy()
out = Image.fromarray((np.clip(x, 0, 1) * 255).astype(np.uint8))
if a.soft: out = out.filter(ImageFilter.GaussianBlur(a.soft))
out.save(a.o, quality=92)
print(a.o, out.size)
