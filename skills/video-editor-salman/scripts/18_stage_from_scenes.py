# -*- coding: utf-8 -*-
"""يبني stage.json من مدى الرسومات نفسها — لا يُكتب جدول النوافذ بالعين أبداً.
   python3 18_stage_from_scenes.py <work>

⛔ ليش: الجدول المكتوب باليد طلّع ثمانية مشاهد تفتح نافذتها قبل رسمتها بثانية إلى ٢٫٦،
   و٦٫٧ ثانية نوافذ فاضية — والمشاهد لاحظ الفراغات فوراً.

المدخل: <work>/Scenes.tsx (كل مشهد: const A=…, B=…;) و<work>/formats.json:
   {"Thread":"CARD", "Jar":"SIDE", "Venn":"NONE", "Confront":"FULL", …}
   FULL = الرسمة فوق وجهه بلا نافذة (قصيرة، داخل y 200…420)
   NONE! = قطع فوري (القاعدة ٢٣): الصورة تطلع مع كلمتها بلا انتقال وتروح بلا انتقال — للومضات وصور الضيوف
المخرج: stage.json + whoosh_up/whoosh_down بـsfx.json مشتقّة من الجدول."""
import re, io, json, sys, os
W = os.path.abspath(sys.argv[1]) + '/'
PRE, POST = 0.20, 0.20      # النافذة تفتح قبل رسمتها بخُمس ثانية (وقت الانتقال) وتقفل بعدها مباشرة
MERGE      = 1.2            # ⛔ لا ٢٫٠: مدّ النافذة عبر فجوة وجه قصيرة يصنع فراغاً — والفراغ أسوأ من رجوع الوجه
SNAP       = 0.25           # حدود المشاهد تلتصق ببدايات الكلمات
VEND       = json.load(open(W+'caps.json'))['total']

s   = io.open(W+'Scenes.tsx', encoding='utf-8').read()
FMT = json.load(open(W+'formats.json'))
R = {}
for m in re.finditer(r'const (\w+) = \(\{t[^\n]*\n(?:.*\n){0,6}?\s*const A=([\d.]+), B=([\d.]+);', s):
    R[m.group(1)] = (float(m.group(2)), float(m.group(3)))
for m in re.finditer(r'<(\w+) t=\{t\} A=\{([\d.]+)\} B=\{([\d.]+)\}', s):
    R[m.group(1)] = (float(m.group(2)), float(m.group(3)))
missing = [n for n in R if n not in FMT]
if missing: sys.exit(f"❌ formats.json ناقص صيغة: {missing}")

HARD = {n for n,f in FMT.items() if f.endswith('!')}
FMT  = {n: f.rstrip('!') for n,f in FMT.items()}
# الومضة تفتح وتقفل مع رسمتها بالضبط — بلا PRE/POST لأن ما فيه انتقال يحتاج وقتاً
segs = [[max(0, a-(0 if n in HARD else PRE)), b+(0 if n in HARD else POST), FMT[n], n]
        for n,(a,b) in sorted(R.items(), key=lambda kv: kv[1][0]) if FMT[n] != 'FULL']
merged = []
for g in segs:
    if merged:
        if g[0] < merged[-1][1]: g[0] = merged[-1][1]
        # ⛔ الومضة (NONE!) ما تُدمج مع جارتها: دُمجت مرة مع «الطابور» فطلعت ثانية فاضية قبل الفندق («صاحي أنت؟»)
        if g[0]-merged[-1][1] < MERGE and g[2] == merged[-1][2] and g[3] not in HARD and merged[-1][3] not in HARD:
            merged[-1][1] = max(merged[-1][1], g[1]); continue
    if g[1] > g[0]+0.2: merged.append(g)
ST, cur = [], 0.0
for a,b,f,n in merged:
    if a > cur+0.01: ST.append({"s":cur, "e":a, "m":"FULL"})
    ST.append({"s":a, "e":b, "m":f, **({"h":1} if n in HARD else {})}); cur = b
ST.append({"s":cur, "e":999, "m":"FULL"})

caps = json.load(open(W+'caps.json'))
WD = sorted(w['s'] for c in caps['cards'] for w in c['w'])
for i,x in enumerate(ST):
    if i:
        # ⛔ الالتصاق للأمام فقط لو الحدّ يفتح نافذة: التبكير يزيد الفراغ قبل الرسمة
        opening = x['m'] != 'FULL'
        if x.get('h') or ST[i-1].get('h'): continue     # حدود الومضة من كلمتها أصلاً — لا تلصق
        cand = [z for z in WD if abs(z-x['s']) <= SNAP and (not opening or z >= x['s'])]
        if cand: x['s'] = min(cand, key=lambda z: abs(z-x['s']))
for a,b in zip(ST, ST[1:]): a['e'] = b['s']
# ⛔ رجوع وجه أقل من ٠٫٦ ث بين نافذتين = رفّة، لا لقطة. يُدمج بالنافذة اللي قبله.
#    (عند الكتاب طلع وجه ٠٫٣٤ ث بين نافذتين، فحطّ ووشين فوق صوت الغالق.)
#    والفجوة تُقسم **نصفين** بين النافذتين: مدّها كلها للسابقة يصنع نافذة فاضية (قِسناه: 0.56 ث).
_k = []
for i,x in enumerate(ST):
    if _k and x['m']=='FULL' and x['e']<900 and x['e']-x['s'] < 0.6 and i+1 < len(ST):
        mid = (x['s']+x['e'])/2; _k[-1]['e'] = mid; ST[i+1]['s'] = mid; continue
    _k.append(x)
ST = [x for x in _k if x['e']-x['s'] > 0.2 or x['e'] > 900]
# ⛔ الربط **بعد** الحذف: شيل مقطع قصير بين اثنين يكسر الاتصال (القاعدة ٢٥ — فجوة = آخر مشهد يُرسم)
for x in ST: x['s'] = round(x['s'], 2)
for a,b in zip(ST, ST[1:]): a['e'] = b['s']
ST[-1]['e'] = 999
ST = [dict(s=x['s'], e=x['e'], m=x['m'], **({'h':1} if x.get('h') else {})) for x in ST]
for a,b in zip(ST, ST[1:]): assert abs(a['e']-b['s']) < 1e-6, (a,b)
json.dump(ST, open(W+'stage.json','w'), ensure_ascii=False, indent=1)

sp = W+'sfx.json'; d = json.load(open(sp)) if os.path.exists(sp) else {}
# الومضة بلا ووش — القطع الفوري صوته الدلالي (غالق · ضربة) لا انتقال
d['whoosh_up']   = [b['s'] for a,b in zip(ST,ST[1:]) if b['m']!='FULL' and a['m']=='FULL' and not b.get('h')]
d['whoosh_down'] = [b['s'] for a,b in zip(ST,ST[1:]) if b['m']=='FULL' and a['m']!='FULL' and b['s']<VEND-1 and not a.get('h')]
# ⛔ لحظة لها صوت دلالي (غالق · رنّة · ضربة) ما تحتاج ووشاً فوقه — يغطّيه أو يتصادم معه
_sem = [t for k in ('shutter','ding','thud','glass','type','reveal') for t in d.get(k,[])]
for k in ('whoosh_up','whoosh_down'):
    d[k] = [t for t in d[k] if all(abs(t-x) > 0.45 for x in _sem)]
json.dump(d, open(sp,'w'), ensure_ascii=False, indent=1)

tot = lambda m: sum(min(x['e'],VEND)-x['s'] for x in ST if x['m']==m)
print("✅ stage.json —", len(ST), "مشهد")
for m in ('FULL','CARD','SIDE','NONE'): print(f"   {m:<5} {tot(m):6.1f} ث ({tot(m)/VEND*100:4.1f}٪)")
print(f"   انتقالات {len(d['whoosh_up'])+len(d['whoosh_down'])} → شغّل 05_sfx.py ثم 05b_sfx_audit.py")
