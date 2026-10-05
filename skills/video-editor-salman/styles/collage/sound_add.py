# -*- coding: utf-8 -*-
"""أضف صوتاً لمكتبة المستخدم — يُقصّ من بدايته الفعلية، ويُقطع ذيله بتلاشٍ، وتُنعَّم حدّته،
ويُعيَّر لذروة موحّدة. (صوت المتحدث نفسه لا يُمسّ — هذي المؤثرات بس)

  python3 sound_add.py <ملف الصوت> <الاسم> [--start ث] [--dur ث] [--fade ث] [--lp هرتز] [--work <مجلد المقطع>]

  • الاسم هو اللي تكتبه بـsfx_events.json (مثال: stamp · page_turn · whoosh_1).
  • بدون --work يروح لمكتبته الدائمة (sounds/ بمجلد بياناته) ويبقى لكل مقاطعه.
    مع --work يروح لـ<work>/sounds/ لهالمقطع بس.
  • --lp 4500 ينعّم الأصوات الحادّة (فوق 4 كيلوهرتز تصفّر فوق صوته).
  • قبل ما تعتمد صوتاً: قِس مدته وبدايته وذيله ومركز طيفه، واسمعه بأذنك لا باسمه.
  مصادر مجانية: مكتبته هو (الأفضل) · Mixkit (mixkit.co/free-sound-effects) · Pixabay (pixabay.com/sound-effects).
  ⛔ لا تنشر ملفات الأصوات نفسها لأحد — رخص المكتبات تسمح تستخدمها بمقاطعك بس.
"""
import sys
import subprocess, numpy as np, wave, os, sys
SR=48000
def load(p):
    r=subprocess.run(['ffmpeg','-v','error','-i',p,'-ac','2','-ar',str(SR),'-f','f32le','-'],capture_output=True)
    return np.frombuffer(r.stdout,dtype=np.float32).reshape(-1,2).copy()
def env(x):
    m=np.abs(x).mean(1); w=int(0.005*SR); return np.convolve(m,np.ones(w)/w,'same')+1e-9
def lowpass(x,fc):
    a=np.exp(-2*np.pi*fc/SR); y=np.zeros_like(x); z=np.zeros(2)
    for i in range(len(x)): z=(1-a)*x[i]+a*z; y[i]=z
    return y
def shape(x, lp=None):
    if lp:  # تنعيم الحدّة: مزيج الأصل مع نسخة مصفّاة (رفّ ناعم لا قصّ)
        x = 0.45*x + 0.55*lowpass(x, lp)
    return x
def save(name, x):
    x=x/ (np.abs(x).max()+1e-9) * 0.89   # ذروة ‎-1 dBFS موحّدة، والكسب النهائي بالمازج
    x=(np.clip(x,-1,1)*32767).astype('<i2')
    with wave.open(os.path.join(OUT, name + '.wav'),'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(x.tobytes())
    print(f"  {name:<12} {len(x)/SR:5.2f} ث")
def cut(p, name, start=None, dur=None, fade=0.08, lp=None, onset_db=-24, pre=0.004):
    x=load(p); e=env(x); db=20*np.log10(e/e.max())
    s = int(start*SR) if start is not None else max(0, int(np.argmax(db>onset_db)) - int(pre*SR))
    e2 = len(x) if dur is None else min(len(x), s+int(dur*SR))
    if dur is None:
        tail=np.where(db[s:]>-38)[0]; e2 = s + (tail[-1] if len(tail) else len(x)-s) + int(0.02*SR)
    y=x[s:e2].copy(); n=int(fade*SR)
    if n and len(y)>n: y[-n:] *= np.linspace(1,0,n)[:,None]
    y[:int(0.002*SR)] *= np.linspace(0,1,int(0.002*SR))[:,None]
    save(name, shape(y, lp))

if __name__ == '__main__':
    a = sys.argv
    if len(a) < 3: print(__doc__); sys.exit(2)
    def opt(k, cast=float):
        return cast(a[a.index(k) + 1]) if k in a else None
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'scripts'))
    import _paths; _paths.ensure()
    work = opt('--work', str)
    OUT = os.path.join(os.path.abspath(work), 'sounds') if work else _paths.data('sounds')
    os.makedirs(OUT, exist_ok=True)
    cut(a[1], a[2], start=opt('--start'), dur=opt('--dur'),
        fade=opt('--fade') if '--fade' in a else 0.08, lp=opt('--lp'))
    print('← ' + OUT)
