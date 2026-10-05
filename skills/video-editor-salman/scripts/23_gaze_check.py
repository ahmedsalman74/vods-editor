# -*- coding: utf-8 -*-
"""فاحص النظرة — كل لحظة يرجع فيها وجهه للشاشة.

من stage.json نطلع كل حدّ ينتقل من رسم (NONE) لوجهه، ونسحب إطار القطع
وإطارين بعده، ونركّبهم بورقة تباين واحدة عشان تُراجَع بالعين.

⛔ القاعدة: ما نقطع على لحظة نظره نازل. لو كان نازلاً، أخّر الحدّ لأول إطار
   يرفع فيه نظره — حتى لو صار داخل الكلمة، المهم يبدأ نطق الجملة قبل القطع.

الاستعمال: python3 23_gaze_check.py <مجلد> [اسم_الورقة]
"""
import json, os, subprocess, sys

d = sys.argv[1] if len(sys.argv) > 1 else '.'
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(d, 'gaze_sheet.jpg')
src = os.path.join(d, 'cutz.mp4')
FPS = 30

wins = json.load(open(os.path.join(d, 'stage.json')))
# «يرجع وجهه» = نافذة FULL تبدأ بعد نافذة رسم تغطّي الشاشة
cuts = [round(float(w['s']), 2) for i, w in enumerate(wins)
        if w['m'] == 'FULL' and i > 0 and wins[i - 1]['m'] == 'NONE']
if not cuts:
    print('ما فيه حدود رسم→وجه'); sys.exit(0)

rows = []
for c in cuts:
    n = int(round(c * FPS))
    rows.append((c, n))

sel = '+'.join(f'eq(n\\,{n+k})' for _, n in rows for k in (0, 2, 5))
cols = 3
vf = (f"select='{sel}',crop=820:300:130:600,scale=300:-1,"
      f"tile={cols}x{len(rows)}")
subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-i', src,
                '-vf', vf, '-fps_mode', 'passthrough', '-y', out], check=True)

print(f'✅ {len(rows)} لحظة رجوع وجه → {out}')
print('   كل صف = حدّ واحد · الأعمدة: إطار القطع · +2 · +5')
for i, (c, n) in enumerate(rows, 1):
    print(f'   صف {i}: {c:7.2f} ث (إطار {n})')
print('\n⚠️  راجع الورقة بعينك: أي صف نظره فيه نازل بالعمود الأول = أخّر الحدّ.')
