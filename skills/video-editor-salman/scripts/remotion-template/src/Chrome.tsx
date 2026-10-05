import {staticFile, Img} from 'remotion';
import {T, VEND, HAS_LOGO} from './theme';
import {p, rgba, mix} from './util';

/* ═══ الخلفية الحيّة — القاعدة ٢٠. بدونها تطلع خلفية رمادية مسطّحة ويلاحظها فوراً.
   منقولة بالحرف من الملف المرجعي المعتمد: تدرّج بارد + ثلاثة توهّجات تنجرف ببطء + حبيبات.
   ⛔ الخلفية باردة (sky) والتمييز دافئ (acc) — الألوان كلها من ملف هويته. */
const GRAIN = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'>
     <filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='3'/>
       <feColorMatrix type='saturate' values='0'/></filter>
     <rect width='180' height='180' filter='url(#n)' opacity='0.5'/></svg>`);

export const LiveBG: React.FC<{t:number}> = ({t}) => {
  const b1 = 0.5 + 0.5*Math.sin(t*0.62), b2 = 0.5 + 0.5*Math.sin(t*0.44 + 2);
  const dx = Math.sin(t*0.23)*70, dy = Math.cos(t*0.19)*54;
  const glow = (cx:number, cy:number, r:number, col:string, a:number) => ({
    position:'absolute' as const, left:cx-r, top:cy-r, width:r*2, height:r*2,
    background:`radial-gradient(circle, ${rgba(col,a)} 0%, ${rgba(col,a*0.28)} 60%, rgba(0,0,0,0) 100%)`});
  return (
    <div style={{position:'absolute', inset:0, overflow:'hidden',
      background:`linear-gradient(180deg,${mix(T.bg,T.sky,0.10)} 0%,${T.bg} 52%,${mix(T.bg,'#000000',0.14)} 100%)`}}>
      {/* ⛔ خفيفة ومسحوبة للداخل: التوهّج القوي على الجوانب يصبغ الإطار كله.
          التوهّج يلمّح للعمق، ما يصبغ الإطار. */}
      <div style={glow(400+dx*0.6, 430+dy*0.6, 560, T.sky, 0.13+0.07*b1)}/>
      <div style={glow(700-dx*0.6, 1330-dy*0.6, 500, mix(T.sky,'#000000',0.30), 0.09+0.06*b2)}/>
      <div style={glow(560, 980, 460, T.acc, 0.030)}/>
      <div style={{position:'absolute', inset:0, opacity:0.11,
        backgroundImage:`url("${GRAIN}")`, backgroundRepeat:'repeat'}}/>
    </div>);
};

/* ═══ الشارة — تحت يسار، نصّ لاتيني بظلّ غامق، بلا لوح.
   ⛔ كانت كبسولة أعلى الوسط: تأكل الحيّز فوق رأسه وتصادم عناوين الرسومات.
   فمكانها تحت يسار — وبلا شريط تقدّم (يزاحم ويشتّت). */
const HANDLE_Y = 1546;
export const Badge: React.FC<{t:number}> = ({t}) => {
  const a = p(t,0.25,0.7) * (t > VEND-0.3 ? 1-p(t,VEND-0.3,VEND) : 1);
  if (a <= 0 || !T.handle) return null;
  return (
    <div style={{position:'absolute', left:52, top:HANDLE_Y, opacity:a*0.92,
      display:'flex', alignItems:'center', gap:12}}>
      {HAS_LOGO && <Img src={staticFile('logo.png')} style={{width:34, height:34, opacity:0.7}} />}
      <span dir="ltr" style={{fontFamily:'"Helvetica Neue", Helvetica, Arial, sans-serif',
        fontWeight:600, fontSize:28, color:rgba(T.ink,0.62),
        textShadow:`0 2px 14px ${rgba(T.bg,0.85)}, 0 0 6px ${rgba(T.bg,0.9)}`}}>{T.handle}</span>
    </div>);
};

export const Card: React.FC<React.PropsWithChildren<{style?:React.CSSProperties; radius?:number}>> =
  ({children, style, radius=20}) => (
  <div style={{background:rgba(T.bg,0.96), border:`2.5px solid ${rgba(T.ink,0.09)}`,
    boxShadow:`0 20px 48px ${rgba(T.ink,0.30)}`, borderRadius:radius, ...style}}>{children}</div>
);
