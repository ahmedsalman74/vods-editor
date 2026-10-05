import {Img, staticFile} from 'remotion';
import {T, VEND, OUTRO, OUTRO_COPY, HAS_LOGO} from './theme';
import {p, ease, eio, back, rgba, onACC} from './util';

/* ⛔ الخاتمة ما تخفي وجهه — وجهه يبقى بنافذة، ونصوص الختام حوله.
   الخلفية تتلاشى دخولاً (لا مسح صاعد يقطع اللقطة)، ووجهه يبقى بنافذة
   يحدّدها stage.json بحالة OUTRO. هذا المكوّن يُرسم **خلف** النافذة (Ad.tsx).
   النصوص من project.json ← outro_copy — لا تكتب نصاً ثابتاً هني. */
export const Outro: React.FC<{t:number}> = ({t}) => {
  /* الافتراضي بلا كرت نهاية: المقطع يخلص على وجهه مع آخر كلمة (outro=0).
     لو يبي خاتمة (دعوة متابعة · ملخص)، حط "outro": ثواني بـsfx.json ونصوصها بـoutro.json. */
  if (OUTRO <= 0.01) return null;
  if (t < VEND - 0.5) return null;
  const s = VEND;
  const C: any = OUTRO_COPY || {};
  const RECAP: string[] = C.recap || [];
  const fade = eio(p(t, s-0.5, s+0.5));          // الخلفية تحلّ محلّ الفيديو الكامل بتلاشٍ
  const ap = (d:number) => p(t, s+d, s+d+0.42);
  const Chk = ({c}:{c:string}) => (
    <svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2.6}
      strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5l5 5 11-11"/></svg>);

  return (
    <div style={{position:'absolute', inset:0, background:T.bg, opacity:fade, overflow:'hidden'}}>
      {/* توهّج خلف النافذة عشان الدائرة تنفصل عن الخلفية */}
      <div style={{position:'absolute', left:190, top:410, width:700, height:700, borderRadius:350,
        background:`radial-gradient(circle, ${rgba(T.acc,0.20)} 0%, ${rgba(T.acc,0)} 68%)`, opacity:ap(0.1)}} />
      {C.line && (
        <div style={{position:'absolute', left:0, right:0, top:1110, textAlign:'center',
          opacity:ap(0.30), transform:`translateY(${(1-ease(ap(0.30)))*16}px)`}}>
          <div dir="rtl" style={{fontWeight:800, fontSize:52, color:T.ink, lineHeight:1.5}}>{C.line}</div>
        </div>)}
      {RECAP.length > 0 && (
        <div style={{position:'absolute', left:110, right:110, top:1210, display:'grid',
          gridTemplateColumns:'1fr 1fr', gap:16, direction:'rtl'}}>
          {RECAP.map((r,i) => {
            const k = ap(0.46+i*0.10);
            return (
              <div key={i} style={{opacity:k, transform:`translateY(${(1-ease(k))*14}px)`,
                background:rgba(T.ink,0.055), border:`2px solid ${rgba(T.ink,0.09)}`, borderRadius:38,
                height:76, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 26px'}}>
                <Chk c={T.acc} />
                <span style={{fontWeight:700, fontSize:34, color:T.ink}}>{r}</span>
              </div>);
          })}
        </div>)}
      <div style={{position:'absolute', left:0, right:0, top:1372, textAlign:'center', opacity:ap(0.86),
        transform:`scale(${0.95+0.05*back(Math.min(1,ap(0.86)))})`}}>
        {C.cta_word && (
          <span style={{display:'inline-block', background:T.acc, color:onACC(T.acc),
            borderRadius:40, padding:'18px 44px', fontWeight:900, fontSize:76,
            boxShadow:`0 16px 40px ${rgba(T.ink,0.22)}`}}>{C.cta_word}</span>)}
      </div>
      <div style={{position:'absolute', left:0, right:0, top:1500, opacity:ap(1.05),
        display:'flex', alignItems:'center', justifyContent:'center', gap:16}}>
        {HAS_LOGO && <Img src={staticFile('logo.png')} style={{width:46, height:46}} />}
        <span dir="ltr" style={{fontWeight:700, fontSize:36, color:T.mut,
          fontFamily:'"Helvetica Neue", Helvetica, Arial, sans-serif'}}>{T.handle}</span>
      </div>
    </div>
  );
};
