#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""22_preflight.py <work> [--name "<اسم المقطع>"] [--out <المسلَّم.mp4>]

فاحص واحد يشغّل الفواحص كلها بالترتيب ويطبع جدولاً واحداً — بدل سبعة أوامر تُنسى وحدة منها.
  قبل الرندر (ريموشن):  18_stage · 19_scene_audit · 05b_sfx_audit · 13_repeat_check · 16_coverage_check · 23_gaze_check · 24_cut_align
  بعد الرندر (--out):    21_color_check · 25_flash_check · 20_voice_check · معدل البت ≥ ثلث المصدر (القاعدة ٨٧)
يخرج بالرمز 3 لو أي فاحص فشل. «رندر نجح» ما يعني «سليم» — هذا الجدول هو اللي يعني.
"""
import sys, os, subprocess, json

if len(sys.argv) < 2: print(__doc__); sys.exit(2)
W = os.path.abspath(sys.argv[1]); K = os.path.dirname(os.path.abspath(__file__))
NAME = sys.argv[sys.argv.index("--name") + 1] if "--name" in sys.argv else os.path.basename(W)
OUT  = sys.argv[sys.argv.index("--out") + 1]  if "--out"  in sys.argv else None
REM = os.path.exists(os.path.join(W, "Scenes.tsx"))
# وضع المقطع (<work>/mode.json ← {"mode": "quick" | "light" | "full"}): «قص وكابشن» و«خفيف» بلا مشاهد،
# فما نشغّل فواحص المشاهد (نوافذ · جمود · تكرار · تغطية · نظرة) — نفحص الصوت والصورة والجودة بس.
_mp = os.path.join(W, "mode.json")
MODE = json.load(open(_mp)).get("mode", "full") if os.path.exists(_mp) else "full"
SCENES = MODE == "full"
HAS_SFX = os.path.exists(os.path.join(W, "sfx.json")) or os.path.exists(os.path.join(W, "sfx_events.json"))

def run(label, cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=W)
    out = (r.stdout + r.stderr).strip().splitlines()
    last = next((l for l in reversed(out) if l.strip()), "")
    return (label, r.returncode == 0, last[:110], "\n".join(out))

rows = []
if not SCENES:
    print(f"الوضع: {MODE} — بلا مشاهد، فواحص المشاهد متخطّاة")
elif REM:
    rows.append(run("18 جدول النوافذ",   [sys.executable, f"{K}/18_stage_from_scenes.py", W]))
    # ⛔ أساليب العُدّة (كولاج · وثائقي · لوح): 18 يكتب whoosh_up/down بـsfx.json ومازجها ما يعرفها — بدون إعادة المزج يقيس 05b أصواتاً مو بالملف
    _st = os.path.join(W, "style.json")
    if os.path.exists(_st) and json.load(open(_st)).get("style") in ("collage", "documentary", "board", "vox") and os.path.exists(os.path.join(W, "sfx_events.json")):
        _vm = os.path.join(os.path.dirname(K), "styles", "collage", "mix_sfx.py")
        subprocess.run([sys.executable, _vm, W], capture_output=True, cwd=W)
        _sj = os.path.join(W, "sfx.json"); _d = json.load(open(_sj)); _d.setdefault("outro", 0); json.dump(_d, open(_sj, "w"), ensure_ascii=False)
    rows.append(run("19 فراغ · جمود · شعر", [sys.executable, f"{K}/19_scene_audit.py", W]))
else:
    rows.append(run("08 المنطقة الآمنة",  ["node", f"{K}/08_safe_check.js", W]))
    rows.append(run("08b التداخل",        ["node", f"{K}/08b_overlap_check.js", W]))
    rows.append(run("08c تراكب النصوص",   ["node", f"{K}/08c_text_collide.js", W]))
if HAS_SFX:
    rows.append(run("05b حاكم المؤثرات",  [sys.executable, f"{K}/05b_sfx_audit.py", W]))
if SCENES:
    rows.append(run("13 تكرار الآليات",   ["node", f"{K}/13_repeat_check.js", W, NAME]))
    rows.append(run("16 التغطية",         ["node", f"{K}/16_coverage_check.js", W]))
    rows.append(run("23 النظرة عند القطع", [sys.executable, f"{K}/23_gaze_check.py", W]))
if SCENES and REM and os.path.exists(os.path.join(W, "cutz.mp4")):
    rows.append(run("24 القطع والكاميرا", [sys.executable, f"{K}/24_cut_align.py", W]))
if SCENES and os.path.exists(os.path.join(W, "cutz.mp4")) and os.path.exists(f"{K}/12_face_guard.js") and not REM:
    rows.append(run("12 حارس الوجه",  ["node", f"{K}/12_face_guard.js", W, "check"]))

if OUT:
    rows.append(run("21 اللون كما دخل",  [sys.executable, f"{K}/21_color_check.py", W, OUT]))
    rows.append(run("25 ومضات بيضاء",  [sys.executable, f"{K}/25_flash_check.py", W, OUT]))
    if os.path.exists(os.path.join(W, "voice.wav")):
        rows.append(run("20 الصوت كما دخل", [sys.executable, f"{K}/20_voice_check.py", W, OUT]))
    def br(f):
        o = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=bit_rate", "-of", "csv=p=0", f], capture_output=True, text=True).stdout.strip()
        return int(o) if o.isdigit() else 0
    src = os.path.join(W, "src.mov"); a, b = br(src) if os.path.exists(src) else 0, br(OUT)
    ok = (a == 0) or (b >= a / 3)
    rows.append(("87 معدل البت", ok, f"المسلَّم {b/1e6:.1f} ميقابت · المصدر {a/1e6:.1f}" + ("" if ok else " — تحت الثلث"), ""))

if not rows:
    print("✅ ما فيه فواحص لهالمرحلة بهالوضع — جاهز للرندر"); sys.exit(0)
w = max(len(r[0]) for r in rows)
print(f"\n{'الفاحص':<{w}}  الحالة  الخلاصة"); print("─" * (w + 60))
for label, ok, last, _ in rows: print(f"{label:<{w}}  {'✅' if ok else '❌'}      {last}")
fails = [r for r in rows if not r[1]]
if fails:
    print(f"\n❌ {len(fails)} فاحص فشل — التفاصيل:")
    for label, _, _, full in fails: print(f"\n── {label} ──\n{full[-1500:]}")
    sys.exit(3)
print("\n✅ كل الفواحص بصفر" + (" — جاهز للتسليم" if OUT else " — جاهز للرندر"))
