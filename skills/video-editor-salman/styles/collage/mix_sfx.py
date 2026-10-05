# -*- coding: utf-8 -*-
"""مازج الأصوات (أساليب الكولاج · الوثائقي · اللوح) — python3 mix_sfx.py <work>
المدخل: <work>/sfx_events.json   [[الوقت, "الصوت", الأولوية 1-3, "السبب", (اختياري) أقصى طول, (اختياري) كسب dB], …]
        العنصر السادس يخفض/يرفع هذا الصوت وحده — للفرشات الطويلة (فرشة آلة العرض، طنين الدماغ) تحت الكلام
        <work>/sfx_opts.json (اختياري) {"gain_db": -3, "repeat_ok": ["shutter"]}
        repeat_ok: أصوات معفاة من حدّ الثلاث مرات — لمّا يطلب توحيد صوت واحد لكل الصور (مثال: غالق كاميرا موحّد لكل الصور)
⛔ الصوت اللي يعيش بعد ما يروح الشي يُسمع «زايد»: العنصر الخامس يقصّ الذيل
   عند نهاية المشهد بتلاشٍ ٠٫١٥ ث — والتصادم يُحسب بالطول المقصوص.
المخرج: sfx.wav · sfx.json (بصيغة 05b_sfx_audit) · sfx.lead.json · sfx_kept.json

⛔ التناغم: لا صوت ورا صوت بثانية، ولا صوتين متداخلين، ولا صوت يتكرر لين يصير «بايخ».
   فالقواعد هنا شروط لا توصيات:
  ① لا تداخل: بداية أي صوت بعد **نهاية ذيل** اللي قبله + 0.25 ث
  ② ولا صوتين بدايتهما أقرب من 1.0 ث
  ③ ولا صوت يتكرر أكثر من 3 مرات بالمقطع — والنسخ (sw1..4 · key1..3 · stamp_heavy/light) تتناوب
  ④ عند التعارض يبقى الأعلى أولوية (٣ دلالي قوي · ٢ دلالي · ١ انتقال)، ثم الأقدم
  ⑤ الكسب بالقياس: ذروة الصوت +6 dB فوق RMS كلامه (الحادّة +5) — لا بالأذن
  ⛔ اقرأ قائمة المشطوبة بعد التشغيل: المازج يشيل حسب الأولوية لا حسب المعنى.
     شال مرة خط القلم تحت «تخفي الغلط» (قلب الجملة) وأبقى شطباً أقل أهمية — عدّل الأولوية بيدك."""
import json, wave, numpy as np, sys, os
W=os.path.abspath(sys.argv[1])+'/'; SR=48000
sys.path.insert(0,os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','scripts'))
import _paths; _paths.ensure()
# مكتبة أصوات المستخدم (sounds/ بمجلد بياناته) + أصوات المقطع نفسه (<work>/sounds/) — الثانية تغلب لو تشابه الاسم
BANKDIR=_paths.data('sounds')
def rdw(p):
    w=wave.open(p); b=w.readframes(w.getnframes()); ch=w.getnchannels(); sw=w.getsampwidth()
    if sw==2: x=np.frombuffer(b,'<i2').astype(np.float32)/32768
    else:
        a=np.frombuffer(b,np.uint8).reshape(-1,3).astype(np.int32); v=a[:,0]|(a[:,1]<<8)|(a[:,2]<<16)
        x=np.where(v>=1<<23,v-(1<<24),v).astype(np.float32)/8388608.0
    return x.reshape(-1,ch)
voice=rdw(W+'voice.wav'); vdb=20*np.log10(np.sqrt((voice.mean(1)**2).mean())+1e-9)
BANK={f[:-4]:rdw(os.path.join(BANKDIR,f)) for f in os.listdir(BANKDIR) if f.endswith('.wav')}
if os.path.isdir(W+'sounds'): BANK.update({f[:-4]:rdw(W+'sounds/'+f) for f in os.listdir(W+'sounds') if f.endswith('.wav')})
if not BANK: sys.exit('⛔ مكتبة الأصوات فاضية — جهّزها بـstyles/collage/sound_add.py (من مكتبته أو من Mixkit/Pixabay)')
BRIGHT={'tear','pencil','key1','key2','key3','pages','stamp_light','glass_break','scribble','crumple','page_turn','marker_a','marker_b','sand','pour'}
EV=json.load(open(W+'sfx_events.json'))
# ⑥ اللصق بالكلمة (حاكم 05b ①): كل حدث يلتصق بأقرب بداية كلمة داخل ±0.45 ث
_caps=json.load(open(W+'caps.json')); _WD=sorted(w['s'] for c in _caps['cards'] for w in c['w'])
def _snap(t):
    b=min(_WD,key=lambda z:abs(z-t)); return round(b,3) if abs(b-t)<=0.45 else t
EV=[([_snap(e[0])] if not str(e[1]).endswith('_bed') else [e[0]])+list(e[1:]) for e in EV]   # الفرشة ما تُلصق بكلمة
bad=[e for e in EV if e[1] not in BANK]
if bad: sys.exit(f"❌ أصوات مو بالبنك: {sorted(set(e[1] for e in bad))} · المتاح: {sorted(BANK)}")
dur={k:len(v)/SR for k,v in BANK.items()}
OPTS=json.load(open(W+'sfx_opts.json')) if os.path.exists(W+'sfx_opts.json') else {}
GAIN=float(OPTS.get('gain_db',0.0)); REPOK=set(OPTS.get('repeat_ok',[]))
MAXL={(round(e[0],3),e[1]):float(e[4]) for e in EV if len(e)>4 and e[4]}
EGAIN={(round(e[0],3),e[1]):float(e[5]) for e in EV if len(e)>5 and e[5]}
def elen(t,n): return min(dur[n],MAXL.get((round(t,3),n),dur[n]))
def _onset(x):
    # ⛔ الورق والقلم يبدون ناعمين: المسموع يتأخر ٢١٢–٢٤٤ م.ث عن بداية الملف (قاسه 05b).
    #    نقيس **بنفس مقياس الحاكم بالحرف** (أول عيّنة > ٢٥٪ من ذروة أول ٠٫٩ ث، بلا تنعيم)،
    #    ونضع الصوت مبكّراً بمقدارها — فالمسموع يقع على الكلمة.
    #    ⛔ ولا نعلنها «تقديماً» بـsfx.lead.json: الحاكم يضيف التقديم المعلن لأنه للأصوات الصاعدة
    #    (ذروة متأخرة)، فإعلانها ضاعفها — القلم قفز من +٢١٢ إلى +٦٢٤ م.ث.
    e=np.abs(x[:int(0.9*SR)]).max(1)
    return int(np.argmax(e>e.max()*0.25))/SR
LEAD={k:round(_onset(v),3) for k,v in BANK.items()}
kept=[]; uses={}; dropped=[]; beds=[]
# ⛔ الفرشات (اسمها ينتهي بـ_bed): طبقة خلفية طويلة تحت المشهد — معفاة من التصادم والعدّ،
#    ولا تُسجَّل بـsfx.json عشان لا يقيسها الحاكم كأنها ضربة على كلمة (تُسجَّل بـ_beds).
for t,n,pr,why,*_x in sorted(EV,key=lambda e:(-e[2],e[0])):
    if n.endswith('_bed'): beds.append((t,n,pr,why)); continue
    if n not in REPOK and uses.get(n,0)>=3: dropped.append((t,n,why,'تجاوز ٣ مرات')); continue
    clash=None
    for t2,n2,_,_ in kept:
        f,s=((t,n),(t2,n2)) if t<=t2 else ((t2,n2),(t,n))
        if s[0]-f[0]<1.0 or s[0]<f[0]+elen(*f)+0.25: clash=(t2,n2); break
    if clash: dropped.append((t,n,why,f'يتصادم مع {clash[1]} @ {clash[0]:.2f}')); continue
    kept.append((t,n,pr,why)); uses[n]=uses.get(n,0)+1
kept.sort(); beds.sort()
out=np.zeros((len(voice)+SR*3,2),np.float32); hits=None
# ⛔ الفرشات تُمزج بعد الضربات، ونحفظ نسخة الضربات وحدها (sfx_hits.wav) عشان 05b يقيس بداية كل ضربة
#    بلا ما تلخبطه الفرشة تحتها (فرشة بمستوى ‎-12 dB تحت الكلام طلّعت كل الضربات «مقدَّمة ‎-150 م.ث» كذباً).
for i,(t,n,_,_) in enumerate(kept+beds):
    if i==len(kept): hits=out.copy()
    x=BANK[n]; g=10**(((vdb+(5.0 if n in BRIGHT else 6.0)+GAIN+EGAIN.get((round(t,3),n),0.0))-20*np.log10(np.abs(x).max()+1e-9))/20)
    L=int(elen(t,n)*SR)
    if L<len(x):
        x=x[:L].copy(); f=min(L,int(0.15*SR)); x[-f:]*=np.linspace(1,0,f)[:,None]
    s=max(0,int((t-LEAD[n])*SR)); out[s:s+len(x)]+=x*g
if hits is None: hits=out.copy()
out=out[:len(voice)]; hits=hits[:len(voice)]
with wave.open(W+'sfx_hits.wav','wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(hits,-1,1)*32767).astype('<i2').tobytes())
with wave.open(W+'sfx.wav','wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(out,-1,1)*32767).astype('<i2').tobytes())
sj=json.load(open(W+'sfx.json')) if os.path.exists(W+'sfx.json') else {}
sj={k:v for k,v in sj.items() if not isinstance(v,list)}; sj.setdefault('outro',0)
for t,n,_,_ in kept: sj.setdefault(n,[]).append(round(t,3))
if beds: sj['_beds']={n:[round(t,3) for t,n2,_,_ in beds if n2==n] for _,n,_,_ in beds}
json.dump(sj,open(W+'sfx.json','w'),ensure_ascii=False,indent=1)
json.dump({'leads':{k:0.0 for k in uses},'lib':sorted(uses)},open(W+'sfx.lead.json','w'),ensure_ascii=False)   # بنك منحوت بأذنه — معفى من ميزانية الطيف
json.dump([[round(t,2),n,why] for t,n,_,why in kept],open(W+'sfx_kept.json','w'),ensure_ascii=False,indent=1)
for t,n,why,r in sorted(dropped): print(f"  ✗ {t:7.2f} {n:<12} {r} — {why}")
gaps=[kept[i+1][0]-kept[i][0] for i in range(len(kept)-1)] or [0]
print(f"\n✅ {len(kept)} صوت · {len(kept)/(len(voice)/SR)*60:.1f}/دقيقة · أقرب صوتين {min(gaps):.2f} ث · ذروة {20*np.log10(np.abs(out).max()+1e-9):.1f} dBFS")
print('   الاستعمال:',' · '.join(f'{k}×{v}' for k,v in sorted(uses.items())))
