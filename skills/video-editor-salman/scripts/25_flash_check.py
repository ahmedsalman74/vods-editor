#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""25_flash_check.py <work> <المسلَّم.mp4> — بعد الرندر. يخرج 3 لو فيه ومضة.
ومضة = إطار أو إطاران يختلفون عن اللي قبلهم وبعدهم، والصورة ترجع مثل ما كانت (قبل ≈ بعد).
السبب اللي لقيناه: صورة بـbackgroundImage (CSS) — ريموشن ما ينتظر تحميلها فتطلع بيضاء إطارين
(صارت فعلاً: ثلاث ومضات بنسخة مسلَّمة). الحل: <Img> أو Preload مخفي.
الومضة المقصودة (فلاش كاميرا) تنكتب بـ<work>/flash_ok.json."""
import sys, subprocess, numpy as np, os, json
V = sys.argv[2]
# ومضات مقصودة (فلاشات كاميرات…) بـ<work>/flash_ok.json = [أوقات]
OK = json.load(open(os.path.join(sys.argv[1], 'flash_ok.json'))) if os.path.exists(os.path.join(sys.argv[1], 'flash_ok.json')) else []
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', V, '-vf', 'scale=90:160,format=gray', '-f', 'rawvideo', '-'], capture_output=True).stdout
f = np.frombuffer(raw, np.uint8).reshape(-1, 160, 90).astype(np.float32)[:, :106]   # فوق الكابشن
bad = []
for n in (1, 2):
    for i in range(2, len(f) - n - 1):
        a = abs(f[i] - f[i - 1]).mean(); b = abs(f[i + n] - f[i + n - 1]).mean(); c = abs(f[i + n] - f[i - 1]).mean()
        still = not (abs(f[i - 1] - f[i - 2]).mean() > 5 and abs(f[i + n + 1] - f[i + n]).mean() > 5)   # حركة متصلة قبل وبعد = تمرير أشرطة متكرّرة، مو ومضة
        if still and a > 8 and b > 8 and c < 0.4 * min(a, b) and all(abs(i / 30 - o) > 0.15 for o in OK): bad.append((round(i / 30, 2), n))
for t, n in bad: print(f'❌ ومضة {n} إطار عند {t} ث')
print('✅ ولا ومضة' if not bad else f'❌ {len(bad)} ومضة'); sys.exit(3 if bad else 0)
