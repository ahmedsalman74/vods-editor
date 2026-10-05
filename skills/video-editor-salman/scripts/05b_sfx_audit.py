# -*- coding: utf-8 -*-
"""حاكم المؤثرات — يقيس الملف المركّب نفسه، لا النيّة.  python3 05b_sfx_audit.py <work>

خمس قواعد، وأي كسر يوقف التسليم:
 ① كل مؤثر مربوط بكلمة منطوقة  — انحراف ≤ ١٢٠ م.ث عن أقرب كلمة
 ② بداية المؤثر داخل الملف     — انحراف ≤ ٦٠ م.ث عن وقته المكتوب
 ③ ما فيه مؤثران خلال ١٫٠ ث    — «مو يجي صوت وبعده بثانية صوت ثاني ويصير إزعاج» (كانت ٠٫٣٥)
 ④ ميزانية طيفية               — مؤثران فوق ٤ كيلوهرتز في الدقيقة كحد أقصى
 ⑤ الكثافة ≤ ٢٠ في الدقيقة
"""
import json, os, sys, subprocess
import numpy as np

W = os.path.abspath(sys.argv[1]) + "/"
SR = 48000
sx = json.load(open(W + "sfx.json"))
caps = json.load(open(W + "caps.json"))
WORDS = [(w["s"], w["t"]) for c in caps["cards"] for w in c["w"]]
DUR = caps["total"]

_L = json.load(open(W + "sfx.lead.json")) if os.path.exists(W + "sfx.lead.json") else {}
LEADS = _L.get("leads", _L)
# ⛔ الميزانية الطيفية تحكم مكتبتي المركَّبة، لا أصوات صانع المحتوى نفسه:
#    اختار صوته بأذنه وهو جزء من هويته — قاعدتي ما تلغي اختياره.
LIBSND = set(_L.get("lib", []))
# الضربات وحدها لو موجودة (المازج يكتبها) — الفرشات ما تنقاس كأنها بداية ضربة
_SRC = W + ("sfx_hits.wav" if os.path.exists(W + "sfx_hits.wav") else "sfx.wav")
p = subprocess.run(["ffmpeg", "-v", "quiet", "-i", _SRC,
                    "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True)
x = np.frombuffer(p.stdout, dtype=np.float32).astype(float)

ev = sorted((t, k) for k, v in sx.items() if isinstance(v, list) for t in v)
fails, warns = [], []

# ① و② و④
hi, own = [], []
prev = -9.0
for idx, (t, k) in enumerate(ev):
    near = min(WORDS, key=lambda w: abs(w[0] - t))
    off_w = (t - near[0]) * 1000
    if abs(off_w) > 120:
        fails.append(f"① {k} عند {t:.2f} — أقرب كلمة «{near[1]}» عند {near[0]:.2f} (انحراف {off_w:+.0f} م.ث)")
    # ⛔ نافذة القياس ما تدخل ذيل المؤثر اللي قبله، وإلا قِسنا ذيله وحسبناه تقديماً كاذباً
    w0 = max(t - 0.15, prev + 0.28)
    seg = x[int(w0 * SR):int((t + 0.75) * SR)]
    prev = t
    if seg.size and np.abs(seg).max() > 1e-5:
        e = np.abs(seg); pk = e.max()
        # ⛔ التقديم المقصود يُطرح: الأصوات الصاعدة تُقدَّم عمداً عشان تُسمع ذروتها مع الحركة
        onset = int(np.argmax(e > pk * 0.25)) / SR - (t - w0) + LEADS.get(k, 0.0)
        if abs(onset) * 1000 > 60:
            fails.append(f"② {k} عند {t:.2f} — بدايته الفعلية بالملف تبعد {onset*1000:+.0f} م.ث")
        body = seg[int(0.15 * SR):]
        X = np.abs(np.fft.rfft(body * np.hanning(len(body))))
        f = np.fft.rfftfreq(len(body), 1 / SR)
        cen = float((f * X).sum() / X.sum())
        if cen > 4000 and k not in LIBSND:
            hi.append((t, k, round(cen)))
        elif cen > 4000:
            own.append((t, k, round(cen)))

# ③
for a, b in zip(ev, ev[1:]):
    if b[0] - a[0] < 1.0:
        fails.append(f"③ {a[1]} ← {b[1]} عند {a[0]:.2f} — بينهما {b[0]-a[0]:.2f} ث فقط")

# ④
mins = max(1.0, DUR / 60.0)
if len(hi) / mins > 2.0:
    fails.append(f"④ {len(hi)} مؤثراً فوق ٤ كيلوهرتز = {len(hi)/mins:.1f}/دقيقة (الحد ٢٫٠)")
# ⑤
dens = len(ev) / mins
if dens > 20: fails.append(f"⑤ الكثافة {dens:.1f}/دقيقة (الحد ٢٠)")

print(f"مؤثرات: {len(ev)} · الكثافة {dens:.1f}/دقيقة")
if own: print("من مكتبته (معفاة من الميزانية الطيفية): " + " · ".join(f"{k}@{t:.1f}={c}هرتز" for t,k,c in own))
print(f"فوق ٤ كيلوهرتز: {len(hi)} ({len(hi)/mins:.1f}/دقيقة)" + (" — " + " · ".join(f"{k}@{t:.1f}={c}هرتز" for t,k,c in hi) if hi else ""))
if fails:
    print("\n❌ الحاكم يوقف التسليم:")
    for f_ in fails: print("   " + f_)
    sys.exit(1)
print("\n✅ المؤثرات منضبطة — القواعد الخمس كلها سليمة.")
