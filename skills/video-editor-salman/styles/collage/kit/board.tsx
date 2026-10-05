/* ═══════ عُدّة اللوح الكبير — للمخططات وأي شرح أوسع من الإطار ═══════
   import {BD, Canvas, Node, Wire, Tab, ends, dOf, ptOf, makeCam, win, smooth} from './board';
   الفكرة (مثل تحريك مخططات سير العمل):
   **النبضة تمشي على السلك والعقدة تشتعل لما توصلها.** العين تتبع الضوء، فالكاميرا تتحرّك أقل.
   بدونها يصير «خريطة من ثقب مفتاح» — جُرّبت ورُفضت.

   ⛔ الخطوط الحمراء المتعلّقة باللوح (styles/collage/BOARD.md):
   · حدود المشاهد **قطع حاد** — `win` لا `io`. التلاشي يفضّي الإطار قبل ما يبان وجهه.
   · الفرعان من **حافتَي** الصندوق بنفس الارتفاع، والوسم **خارجه** دائماً.
   · عرض الأسئلة 620 لا 700 — يخلّي 118 بكسل للوسم بعيداً عن حافة الإطار.
   · أول عقدة موجودة من **أول إطار** — اللوح ما يفتح فاضياً.
   · إزاحة الشبكة (`sy`) **واحدة** عبر كل مشاهد اللوح، وإلا قفزت الخلفية.
   · التبويبات **بالنص** — الأطراف يقصّها إنستقرام.
   · أوزان 400/700/900 فقط داخل الرسومات (500 ما هو موجود ويسقط لعائلة ثانية).
   · الدافئ = طريقك · السماوي = مسار انتهى. معنى لا زينة. */
import React from 'react';
import {Img, staticFile} from 'remotion';
import {T, WGT} from './theme';
import {rgba} from './util';
import {p, lerp, back, F, abs} from './vox';

/* ألوان اللوح من هويته: الدافئ = لون التمييز (طريقك الشغّال) · البارد = sky (مسار انتهى).
   اللوح والبطاقات رمادي داكن محايد عشان أي لون تمييز يبان فوقه. */
export const BD = {
  BG: '#0C0D0F',
  CARD: 'linear-gradient(180deg,#252A30 0%,#191D22 52%,#14171B 100%)',
  LINE: rgba(T.ink, 0.14),
  INK: T.ink, MUT: T.mut,
  CLAY: T.acc, WARM: T.warm, GOLD: T.warm, COOL: T.sky,
};

/** نافذة مشهد = قطع حاد على الطرفين. ⛔ لا تستعمل `io` لحدود المشهد. */
export const win = (t:number, a:number, b:number) => (t >= a && t < b ? 1 : 0);
/** تباطؤ خماسي — ناعم بالطرفين، للكاميرا وللنبضة. */
export const smooth = (u:number) => { const x = Math.max(0, Math.min(1, u)); return x*x*x*(x*(6*x-15)+10); };

/** الخلفية: نقاط خافتة + وهج دافئ. `sy` **واحد** لكل مشاهد اللوح. */
export const Canvas = ({sy}:{sy:number}) => (
  <div style={abs({inset:0, background:BD.BG})}>
    <div style={abs({left:-60, top:-60, right:-60, bottom:-60,
      backgroundImage:'radial-gradient(rgba(232,227,219,0.075) 1.6px, transparent 1.6px)',
      backgroundSize:'50px 50px', backgroundPosition:`0px ${-sy * 0.45}px`})}/>
    <div style={abs({inset:0, background:'radial-gradient(ellipse at 50% 48%, rgba(200,132,95,0.10) 0%, rgba(12,13,15,0) 62%)'})}/>
  </div>);

export type BNode = {id:string; x:number; y:number; w:number; h:number;
  t:string; sub?:string; img?:string; rv:number; cool?:1};
export type BEdge = {x1:number; y1:number; x2:number; y2:number; side:number; drop:number};

/** حافة الأب ← حافة الابن. `f` يفرض الجهة (±1) لاستكمال ينزل لنفس العمود. */
export const ends = (a:BNode, b:BNode, f = 0):BEdge => {
  const s = f || (a.x === b.x ? 0 : (b.x < a.x ? -1 : 1));
  return s === 0
    ? {x1:a.x, y1:a.y + a.h/2, x2:b.x, y2:b.y - b.h/2, side:0, drop:0}
    : {x1:a.x + s*(a.w/2), y1:a.y, x2:b.x, y2:b.y - b.h/2, side:s,
       drop:(f && Math.abs(b.x - a.x) < 40) ? 1 : 0};
};
const cps = (e:BEdge) => e.side === 0 ? [e.x1, (e.y1+e.y2)/2, e.x2, (e.y1+e.y2)/2]
  : e.drop ? [e.x1 + e.side*230, e.y1 + 40, e.x2 + e.side*230, e.y2 - 150]
  : [e.x1 + e.side*170, e.y1, e.x2, e.y1 + 90];
export const dOf = (e:BEdge) => { const [ax, ay, bx, by] = cps(e);
  return `M${e.x1} ${e.y1} C ${ax} ${ay}, ${bx} ${by}, ${e.x2} ${e.y2}`; };
/** نقطة على السلك عند `u∈[0,1]` — مكان النبضة. */
export const ptOf = (e:BEdge, u:number) => {
  const v = 1 - u, [c1x, c1y, c2x, c2y] = cps(e);
  return {x:v*v*v*e.x1 + 3*v*v*u*c1x + 3*v*u*u*c2x + u*u*u*e.x2,
          y:v*v*v*e.y1 + 3*v*v*u*c1y + 3*v*u*u*c2y + u*u*u*e.y2};
};
/** وسم الفرع — **خارج** الصندوق، بعيداً عن حافة الإطار. */
export const labelAt = (e:BEdge) => ({left:e.x1 + e.side*62 - 50, top:e.y1 - 76, width:100});

/** الكاميرا: تنزلق من المحطة **السابقة للحالية**، لا من الحالية للجاية.
    CAM: [وقت, معرّف العقدة أو مفتاح بـ`extra`, تكبير?]. `extra` للوقفة الواسعة. */
export const makeCam = (CAM:[number, string, number?][], NB:Record<string, {x:number;y:number}>,
                        extra:Record<string, {x:number;y:number}> = {}, glide = 1.25) => {
  const pos = (i:number) => {
    const id = CAM[i][1], n = extra[id] ?? NB[id];
    return {x:n.x, y:n.y, z:CAM[i][2] ?? 1};
  };
  return (t:number) => {
    /* ⛔ الغلطة: `while (t >= CAM[i+1][0]) i++` ثم الانزلاق نحو CAM[i+1] — يقفز عند كل محطة. */
    let i = 0; while (i < CAM.length - 1 && t >= CAM[i + 1][0]) i++;
    const b = pos(i);
    if (i === 0) return b;
    const a = pos(i - 1), k = smooth((t - CAM[i][0]) / glide);
    return {x:lerp(a.x, b.x, k), y:lerp(a.y, b.y, k), z:lerp(a.z, b.z, k)};
  };
};

/** عقدة: بطاقة تشتعل لما توصلها النبضة ثم تهدأ. `k` الظهور · `glow` الاشتعال. */
export const Node = ({n, k, glow}:{n:BNode; k:number; glow:number}) => {
  if (k <= 0) return null;
  const kk = Math.min(1, k), rgb = n.cool ? '110,147,166' : '215,140,90';
  const ls = n.t.split('|');
  return (<div style={abs({left:n.x - n.w/2, top:n.y - n.h/2, width:n.w, height:n.h,
    opacity:Math.min(1, kk * 1.8), transform:`scale(${lerp(0.95, 1, back(kk))})`})}>
    <div style={abs({inset:0, borderRadius:30, backgroundImage:BD.CARD,
      border:`1.5px solid ${glow > 0.02 ? `rgba(${n.cool ? '110,147,166' : '232,164,110'},${0.2 + glow*0.6})` : BD.LINE}`,
      boxShadow:glow > 0.02 ? `0 0 ${30 + glow*64}px rgba(${rgb},${glow*0.42}), 0 20px 42px rgba(0,0,0,0.62)`
                            : '0 20px 42px rgba(0,0,0,0.55)'})}/>
    {/* اللمعة العلوية — بدونها البطاقة مسطّحة */}
    <div style={abs({left:26, right:26, top:0, height:1,
      background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.16),transparent)'})}/>
    {n.img ? <div style={abs({left:22, top:(n.h - 128)/2, width:128, height:128, borderRadius:22,
      overflow:'hidden', border:`1.5px solid ${BD.LINE}`, background:'#0B0D0F'})}>
      <Img src={staticFile(n.img)} style={{width:128, height:128, objectFit:'cover',
        filter:`contrast(1.05) brightness(${0.92 + glow*0.4})`}}/></div> : null}
    <div dir="rtl" style={abs({left:n.img ? 170 : 28, top:0, width:n.w - (n.img ? 198 : 56), height:n.h,
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10})}>
      <div style={{color:BD.INK, textAlign:'center', lineHeight:1.18, ...F(WGT.black, ls.length > 1 ? 44 : 48)}}>
        {ls.map((l, i) => <div key={i}>{l}</div>)}</div>
      {n.sub ? <><div style={{width:'52%', height:1, background:BD.LINE}}/>
        <div style={{color:n.cool ? BD.COOL : BD.MUT, textAlign:'center', ...F(WGT.bold, 28)}}>{n.sub}</div></> : null}
    </div>
  </div>);
};

/** سلك + نبضة. `born` رسم الخط الرمادي · `lit` تقدّم النبضة (0→1).
    ⛔ الخط الرمادي ما ينرسم إلا **بعد** ما تنوّر عقدته. */
export const Wire = ({e, born, lit, cool}:{e:BEdge; born:number; lit:number; cool?:boolean}) => {
  if (born <= 0) return null;
  const C = cool ? BD.COOL : BD.WARM, d = dOf(e), q = ptOf(e, smooth(lit));
  return (<g>
    <path d={d} fill="none" stroke={BD.MUT} strokeWidth={2} strokeDasharray={2000}
      strokeDashoffset={2000 * (1 - smooth(born))} opacity={0.28}/>
    {lit > 0 ? <path d={d} fill="none" stroke={C} strokeWidth={4} strokeLinecap="round"
      strokeDasharray={2000} strokeDashoffset={2000 * (1 - lit)}/> : null}
    <circle cx={e.x1} cy={e.y1} r={8} fill={C} opacity={Math.min(1, born * 1.6)}
      style={{filter:`drop-shadow(0 0 14px ${C})`}}/>
    {lit > 0 && lit < 1 ? <g>
      <circle cx={q.x} cy={q.y} r={40} fill={C} opacity={0.16}/>
      <circle cx={q.x} cy={q.y} r={17} fill={C} opacity={0.38}/>
      <circle cx={q.x} cy={q.y} r={9} fill="#FFF7E8"
        style={{filter:`drop-shadow(0 0 20px ${C}) drop-shadow(0 0 44px ${C})`}}/></g> : null}
  </g>);
};

/** تبويب المثال: يطلع **بنص الإطار** واللوحة تخفت وتتشوّش وراه — ما تُشال.
    خفوت اللوحة من عند المستدعي: `opacity:1-dim*0.72` و`blur(dim*2.4px)`. */
export const Tab = ({t, a, b, src, title, note, strike}:
  {t:number; a:number; b:number; src?:string; title:string; note?:string; strike?:number}) => {
  const vis = Math.min(p(t, a, a + 0.4), 1 - p(t, b - 0.36, b)); if (vis <= 0) return null;
  const g = smooth(vis), W = 560;
  return (<div style={abs({left:540 - W/2, top:1080, width:W, opacity:Math.min(1, vis * 1.7),
    transformOrigin:'50% 0%', transform:`translateY(${(1 - g)*40}px) scale(${lerp(0.88, 1, g)})`})}>
    <div style={{backgroundImage:BD.CARD, border:`1.5px solid ${BD.LINE}`, borderRadius:26, padding:18,
      boxShadow:'0 40px 80px rgba(0,0,0,0.8)', position:'relative'}}>
      {src ? <Img src={staticFile(src)} style={{width:W - 36, height:(W - 36)*0.72, objectFit:'cover',
        borderRadius:16, filter:'contrast(1.05)', display:'block'}}/> : null}
      <div dir="rtl" style={{marginTop:src ? 16 : 4, textAlign:'center', color:BD.INK, ...F(WGT.black, 38)}}>{title}</div>
      {note ? <div dir="rtl" style={{marginTop:8, textAlign:'center', color:BD.CLAY, ...F(WGT.bold, 27)}}>{note}</div> : null}
      {strike && strike > 0 ? <div style={abs({left:26, top:(W - 36)*0.36 + 18, width:(W - 52)*strike,
        height:6, background:'#D8412F', transform:'rotate(-5deg)', borderRadius:3})}/> : null}
    </div>
  </div>);
};
