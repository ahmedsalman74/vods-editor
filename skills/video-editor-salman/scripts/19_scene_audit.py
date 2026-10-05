# -*- coding: utf-8 -*-
"""فاحص المشاهد — ثلاثة أخطاء ما تمسكها العين باللقطات، وكلها كلّفت جولة:
   python3 19_scene_audit.py <work>          → يخرج بالرمز 3 لو فيه خرق

① نافذة فاضية  — نافذة مفتوحة > 0.35 ث بلا رسمة داخلها («شوف الفراغات مازالت»)
② جمود         — رسمة ثابتة > 2.5 ث وهو يكمّل كلاماً ثانياً («يطول الكلام على كلام مو له»)
③ رسمة FULL تحت y=420 — تدخل على شعره («داخل على شعري مازال»)

⛔ الحركة المستمرة ليست جموداً: p(t,a,b) = حركة من a إلى b. أول نسخة من هذا الفاحص
   عدّت المدى فجوة وطلّعت ٥٤ ثانية جمود كاذبة. المدى يُغطّى، والفجوة بين المديات هي الجمود."""
import re, io, json, sys, os
W = os.path.abspath(sys.argv[1]) + '/'
s   = io.open(W+'Scenes.tsx', encoding='utf-8').read()
ST  = json.load(open(W+'stage.json'))
FMT = json.load(open(W+'formats.json')) if os.path.exists(W+'formats.json') else {}
VEND= json.load(open(W+'caps.json'))['total']
EMPTY, FROZEN, FULL_FLOOR = 0.35, 2.5, 420
# ⛔ الحدّ يتبع وجه المتحدث بكل مقطع: أعلى وجهه (12_face_guard) ناقص ١٥٨ — يختلف حسب قرب الكاميرا (مثال: 579→420 · 528→370)
_sj = json.load(open(W+'safe.json')) if os.path.exists(W+'safe.json') else {}
FULL_FLOOR = int(_sj.get('fullFloor', FULL_FLOOR))

names = re.findall(r'const (\w+) = \(\{t', s); bodies = {}
for i,n in enumerate(names):
    a = s.index(f'const {n} = ({{t')
    b = s.index(f'const {names[i+1]} = ({{t') if i+1 < len(names) else len(s)
    bodies[n] = s[a:b]
R, AT = {}, {}
for m in re.finditer(r'const (\w+) = \(\{t[^\n]*\n(?:.*\n){0,6}?\s*const A=([\d.]+), B=([\d.]+);', s):
    R[m.group(1)] = (float(m.group(2)), float(m.group(3)))
for m in re.finditer(r'<(\w+) t=\{t\} A=\{([\d.]+)\} B=\{([\d.]+)\}(?: at=\{([\d.]+)\})?', s):
    R[m.group(1)] = (float(m.group(2)), float(m.group(3)))
    if m.group(4): AT[m.group(1)] = float(m.group(4))
bad = 0

def merge(iv):
    iv = sorted(iv); out = []
    for x,y in iv:
        if out and x <= out[-1][1]+0.01: out[-1][1] = max(out[-1][1], y)
        else: out.append([x,y])
    return out

print("① النوافذ الفاضية")
for w in ST:
    if w['m'] == 'FULL': continue
    e = min(w['e'], VEND); cur = w['s']
    for a,b in merge([(max(a,w['s']),min(b,e)) for a,b in R.values() if b>w['s'] and a<e]):
        if a-cur > EMPTY: print(f"   ⚠️ {w['m']:<5}{cur:7.2f}→{a:7.2f} = {a-cur:.2f} ث"); bad += 1
        cur = max(cur, b)
    if e-cur > EMPTY: print(f"   ⚠️ {w['m']:<5}{cur:7.2f}→{e:7.2f} = {e-cur:.2f} ث"); bad += 1

print("② الجمود داخل الرسومات")
for n,(A,B) in sorted(R.items(), key=lambda kv: kv[1][0]):
    body = bodies.get(n, ''); iv = []
    for m in re.finditer(r'p\(t,\s*([\d.]+)\s*,\s*([\d.]+)\)', body): iv.append((float(m.group(1)), float(m.group(2))))
    if n in AT:
        for m in re.finditer(r'p\(t,\s*at\s*,\s*at\+([\d.]+)\)', body): iv.append((AT[n], AT[n]+float(m.group(1))))
    for m in re.finditer(r'[\[{]\s*s?:?\s*(\d+\.\d+)\s*,', body):
        x = float(m.group(1))
        if A <= x <= B: iv.append((x, x+0.55))
    cur = A
    for a,b in merge([(max(x,A),min(y,B)) for x,y in iv if y>A and x<B]):
        if a-cur > FROZEN: print(f"   ⚠️ {n:<14}{cur:7.2f}→{a:7.2f} = {a-cur:.1f} ث ثابتة"); bad += 1
        cur = max(cur, b)
    if B-cur > FROZEN and not n.startswith('Book'):
        print(f"   ⚠️ {n:<14}{cur:7.2f}→{B:7.2f} = {B-cur:.1f} ث ثابتة"); bad += 1

print("③ رسومات فوق وجهه كاملاً تنزل تحت", FULL_FLOOR)
for n,f in FMT.items():
    if f != 'FULL' or n not in bodies: continue
    for m in re.finditer(r'top:(\d+),height:(\d+)', bodies[n]):
        top, h = int(m.group(1)), int(m.group(2))
        if top+h > FULL_FLOOR+5 and top >= 150:
            print(f"   ⚠️ {n}: الحاوية {top}…{top+h} تتجاوز {FULL_FLOOR}"); bad += 1; break

print(f"\n{'✅ سليم' if not bad else f'❌ {bad} خرق — عالجها قبل الرندر'}")
sys.exit(3 if bad else 0)
