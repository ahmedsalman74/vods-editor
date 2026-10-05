# -*- coding: utf-8 -*-
"""صوته خرج كما دخل؟ — يطرح المؤثرات من الناتج ويقارن الباقي بـvoice.wav.
   python3 20_voice_check.py <work> <الناتج.mp4>      → يخرج 3 لو فشل
⛔ الارتباط الخام مع المؤثرات ينزل تحت 0.999 وهو سليم — لازم تُطرح sfx.wav أولاً (القاعدة ١٩)."""
import sys, os, subprocess, wave, numpy as np
W = os.path.abspath(sys.argv[1]) + '/'; OUT = sys.argv[2]
def rd(p):
    w = wave.open(p); b = w.readframes(w.getnframes()); sw = w.getsampwidth(); ch = w.getnchannels()
    if sw == 3:
        a = np.frombuffer(b, dtype=np.uint8).reshape(-1,3).astype(np.int32)
        v = a[:,0] | (a[:,1]<<8) | (a[:,2]<<16); v = np.where(v >= 1<<23, v-(1<<24), v); x = v/8388608.0
    elif sw == 2: x = np.frombuffer(b, dtype='<i2').astype(np.float64)/32768.0
    else:         x = np.frombuffer(b, dtype=np.uint8).astype(np.float64)/128.0-1
    return x.reshape(-1, ch).mean(1)
tmp = W+'.voicecheck.wav'
subprocess.run(['ffmpeg','-y','-v','error','-i',OUT,'-vn','-c:a','pcm_s24le','-ar','48000','-ac','2',tmp], check=True)
v, o = rd(W+'voice.wav'), rd(tmp)
s = rd(W+'sfx.wav') if os.path.exists(W+'sfx.wav') else np.zeros_like(o)
n = min(len(v), len(o), len(s)); v, o, s = v[:n], o[:n], s[:n]; c = o - s
r  = lambda x: 20*np.log10(np.sqrt((x**2).mean())+1e-12)
cr = lambda x: 20*np.log10(np.abs(x).max()/(np.sqrt((x**2).mean())+1e-12))
corr, gain, crest = np.corrcoef(v, c)[0,1], r(c)-r(v), cr(c)-cr(v)
os.remove(tmp)
ok = corr >= 0.999 and abs(gain) < 0.15
print(f"الارتباط {corr:.6f} {'✅' if corr>=0.999 else '❌'} · الكسب {gain:+.3f} dB {'✅' if abs(gain)<0.15 else '❌'} · عامل الذروة {crest:+.3f} dB")
sys.exit(0 if ok else 3)
