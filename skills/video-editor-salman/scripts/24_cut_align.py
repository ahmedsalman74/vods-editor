#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""24_cut_align.py <work> — قبل الرندر (ريموشن). يخرج 3 لو فيه خرق.
① رجوع الوجه قبل قطعة المصدر بشعرة: لما المتحدث يقصّ بين جمله بنفسه قبل ما يرسل الفيديو (قفزات بالمصدر). لو النافذة خلصت وبعدها بأقل من
   0.3 ث فيه قطعة بالمصدر = قطعتين ورا بعض (رمشة). الحل: خلّ B = وقت قطعة المصدر نفسها (يطبعه لك).
   (صارت فعلاً: ست نوافذ بمقطع واحد رجعت قبل قطعته بـ0.09 ث.)
② مفاتيح الكاميرا المتداخلة: [t, مدة, …] — لو المفتاح اللي بعده يبدأ قبل ما يخلص هذا، الانتقال يبدأ من هدف ما وصلناه = قفزة.
③ (تنبيه) انتقال سريع فوق خلفية دورية: لو ذروة السرعة قريبة من دورة الأشرطة (ورق green-bar دورته 168) تثبت الأشرطة وترمش.
   الحل المعتمد: مدة ≥ 0.85 ث + غباش حركة رأسي بقدر السرعة (feGaussianBlur stdDeviation="0 N" على الطبقة المتحركة)."""
import sys, os, re, subprocess, numpy as np
W = os.path.abspath(sys.argv[1]); S = open(os.path.join(W, 'Scenes.tsx'), encoding='utf-8').read(); bad = 0
src = os.path.join(W, 'cutz.mp4')
if not os.path.exists(src):                      # بعد التسليم نمسح cutz — نسخته بمشروع ريموشن
    src = os.path.join(W, 'remotion', 'public', 'video.mp4')
if not os.path.exists(src): sys.exit('❌ ما لقيت cutz.mp4 ولا remotion/public/video.mp4')
fps = float(eval(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', src], capture_output=True, text=True).stdout.strip()))
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-vf', 'scale=180:320,format=gray', '-f', 'rawvideo', '-'], capture_output=True).stdout
f = np.frombuffer(raw, np.uint8).reshape(-1, 320, 180).astype(np.float32)
d = np.abs(np.diff(f, axis=0)).mean((1, 2)); med = float(np.median(d))
J = [(i + 1) / fps for i, v in enumerate(d) if v > max(3.5 * med, 4) and v > 2 * max(d[i - 1] if i else 0, d[i + 1] if i + 1 < len(d) else 0)]
print('قطعات المصدر:', ' '.join(f'{j:.2f}' for j in J))
for n, a, b in re.findall(r'const (\w+) = \(\{t\}:\{t:number\}\) => \{\n  const A=([\d.]+), B=([\d.]+);', S):
    a, b = float(a), float(b)
    near = [j for j in J if 0.02 < j - b <= 0.30]
    if near: bad += 1; print(f'❌ {n}: الوجه يرجع {b:.2f} وقطعة المصدر {near[0]:.2f} — خلّ B={near[0]:.2f}')
cam = re.search(r'const CAM[^=]*=\s*\[(.*?)\n\];', S, re.S)
if cam:
    K = [tuple(float(x) for x in m.groups()) for m in re.finditer(r'\[([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\]', cam.group(1))]
    for (t0, d0, x0, y0, _), (t1, d1, x1, y1, _) in zip(K, K[1:]):
        if t1 < t0 + d0 - 1e-3: bad += 1; print(f'❌ مفتاح {t1:.2f} يبدأ قبل ما يخلص {t0:.2f}+{d0:.2f} = قفزة')
        dist = ((y1 - y0) ** 2 + (x1 - x0) ** 2) ** 0.5; pk = 1.875 * dist / d1 / 30 if d1 > 0 else 0   # ذروة السرعة (منحنى smootherstep) بكسل/إطار
        if pk > 120 and 'vblur' not in S:
            print(f'⚠️ انتقال {t1:.2f}: ذروته {pk:.0f} بكسل/إطار بلا غباش حركة — لو الخلفية مخطّطة/متكرّرة بترمش (قِس دورتها)')
print('✅ القطع والكاميرا سليمة' if not bad else f'❌ {bad} خرق'); sys.exit(3 if bad else 0)
