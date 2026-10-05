#!/usr/bin/env python3
"""
21_color_check.py <work> <delivered.mp4>  — صورته تخرج كما دخلت (القاعدة ٩٠)

يقارن الملف المسلَّم بالمصدر المقصوص (cutz.mp4) بلحظات وجهه فيها ملء الشاشة بلا رسم
(نوافذ FULL من stage.json)، ويقيس ثلاثة أشياء لا تُترك للظن:
  ① الأوسمة: المسلَّم لازم يكون موسوماً bt709 / tv مثل المصدر. بلا وسم، المشغّل يفكّه بمصفوفة غلط.
  ② القنوات المخزّنة Y/U/V (بلا فك لـRGB، فما يتدخّل المفكّك): |ΔY| ≤ 0.6 · |ΔU|,|ΔV| ≤ 0.4
  ③ الميل اللوني بعد الفك كما يفكّه المشغّل (وسم الملف نفسه): |ΔR−ΔB| ≤ 0.8
يخرج بالرمز 3 لو أي شرط انكسر. الأرقام مقيسة على مقطع حقيقي:
  ريموشن الافتراضي: بلا وسم · مصفوفة 601 · ΔY −1.7 · ميل R/B 1.8 (يلاحظها صاحب المقطع بعينه)
  الصح (وسيط 444 + --color-space bt709): موسوم · ΔY +0.0 · ميل 0.0
"""
import sys, os, json, subprocess, numpy as np

if len(sys.argv) < 3:
    print(__doc__); sys.exit(2)
W, OUT = sys.argv[1], sys.argv[2]
SRC = os.path.join(W, "cutz.mp4")
if not os.path.exists(SRC):
    print(f"⛔ ما فيه {SRC} — الفاحص يقارن بالمصدر المقصوص"); sys.exit(2)
if not os.path.exists(OUT):
    print(f"⛔ ما فيه {OUT}"); sys.exit(2)

W_, H_ = 1080, 1920
REG = (slice(450, 1150), slice(140, 940))          # منطقة الوجه: بلا شارة ولا كابشن
# لتقسيمات خاصة (شاشة مقسومة فوق/تحت): safe.json ← "colorRegion": [y0, y1, x0, x1] — منطقة وجهه بلا كابشن ولا رسم
_sj = os.path.join(W, "safe.json")
if os.path.exists(_sj) and "colorRegion" in json.load(open(_sj)):
    _r = json.load(open(_sj))["colorRegion"]; REG = (slice(_r[0], _r[1]), slice(_r[2], _r[3]))

def probe(f):
    o = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=color_range,color_space,color_primaries,color_transfer,width,height",
                        "-of", "json", f], capture_output=True, text=True).stdout
    return json.loads(o)["streams"][0]

def planes(f, t):
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", f, "-frames:v", "1",
           "-f", "rawvideo", "-pix_fmt", "yuv444p", "-"]
    b = np.frombuffer(subprocess.run(cmd, capture_output=True).stdout, np.uint8).astype(float)
    n = W_ * H_
    if b.size < 3 * n: return None
    Y, U, V = (b[i*n:(i+1)*n].reshape(H_, W_)[REG] for i in range(3))
    return Y.mean(), U.mean(), V.mean()

def rgb_as_player(f, t):
    """يفكّ كما يفكّه المشغّل: بوسم الملف إن وُجد، وإلا bt709 (افتراض كل مشغّل لفيديو HD)."""
    p = probe(f); m = p.get("color_space", "unknown"); r = p.get("color_range", "unknown")
    m = {"bt709": "bt709", "smpte170m": "bt601", "bt470bg": "bt601"}.get(m, "bt709")
    r = "tv" if r in ("tv", "unknown") else "pc"
    cmd = ["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", f, "-frames:v", "1",
           "-sws_flags", "accurate_rnd+full_chroma_int+full_chroma_inp",
           "-vf", f"scale=in_color_matrix={m}:in_range={r},format=rgb24", "-f", "rawvideo", "-"]
    b = np.frombuffer(subprocess.run(cmd, capture_output=True).stdout, np.uint8).astype(float)
    if b.size < 3 * W_ * H_: return None
    return b.reshape(H_, W_, 3)[REG].mean((0, 1))

# لحظات القياس: منتصف نوافذ FULL الأطول من ثانيتين، وإلا خمس لحظات موزّعة
ts = []
dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                            "-of", "csv=p=0", SRC], capture_output=True, text=True).stdout)
sp = os.path.join(W, "stage.json")
if os.path.exists(sp):
    st = json.load(open(sp)); st = st if isinstance(st, list) else st.get("stage", [])
    # ⛔ آخر نافذة بالجدول تنتهي عند 999 (حارس): بدون القصّ على المدة تطلع اللحظة بعد نهاية الملف فما يُقرأ شي
    # ⛔ الزوم يخدع القياس: هوك الزوم (أول ٤٫٦ ث) وانجراف النوافذ الأطول من ٨ ث (stage.ts vzoom) يزيحان الصورة
    #    فتطلع «ميل لوني» كاذب (قِيس: 2.5 بالهوك مقابل 0.0 بنافذة قصيرة). نقيس بالنوافذ القصيرة بعد الهوك أولاً.
    full = [x for x in st if x.get("m") == "FULL" and min(x["e"], dur) - x["s"] >= 2.0]
    quiet = [x for x in full if min(x["e"], dur) - x["s"] < 8.0 and x["s"] >= 4.6]
    ts = [ (x["s"] + min(x["e"], dur)) / 2 for x in (quiet or full) ]
if not ts:
    ts = [dur * k / 6 for k in range(1, 6)]
ts = ts[:8]
# --at 44,135  ← لحظات صريحة (بتوقيت المصدر) · --offset 43  ← لو المسلَّم مقطع اختباري يبدأ من ثانية معيّنة
OFF = 0.0
if "--offset" in sys.argv: OFF = float(sys.argv[sys.argv.index("--offset") + 1])
if "--at" in sys.argv: ts = [float(x) for x in sys.argv[sys.argv.index("--at") + 1].split(",")]

fails = []
ps, po = probe(SRC), probe(OUT)
print(f"المصدر : {ps.get('color_space')} / {ps.get('color_range')}")
print(f"المسلَّم: {po.get('color_space')} / {po.get('color_range')}")
if po.get("color_space") != "bt709" or po.get("color_range") != "tv":
    fails.append("① المسلَّم بلا وسم bt709/tv — المشغّل يفكّه بمصفوفة غلط (ميل لوني). ارندر بـ --color-space bt709")

dY = dU = dV = []; tilt = []
rows = []
for t in ts:
    a, b = planes(SRC, t), planes(OUT, t - OFF)
    if a is None or b is None: continue
    ra, rb = rgb_as_player(SRC, t), rgb_as_player(OUT, t - OFF)
    d = rb - ra
    rows.append((t, b[0]-a[0], b[1]-a[1], b[2]-a[2], d[0]-d[2]))
if not rows:
    print("⛔ ما قدرت أقرأ فريمات"); sys.exit(2)
print(f"\n{'ث':>6} {'ΔY':>6} {'ΔU':>6} {'ΔV':>6} {'ميل R−B':>8}")
for t, y, u, v, k in rows: print(f"{t:6.1f} {y:+6.2f} {u:+6.2f} {v:+6.2f} {k:+8.2f}")
m = np.mean([r[1:] for r in rows], 0)
print(f"\nالمتوسط: ΔY {m[0]:+.2f} · ΔU {m[1]:+.2f} · ΔV {m[2]:+.2f} · ميل {m[3]:+.2f}")
if abs(m[0]) > 0.6: fails.append(f"② السطوع المخزّن انزاح {m[0]:+.2f} (الحد 0.6) — غذِّ ريموشن بوسيط 4:4:4 (04b يسويه)")
if abs(m[1]) > 0.4 or abs(m[2]) > 0.4: fails.append(f"② الكروما المخزّنة انزاحت U {m[1]:+.2f} V {m[2]:+.2f} (الحد 0.4)")
if abs(m[3]) > 0.8: fails.append(f"③ ميل لوني {m[3]:+.2f} بين الأحمر والأزرق (الحد 0.8) — هذا اللي يشوفه بعينه")

if fails:
    print("\n❌ صورته تغيّرت — لا تسلّم:"); [print("  ", f) for f in fails]; sys.exit(3)
print("\n✅ صورته خرجت كما دخلت")
