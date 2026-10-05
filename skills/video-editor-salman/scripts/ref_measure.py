# -*- coding: utf-8 -*-
"""قياس الكاميرا والصوت لأي مرجع — بالأرقام لا بالانطباع.

⛔ المرجع = كاميرا وصوت وإيقاع، مو أشكال بس. قِس المحاور الأربعة (أشكال · كاميرا · صوت · إيقاع).

  ffmpeg -i ref.mp4 -map 0:a -ac 1 -ar 22050 -f f32le a.raw -y
  ffmpeg -i ref.mp4 -vf "fps=12,scale=160:90,format=gray" -f rawvideo v.raw -y
  python3 measure_ref.py a.raw v.raw
"""
import sys, numpy as np
SR, FPS, W, H, HOP = 22050, 12, 160, 90, 1024
a = np.fromfile(sys.argv[1] if len(sys.argv) > 1 else 'a.raw', dtype=np.float32)
v = np.fromfile(sys.argv[2] if len(sys.argv) > 2 else 'v.raw', dtype=np.uint8).reshape(-1, H, W).astype(np.float32)
DUR = len(v) / FPS
print(f"المدة {DUR:.1f} ث · {len(v)} إطار\n")

# ═══ الكاميرا
def shift(p, c, r=8):
    best = (0, 0, 1e18)
    for dx in range(-r, r+1):
        for dy in range(-3, 4):
            b = np.roll(np.roll(c, -dy, 0), -dx, 1)[6:-6, 10:-10]
            d = np.abs(p[6:-6, 10:-10] - b).mean()
            if d < best[2]: best = (dx, dy, d)
    return best
DX = np.zeros(len(v)); DY = np.zeros(len(v))
diff = np.zeros(len(v))
for i in range(1, len(v)):
    DX[i], DY[i], _ = shift(v[i-1], v[i])
    diff[i] = np.abs(v[i] - v[i-1]).mean()
cuts = [i/FPS for i in range(1, len(v)) if diff[i] > 26]
sp = np.abs(DX) + np.abs(DY)
print(f"═══ الكاميرا")
print(f"   القطعات {len(cuts)} → متوسط اللقطة {DUR/(len(cuts)+1):.1f} ث")
print(f"   ساكنة تماماً {(sp < 0.2).mean()*100:.0f}٪ · متحرّكة {(sp > 0.5).mean()*100:.0f}٪")
if (sp > 0.5).any():
    print(f"   سرعة الحركة {sp[sp>0.5].mean()/W*100:.1f}٪ من عرض الشاشة بالإطار")
print("   الاتجاه كل ١٠ ث:", ' '.join(
    ('◀' if DX[s*FPS:(s+10)*FPS].sum() < -8 else '▶' if DX[s*FPS:(s+10)*FPS].sum() > 8 else '·')
    for s in range(0, int(DUR), 10)))

# ═══ الصوت
N = 2048
S = np.abs(np.fft.rfft(np.stack([a[i:i+N]*np.hanning(N) for i in range(0, len(a)-N, HOP)]), axis=1))
f = np.fft.rfftfreq(N, 1/SR)
b = lambda lo, hi: S[:, (f >= lo) & (f < hi)].mean(1)
lo, mid, hi = b(20, 250).mean(), b(250, 2000).mean(), b(2000, 10000).mean()
tot = S.mean(1)
db = 20*np.log10(np.sqrt(np.array([(a[i:i+HOP]**2).mean() for i in range(0, len(a)-HOP, HOP)]) + 1e-12))
flux = np.maximum(0, np.diff(db, prepend=db[0]))
th = flux.mean() + 2.2*flux.std()
on = []
for i, x in enumerate(flux):
    t = i*HOP/SR
    if x > th and (not on or t - on[-1] > 0.35): on.append(t)
ac = np.correlate(tot-tot.mean(), tot-tot.mean(), 'full')[len(tot)-1:]; ac /= ac[0]
lag = np.arange(len(ac))*HOP/SR; w = (lag > 0.3) & (lag < 2.5)
near = [min(abs(np.array(on) - c)) for c in cuts] if cuts and on else []
T = lo + mid + hi
print(f"\n═══ الصوت")
print(f"   الضربات {len(on)/(len(a)/SR)*60:.1f} بالدقيقة  (سقفنا ٢٠ لأن صوته يشغل المسار)")
print(f"   الطيف: باص {lo/T*100:.0f}٪ · وسط {mid/T*100:.0f}٪ · حاد {hi/T*100:.0f}٪")
print(f"   أقوى دورية {60/lag[w][np.argmax(ac[w])]:.0f} BPM بقوة {ac[w].max():.2f}"
      f" → {'موسيقى موزونة' if ac[w].max() > 0.35 else 'تصميم صوتي بلا إيقاع'}")
if near:
    print(f"   الضربات على القطع: {sum(1 for n in near if n < 0.25)}/{len(cuts)}"
          f" → {'مربوطة بالقطع' if sum(1 for n in near if n<0.25) > len(cuts)*0.5 else 'مربوطة بالحدث لا بالقطع'}")
