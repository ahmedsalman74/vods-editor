# -*- coding: utf-8 -*-
"""يبني ملف الهوية (profile.json) من أقل معلومات — لونين وخط وحساب — ويشتق الباقي.

  python3 make_theme.py --bg "#17181A" --acc "#C8845F" --font "Tajawal" --handle "@name"
                        [--ink "#F2EFEA"] [--font-display "..."] [--font-local] [--caption 55]
                        [--numerals western|arabic] [--logo logo.png] [--out <مسار>]

  • --bg   لون الخلفية (غامق أو فاتح — الاثنين يشتغلان)
  • --acc  لون التمييز (الكلمة المنطوقة، الأرقام، الأزرار)
  • --ink  لون النص — بدونه يُحسب تلقائياً من إضاءة الخلفية
  • --font-local  لو الخط مثبّت على جهازه (مو من Google Fonts)
الافتراضي يكتب لمجلد بياناته: profile.json — ومنه ينسخ كل مقطع theme.json حقه.
"""
import sys, os, json, colorsys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _paths

def arg(k, d=None):
    return sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d

def hx(c):
    c = c.strip().lstrip('#')
    if len(c) == 3: c = ''.join(x * 2 for x in c)
    return tuple(int(c[i:i + 2], 16) / 255 for i in (0, 2, 4))

def tohex(rgb):
    return '#' + ''.join(f'{max(0, min(255, round(v * 255))):02X}' for v in rgb)

def lum(rgb):
    f = lambda v: v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = map(f, rgb); return 0.2126 * r + 0.7152 * g + 0.0722 * b

def mix(a, b, k):
    return tuple(x + (y - x) * k for x, y in zip(a, b))

def shift(rgb, dl=0.0, ds=0.0, dh=0.0):
    h, l, s = colorsys.rgb_to_hls(*rgb)
    return colorsys.hls_to_rgb((h + dh) % 1, max(0, min(1, l + dl)), max(0, min(1, s + ds)))

if '--bg' not in sys.argv or '--acc' not in sys.argv or '--font' not in sys.argv or '--handle' not in sys.argv:
    print(__doc__); sys.exit(2)

bg, acc = hx(arg('--bg')), hx(arg('--acc'))
dark = lum(bg) < 0.25
ink = hx(arg('--ink')) if arg('--ink') else ((0.95, 0.94, 0.92) if dark else (0.09, 0.09, 0.10))
theme = {
    "_": "ملف الهوية — منه ينسخ كل مقطع theme.json. عدّله هنا لو تغيّرت هويته.",
    "handle": arg('--handle'),
    "bg": tohex(bg), "ink": tohex(ink), "acc": tohex(acc),
    "clay": tohex(shift(acc, dl=-0.12)),                  # التمييز أغمق — للظلال والحدود
    "warm": tohex(shift(acc, dl=+0.08, ds=+0.05)),         # التمييز أفتح — للتوهّج
    "mut":  tohex(mix(ink, bg, 0.45)),                      # نص ثانوي
    "sky":  tohex(shift(mix(bg, (0.43, 0.58, 0.65), 0.55), ds=-0.05)),  # لون بارد للخلفية الحيّة (يقابل التمييز)
    "cream": tohex(mix((1, 0.97, 0.94), acc, 0.04)),     # ورق فاتح دافئ — للبطاقات الفاتحة
    "sand": tohex(mix((0.96, 0.945, 0.918), acc, 0.05)), # رملي — لكرت الخلاصة
    "font": arg('--font'),
    "fontLocal": '--font-local' in sys.argv,
    "captionSize": int(arg('--caption', 55)), "captionWeight": 500, "captionMaxW": 700, "maxLines": 2,
    "hookSize": 90, "helperSize": 48, "handleSize": 32,
    "numerals": arg('--numerals', 'western'),
    "safeTop": 200, "safeBottom": 420, "safeSide": 180,
    "grade": False,
    "_grade_note": "لا نلمس ألوان صورته ولا صوته إلا بطلبه الصريح.",
    "zoomAnchor": 0.3, "faceAnchor": 0.3, "noZoom": False,
}
if arg('--font-display'): theme["fontDisplay"] = arg('--font-display')
if arg('--logo'): theme["logo"] = arg('--logo')

_paths.ensure()
out = arg('--out', _paths.data('profile.json'))
json.dump(theme, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f"✅ {out}")
print(f"   خلفية {theme['bg']} · نص {theme['ink']} · تمييز {theme['acc']} · بارد {theme['sky']} · {'غامق' if dark else 'فاتح'}")
