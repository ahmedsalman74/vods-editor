# -*- coding: utf-8 -*-
"""قص السكتات + زوم مختلف لكل مقطع (+ تدرّج لوني لو طلبه فقط).  python3 03_cut_zoom.py <workdir>
يطلّع cutz.mp4 (الفيديو المقصوص للمعاينة والرندر) وvoice.wav (صوته للتسليم، بلا أي معالجة)."""
import json, subprocess, sys, os
W=os.path.abspath(sys.argv[1]); SRC=os.path.join(W,"src.mov")
k=json.load(open(os.path.join(W,"cut.json")))["keep"]
_tp=os.path.join(W,"theme.json")
GRADE=json.load(open(_tp)).get("grade",False) if os.path.exists(_tp) else False
Z=[1.00,1.08,1.00,1.06,1.00,1.12,1.04,1.14,1.00,1.08,1.00,1.05,1.10,1.00]; ANCH=0.30
_at=os.path.join(W,"theme.json")
if os.path.exists(_at):
    _t=json.load(open(_at))
    if isinstance(_t.get("zoomAnchor"),(int,float)): ANCH=float(_t["zoomAnchor"])
    if _t.get("noZoom"): Z=[1.00]
p=subprocess.run(["ffprobe","-v","error","-select_streams","v:0","-show_entries",
   "stream=width,height","-of","csv=p=0:s=x",SRC],capture_output=True,text=True).stdout.strip()
SW,SH=[int(x) for x in p.split("x")[:2]]
fc=[];v=[];a=[]
for i,(s,e) in enumerate(k):
    z=Z[i%len(Z)]; cw=int(SW/z)//2*2; ch=int(SH/z)//2*2
    x=(SW-cw)//2; y=int((SH-ch)*ANCH)
    fc.append(f"[0:v]trim=start={s:.4f}:end={e:.4f},setpts=PTS-STARTPTS,crop={cw}:{ch}:{x}:{y},"
              f"scale=1080:1920:flags=lanczos,setsar=1[v{i}]")
    fc.append(f"[0:a]atrim=start={s:.4f}:end={e:.4f},asetpts=PTS-STARTPTS[a{i}]")
    v.append(f"[v{i}]"); a.append(f"[a{i}]")
fc.append("".join(v)+f"concat=n={len(k)}:v=1:a=0[vc]")
fc.append("".join(a)+f"concat=n={len(k)}:v=0:a=1[ac]")
# التدرّج اللوني اختياري تماماً — الافتراضي مطفي (الفيديو يطلع بألوانه الأصلية)
# قيم التدرّج من دليل الهوية إن وُجدت، وإلا الافتراضي الخفيف
_t2 = json.load(open(_tp)) if os.path.exists(_tp) else {}
_sat = 1.0 + float(_t2.get("gradeSat", -0.04))
_con = float(_t2.get("gradeContrast", 1.05))
_warm = "colorbalance=rs=0.03:gs=0.008:bs=-0.03," if _t2.get("gradeWarmShadows", True) else ""
_g = (f"eq=brightness=0.012:saturation={_sat:.3f}:contrast={_con:.3f}," + _warm) if GRADE else ""
# ⚠️ مصدر آيفون HDR يجي موسوماً bt2020/HLG — أي متصفح يحترم الوسم ويطلّع صورة برتقالية.
# setparams يعيد الوسم لـbt709 فتطلع الألوان طبيعية بكل مكان.
fc.append("[vc]fps=30," + _g +
          "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709,format=yuv420p[vo]")
print("التدرّج اللوني:", f"مفعّل — تشبع {_sat:.2f} · تباين {_con:.2f}" if GRADE else "مطفي (ألوان أصلية)")
# ⛔ القاعدة ١٩: صوته بلا أي معالجة — لا dynaudnorm ولا ضغط (المعاينة بالاستوديو نفس التسليم).
fc.append("[ac]afade=t=in:st=0:d=0.006[ao]")
rc=subprocess.call(["ffmpeg","-v","error","-stats","-i",SRC,"-filter_complex",";".join(fc),
 "-map","[vo]","-map","[ao]","-c:v","libx264","-preset","medium","-crf","16",
 "-c:a","aac","-b:a","192k","-movflags","+faststart","-y",os.path.join(W,"cutz.mp4")])
if rc: sys.exit(rc)
# صوت التسليم (القاعدة ١٩): من src.mov مباشرة بنفس القصّات — 48 كيلو · 24 بت · ستيريو · بلا أي معالجة.
# الرندر يلصقه كما هو، و20_voice_check يقارنه بالمسلَّم.
af=[f"[0:a]atrim=start={s:.4f}:end={e:.4f},asetpts=PTS-STARTPTS[a{i}]" for i,(s,e) in enumerate(k)]
af.append("".join(f"[a{i}]" for i in range(len(k)))+f"concat=n={len(k)}:v=0:a=1[ac]")
sys.exit(subprocess.call(["ffmpeg","-v","error","-i",SRC,"-filter_complex",";".join(af),"-map","[ac]",
 "-c:a","pcm_s24le","-ar","48000","-ac","2","-y",os.path.join(W,"voice.wav")]))
