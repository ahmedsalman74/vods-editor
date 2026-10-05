import {T, CAP, CAPMOVE} from './theme';
import {p, rgba, ease, back} from './util';
import caps from './caps.json';

type W = {t:string; s:number; e:number; hot:boolean};
type C = {s:number; e:number; w:W[]};
const CARDS = (caps as any).cards as C[];

/* ⛔ سطران كحد أقصى — القاعدة من ملف هويته (maxLines:2).
   الثالث يكبّر الكرت ويأكل مساحة النافذة، ولاحظه فوراً: «الكابشن يصير 3 سطور
   وما راعينا الخطوط وحجمها». الحل المعتمد بالمحرّك الخفيف: الجملة اللي ما تدخل
   بسطرين **تنقسم كرتين متتاليتين**، وكل كرت ياخذ توقيت كلماته — والمقاس ثابت لا يتغيّر. */
const SLIM = CAP.style === 'slim';
const GAP = 16, PADX = SLIM ? 36 : 44, PADY = SLIM ? 14 : 30, LH = Math.round(CAP.size * 1.44);
const MAXW = CAP.maxW;

let _ctx: CanvasRenderingContext2D | null = null;
const measure = (s: string) => {
  if (!_ctx) {
    const c = document.createElement('canvas'); _ctx = c.getContext('2d');
    if (_ctx) _ctx.font = `${CAP.weight} ${CAP.size}px "${T.font}"`;
  }
  return _ctx ? _ctx.measureText(s).width : s.length * CAP.size * 0.52;
};
/** يلفّ الكلمات لأسطر بعرض MAXW */
const wrap = (ws: W[]) => {
  const L: W[][] = []; let cur: W[] = [], cw = 0;
  for (const w of ws) {
    const ww = measure(w.t), add = cur.length ? ww + GAP : ww;
    if (cw + add > MAXW && cur.length) { L.push(cur); cur = [w]; cw = ww; }
    else { cur.push(w); cw += add; }
  }
  if (cur.length) L.push(cur);
  return L;
};
/** ⛔ التقسيم **متوازن** لا جشع: نحسب أقل عدد قطع تدخل كلها بسطرين ثم نوزّع
    الكلمات بالتساوي. الجشع (املأ ثم اكسر) يخلّف كلمة وحيدة بسطر أو بكرت كامل —
    — الكلمة الوحيدة بسطر تُقرأ خطأ. */
const even = (ws: W[], n: number): W[][] => {
  const per = Math.ceil(ws.length / n), out: W[][] = [];
  for (let i = 0; i < ws.length; i += per) out.push(ws.slice(i, i + per));
  return out;
};
const split = (c: C): C[] => {
  if (wrap(c.w).length <= CAP.lines) return [c];
  let n = 1, parts: W[][] = [c.w];
  while (n < c.w.length) { parts = even(c.w, n); if (parts.every(pp => wrap(pp).length <= CAP.lines)) break; n++; }
  const out: C[] = parts.map((ws,i) => ({s: i===0 ? c.s : ws[0].s - 0.06, e: 0, w: ws}));
  out.forEach((o,i) => { o.e = i < out.length-1 ? out[i+1].s - 0.02 : c.e; });
  return out;
};
const SHOWN: C[] = CARDS.flatMap(split);

export const Captions: React.FC<{t:number}> = ({t}) => {
  const c = SHOWN.find(c => t >= c.s && t < c.e);
  if (!c) return null;
  /* ⛔ لا كرت فاضي: القطعة تظهر مع أول كلمة تُنطق منها، لا قبلها */
  if (!c.w.some(w => t >= w.s)) return null;
  const lt = t - c.s, rt = c.e - t;
  let a = 1, dy = 0, sc = 1;
  if (lt < 0.20) { const k = lt/0.20; a = ease(k); dy = (1-ease(k))*28; sc = 0.93 + 0.07*back(k); }
  if (rt < 0.13) { const k = rt/0.13; a = k; dy = -(1-k)*10; }
  const lines = wrap(c.w);

  return (
    <div style={{position:'absolute', left:0, right:0, bottom:1920-(CAPMOVE.find(m=>t>=m[0]&&t<m[1])?.[2] ?? CAP.bottom), display:'flex', justifyContent:'center',
      opacity:a, transform:`translateY(${dy}px) scale(${sc})`}}>
      <div dir="rtl" style={{
        maxWidth:MAXW + PADX*2,
        background: SLIM ? rgba(T.bg,0.52) : rgba(T.bg,0.96),
        border: SLIM ? 'none' : `2.5px solid ${rgba(T.ink,0.09)}`,
        backdropFilter: SLIM ? 'blur(8px)' : undefined,
        borderRadius: SLIM ? 22 : 38, padding:`${PADY}px ${PADX}px`,
        boxShadow: SLIM ? '0 6px 22px rgba(0,0,0,0.34)' : `0 20px 48px ${rgba(T.ink,0.30)}`,
        textShadow: SLIM ? '0 2px 10px rgba(0,0,0,0.85)' : undefined,
        fontFamily:T.font, fontWeight:CAP.weight, fontSize:CAP.size, lineHeight:`${LH}px`,
        textAlign:'center', color: SLIM ? '#FFFFFF' : T.ink}}>
        {lines.map((ln,li) => (
          <div key={li} style={{whiteSpace:'nowrap'}}>
            {ln.map((w,i) => {
              const active = t >= w.s && t < w.e, spoken = t >= w.s;
              const lift = active ? -5*Math.sin(Math.min(1,(t-w.s)/0.10)*Math.PI) : 0;
              const hot = w.hot && spoken;
              const grow = hot ? Math.min(1,(t-w.s)/0.16) : 0;
              /* ⛔ الكلمة تُخفى قبل نطقها ولا تُشال من التخطيط — visibility لا display:
                 الكرت يبقى بحجمه الكامل فما فيه إعادة لفّ ولا قفزات.
                 «قلنا نخلي الكلام مخفي وكل كلمة أنطقها تطلع». */
              return (
                <span key={i} style={{display:'inline-block', margin:`0 ${GAP/2}px`, position:'relative',
                  visibility: spoken ? 'visible' : 'hidden',
                  transform:`translateY(${lift}px)`,
                  color: hot ? '#FFF' : (active ? T.acc : (SLIM ? '#FFFFFF' : T.ink))}}>
                  {hot && (
                    <span style={{position:'absolute', inset:'-11px -14px', background:T.acc, borderRadius:15,
                      transform:`scaleX(${ease(grow)})`, transformOrigin:'right center', zIndex:-1}} />
                  )}
                  {w.t}
                </span>);
            })}
          </div>))}
      </div>
    </div>);
};
