/* ═══════ عُدّة الكولاج — ورق حقيقي · دبابيس · خيط · أختام · قصاصات ═══════
   import {Paper, PushPin, Yarn, yarnPath, Tape, Stamp, Highlight, tw, step, Svg, VoxDefs} from './vox';
   الدليل: styles/collage/STYLE.md
   ⛔ الخلفية: الحيّة المعتمدة + ملمس ورق مجعّد **بلونها** (رمادي محايد بخلط soft-light) — الورق يمشي مع لون هويته بدل ما يفرض لونه.
   والبطاقات بألوان ورقها الحقيقية (كرتون · قديم · مربعات).
   الاستثناء الوحيد: الخيط والدبوس **أحمران حقيقيان** — شكل لوحة تحقيق (ألوان الأشياء الحقيقية مسموح تختلف عن الهوية). */
import React from 'react';
import {Img, staticFile} from 'remotion';
import {T, WGT} from './theme';
import {eio} from './util';

export const p = (t:number,a:number,b:number) => Math.max(0,Math.min(1,(t-a)/(b-a)));
export const ease = (k:number) => 1-Math.pow(1-k,3);
export const back = (k:number) => { const c=1.9; return 1+(c+1)*Math.pow(k-1,3)+c*Math.pow(k-1,2); };
export const lerp = (a:number,b:number,k:number) => a+(b-a)*k;
export const F = (w:number, px:number): React.CSSProperties => ({fontFamily:T.font, fontWeight:w, fontSize:px});
export const abs = (s: React.CSSProperties): React.CSSProperties => ({position:'absolute', ...s});
/** Vox: عناصر الكولاج تتحرك ١٥ إطاراً («on twos»). الكاميرا والفيديو والكابشن لا. */
export const step = (t:number) => Math.floor(t*15)/15;
/** آلة كاتبة — حرف حرف */
export const tw = (s:string, t:number, a:number, cps=20) => s.slice(0, Math.max(0, Math.floor((t-a)*cps)));
const rng = (s:number) => { const x=Math.sin(s*9301.7+49297.3)*233280; return x-Math.floor(x); };
export const RED = '#D32F2F', RED_DARK = '#7A1414';

export const Svg = ({children}:{children:React.ReactNode}) =>
  <svg width={1080} height={1920} style={abs({left:0,top:0})}>{children}</svg>;
/** تعريفات مشتركة — ضعها مرة وحدة داخل <Svg> */
export const VoxDefs = () => (<defs>
  <radialGradient id="voxPin" cx="35%" cy="30%" r="70%">
    <stop offset="0%" stopColor="rgba(255,255,255,0.35)"/><stop offset="55%" stopColor="rgba(255,255,255,0)"/><stop offset="100%" stopColor="rgba(0,0,0,0.35)"/>
  </radialGradient></defs>);

/* ─────────── الورق: صورة حقيقية بحواف ممزّقة فعلية ─────────── */
const PAPER = {old:'paper_old.png', kraft:'paper_kraft.png'} as const;
/** ملمس الخلفية — ضعه أول شي بالمشهد فوق الخلفية الحيّة */
export const BoardTexture = ({o=0.95}:{o?:number}) =>
  <Img src={staticFile('crumple_gray.png')} style={abs({inset:0,width:'100%',height:'100%',objectFit:'cover',mixBlendMode:'soft-light',opacity:o})}/>;
export const Paper = ({kind='old',x,y,w,rot=0,k=1,children}:
  {kind?:'old'|'kraft';x:number;y:number;w:number;rot?:number;k?:number;children?:React.ReactNode}) => {
  if (k<=0) return null;
  return (<div style={abs({left:x,top:y,width:w,opacity:Math.min(1,k*2.5),
    transform:`translateY(${(1-ease(k))*-60}px) rotate(${rot+(1-ease(k))*8}deg)`,
    filter:'drop-shadow(0 22px 20px rgba(0,0,0,0.6)) drop-shadow(0 3px 3px rgba(0,0,0,0.5))'})}>
    <Img src={staticFile(PAPER[kind])} style={{width:'100%',display:'block'}}/>
    <div style={abs({inset:0})}>{children}</div>
  </div>);
};
/** ورق مربعات بحافة ممزّقة */
export const GridPaper = ({x,y,w,h,rot=0,k=1,children}:{x:number;y:number;w:number;h:number;rot?:number;k?:number;children?:React.ReactNode}) => {
  if (k<=0) return null;
  const e=(i:number)=>(rng(i)*3).toFixed(1);
  const clip=`polygon(0% ${e(1)}%,12% 0%,30% ${e(2)}%,48% 0%,70% ${e(3)}%,88% 0%,100% ${e(4)}%,99% 30%,100% 62%,98% 100%,70% 97%,44% 100%,20% 97%,0% 100%,2% 64%,0% 30%)`;
  return (<div style={abs({left:x,top:y,width:w,height:h,opacity:Math.min(1,k*2.5),
    transform:`translateY(${(1-ease(k))*-60}px) rotate(${rot}deg)`,filter:'drop-shadow(0 22px 20px rgba(0,0,0,0.6))'})}>
    <div style={abs({inset:0,backgroundImage:`url(${staticFile('tex_grid.jpg')})`,backgroundSize:'cover',clipPath:clip})}/>
    <div style={abs({inset:0})}>{children}</div>
  </div>);
};

/* ─────────── دبوس بعمق: ظلّ · إبرة · رأس لامع ─────────── */
export const PushPin = ({x,y,k,col=RED}:{x:number;y:number;k:number;col?:string}) => {
  if (k<=0) return null;
  const lift=(1-ease(k))*60, s=0.8+0.2*back(Math.min(1,k));
  return (<g transform={`translate(${x} ${y-lift}) scale(${s})`} opacity={Math.min(1,k*3)}>
    <ellipse cx={16+lift*0.3} cy={24+lift*0.45} rx={30} ry={13} fill="rgba(0,0,0,0.5)" style={{filter:'blur(4px)'}}/>
    <path d="M-3,10 L3,10 L6,30 L4,31 Z" fill="#b8bec4"/>
    <ellipse cx={0} cy={8} rx={16} ry={7} fill={RED_DARK}/>
    <circle cx={0} cy={0} r={26} fill={col}/>
    <circle cx={0} cy={0} r={26} fill="url(#voxPin)"/>
    <ellipse cx={-9} cy={-11} rx={9} ry={6} fill="rgba(255,255,255,0.78)"/>
  </g>);
};

/* ─────────── خيط صوف أحمر: يرتخي بين دبوسين ويلتف حول الهدف ───────────
   yarnPath([[x,y],[x,y],…]) — يبدأ من الدبوس الأول، ويلتف حول كل دبوس بعده.
   ⛔ وزّع الدبابيس على **حواف** الورق — الخيط يمرّ فوق أي كلام بينها. */
export const yarnPath = (pins:[number,number][], sag=70, wrapR=31) => {
  const q:[number,number][] = [];
  let [sx,sy] = pins[0];
  for (let j=1;j<pins.length;j++) {
    const [cx,cy] = pins[j];
    const ang = Math.atan2(sy-cy, sx-cx);
    const ex = cx+Math.cos(ang)*wrapR, ey = cy+Math.sin(ang)*wrapR;
    const mx=(sx+ex)/2, my=(sy+ey)/2 + sag*(j%2?1:-0.5);
    for (let i=0;i<=46;i++){ const u=i/46; q.push([(1-u)*(1-u)*sx+2*(1-u)*u*mx+u*u*ex,(1-u)*(1-u)*sy+2*(1-u)*u*my+u*u*ey]); }
    for (let i=0;i<=40;i++){ const a=ang+i/40*1.2*Math.PI*2; q.push([cx+Math.cos(a)*wrapR, cy+Math.sin(a)*wrapR]); }
    [sx,sy] = q[q.length-1];
  }
  return q.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
};
export const Yarn = ({d,k,id}:{d:string;k:number;id:string}) => k<=0 ? null : (<g>
  <defs><mask id={id}><path d={d} fill="none" stroke="#fff" strokeWidth={14} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1-k}/></mask></defs>
  <path d={d} fill="none" stroke="rgba(0,0,0,0.42)" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round"
    transform="translate(4 9)" pathLength={1} strokeDasharray={1} strokeDashoffset={1-k} style={{filter:'blur(2.5px)'}}/>
  <path d={d} fill="none" stroke={RED_DARK} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1-k}/>
  <path d={d} fill="none" stroke={RED} strokeWidth={6.8} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1-k}/>
  <path d={d} fill="none" stroke="rgba(255,170,170,0.32)" strokeWidth={1.8} strokeDasharray="2.5 4.5" strokeLinecap="round" mask={`url(#${id})`}/>
</g>);

/* ─────────── شريط لاصق · ختم · قلم تظليل ─────────── */
export const Tape = ({x,y,w=150,rot=-8,k=1}:{x:number;y:number;w?:number;rot?:number;k?:number}) => k<=0 ? null : (
  <div style={abs({left:x-w/2,top:y-19,width:w,height:38,transformOrigin:'left center',
    transform:`rotate(${rot}deg) scaleX(${ease(Math.min(1,k))})`,background:'rgba(245,241,234,0.42)',
    boxShadow:'0 1px 3px rgba(0,0,0,0.3)'})}/>);
export const Stamp = ({x,y,text,k,rot=-9,col=T.acc,size=42}:
  {x:number;y:number;text:string;k:number;rot?:number;col?:string;size?:number}) => {
  if (k<=0) return null;
  const s=lerp(1.85,1,back(Math.min(1,k*1.5)));
  return <div dir="rtl" style={abs({left:x,top:y,transform:`translate(-50%,-50%) rotate(${rot}deg) scale(${s})`,
    opacity:Math.min(0.9,k*4),border:`5px solid ${col}`,borderRadius:12,padding:'4px 18px',color:col,
    ...F(WGT.black,size),whiteSpace:'nowrap'})}>{text}</div>;
};
/** قلم تظليل أصفر — علامة Vox. ⛔ ضع الأب `isolation:'isolate'` وإلا يطيح ورا الورقة (zIndex −1). */
export const Highlight = ({k}:{k:number}) => k<=0 ? null : (
  <span style={abs({left:-10,right:-10,top:'18%',bottom:'8%',background:'rgba(242,201,76,0.62)',borderRadius:6,zIndex:-1,
    transform:`scaleX(${k}) skewX(-6deg)`,transformOrigin:'right center'})}/>);

/* ─────────── قصاصات · X حمراء · صور بورق · يد الختم ─────────── */
const rngK = (s:number) => { const x=Math.sin(s*9301.7+49297.3)*233280; return x-Math.floor(x); };
const INK_K = '#231F1A';
/** حافة ممزّقة ثابتة لكل بذرة */
export const torn = (seed:number, j=2.2) => {
  const pts:string[]=[]; const n=14;
  for(let i=0;i<=n;i++) pts.push(`${(i/n*100).toFixed(1)}% ${(rngK(seed+i)*j).toFixed(1)}%`);
  for(let i=1;i<=n;i++) pts.push(`${(100-rngK(seed+40+i)*j*0.6).toFixed(1)}% ${(i/n*100).toFixed(1)}%`);
  for(let i=n-1;i>=0;i--) pts.push(`${(i/n*100).toFixed(1)}% ${(100-rngK(seed+80+i)*j).toFixed(1)}%`);
  for(let i=n-1;i>=1;i--) pts.push(`${(rngK(seed+120+i)*j*0.6).toFixed(1)}% ${(i/n*100).toFixed(1)}%`);
  return `polygon(${pts.join(',')})`;
};
/** قصاصة ورق حقيقي — بدل المربع الأصفر */
export const Scrap = ({x,y,w,h,rot=0,k=1,kind='old',tape=true,size=44,children}:
  {x:number;y:number;w:number;h:number;rot?:number;k?:number;kind?:'old'|'kraft';tape?:boolean;size?:number;children?:React.ReactNode}) => k<=0 ? null : (
  <div style={abs({left:x,top:y,width:w,height:h,opacity:Math.min(1,k*3),
    transform:`translateY(${(1-ease(Math.min(1,k)))*-40}px) rotate(${rot+(1-ease(Math.min(1,k)))*6}deg)`,filter:'drop-shadow(0 12px 12px rgba(0,0,0,0.5))'})}>
    <div style={abs({inset:0,clipPath:torn(x*0.37+y*0.11)})}>
      <Img src={staticFile(kind==='old'?'paper_old.png':'paper_kraft.png')} style={abs({inset:0,width:'100%',height:'100%',objectFit:'cover'})}/>
    </div>
    <div dir="rtl" style={abs({inset:0,display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center',...F(WGT.black,size),color:INK_K,lineHeight:1.1})}>{children}</div>
    {tape && <Tape x={w/2} y={2} w={Math.min(130,w*0.5)} rot={-5} k={k}/>}
  </div>);
/** X حمراء بخط اليد تنرسم على الغلط (من مقطع Alex) */
export const RedX = ({x,y,w,h,k}:{x:number;y:number;w:number;h:number;k:number}) => k<=0 ? null : (
  <Svg>{[[`M ${x},${y} Q ${x+w*0.55},${y+h*0.45} ${x+w},${y+h}`,0],[`M ${x+w},${y+h*0.05} Q ${x+w*0.4},${y+h*0.5} ${x+w*0.02},${y+h*0.97}`,1]].map(([d,i])=>
    <path key={i as number} d={d as string} fill="none" stroke={RED} strokeWidth={11} strokeLinecap="round" opacity={0.92} pathLength={1} strokeDasharray={1}
      strokeDashoffset={1-ease(p(k,(i as number)*0.5,(i as number)*0.5+0.5))} style={{filter:'drop-shadow(0 3px 2px rgba(0,0,0,0.4))'}}/>)}</Svg>);
/** صورة كاملة داخل ورقة ممزّقة مع زوم بطيء */
export const Print = ({src,x,y,w,h,k,z=0,rot=0,seed=1}:{src:string;x:number;y:number;w:number;h:number;k:number;z?:number;rot?:number;seed?:number}) => k<=0?null:(
  <div style={abs({left:x,top:y,width:w,height:h,opacity:Math.min(1,k*3),transform:`translateY(${(1-ease(Math.min(1,k)))*-50}px) rotate(${rot}deg)`,
    filter:'drop-shadow(0 20px 18px rgba(0,0,0,0.55))'})}>
    <div style={abs({inset:0,clipPath:torn(seed,1.4),overflow:'hidden'})}>
      <Img src={staticFile(src)} style={abs({inset:0,width:'100%',height:'100%',objectFit:'cover',transform:`scale(${1+z*0.08})`})}/>
    </div></div>);
/** قصّة شفافة (بلا خلفية) */
export const Cut = ({src,x,y,w,k,z=0,rot=0,origin='50% 100%'}:{src:string;x:number;y:number;w:number;k:number;z?:number;rot?:number;origin?:string}) => k<=0?null:(
  <Img src={staticFile(src)} style={abs({left:x,top:y,width:w,opacity:Math.min(1,k*3),transformOrigin:origin,
    transform:`translateY(${(1-ease(Math.min(1,k)))*40}px) scale(${lerp(0.9,1,back(Math.min(1,k)))*(1+z*0.06)}) rotate(${rot}deg)`,
    filter:'drop-shadow(0 18px 16px rgba(0,0,0,0.55))'})}/>);
/** يد حقيقية تضرب الختم (من تركي) — تنزل قبل الكلمة، تضغط عليها، وترتفع.
    rot: اتجاه الذراع بالدرجات (0 = الذراع لليمين · -90 = من فوق · 180 = من اليسار) — ⛔ لا تمرّ الذراع على نافذته */
export const HandStamp = ({t,x,y,hit,rot=0,w=620}:{t:number;x:number;y:number;hit:number;rot?:number;w?:number}) => {
  const a=p(t,hit-0.42,hit-0.04), out=p(t,hit+0.15,hit+0.5);
  if(a<=0||out>=1) return null;
  const h=w*442/668, ax=0.205*w, ay=0.55*h, r=rot*Math.PI/180;
  const off=(1-ease(a))*900+eio(out)*1000;
  const press=t<hit-0.04?lerp(1.14,1.05,ease(a)):(t<hit+0.1?0.97:lerp(0.97,1.1,p(t,hit+0.1,hit+0.4)));
  const sh=(press-0.95)*160;
  return <Img src={staticFile('k_hand_stamp.png')} style={abs({left:x-ax,top:y-ay,width:w,transformOrigin:`${ax}px ${ay}px`,
    transform:`translate(${Math.cos(r)*off}px,${Math.sin(r)*off}px) rotate(${rot}deg) scale(${press})`,filter:`drop-shadow(${sh*0.35}px ${sh}px ${sh*0.5}px rgba(0,0,0,0.5))`})}/>;
};
