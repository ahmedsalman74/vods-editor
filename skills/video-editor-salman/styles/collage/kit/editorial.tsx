/* ═══════ العُدّة الوثائقية (Documentary) — وثائق حقيقية · تظليل · قصاصات · يد تكتب ═══════
   الدليل: styles/collage/DOCUMENTARY.md
   import {EdFonts, SER, RQ, Paper, Shot, Cut, Obj, Glass, Mark, BigNum, BlurNum, Slip, Scrawl, PenHand, InkCircle, InkLine, Tick, DocPage, DocMark} from './editorial';
   ⛔ Scrawl/RQ يحتاج ArefRuqaa-Bold.ttf بـpublic (ينسخ تلقائياً من assets) — الخط يُحمَّل هنا بـdelayRender. */
import React from 'react';
import {Img, staticFile, delayRender, continueRender} from 'remotion';
import {T, WGT, FONT_DISPLAY} from './theme';
import {eio} from './util';
import {p, ease, back, lerp, F, abs} from './vox';

/* ألوان العُدّة من هويته: التمييز (CLAY) والخلفية (DARK) منه، والباقي ألوان ورق وحبر حقيقية محايدة */
export const ED = {CLAY:T.acc, CREAM:'#F4F0E6', DARK:T.bg, INK:'#16171A', SAND:'#E9E0D2', LIGHT:'#ECEAE4', INKRED:'#C42A1E', GOLD:T.warm};

/* خط الرقعة (Aref Ruqaa · OFL) — كتابة اليد بالقلم */
const _rq = delayRender('ruqaa');
if (typeof FontFace !== 'undefined') {
  new FontFace('Ruqaa', `url(${staticFile('ArefRuqaa-Bold.ttf')})`).load()
    .then(f => { (document as any).fonts.add(f); continueRender(_rq); }).catch(() => continueRender(_rq));
} else continueRender(_rq);
/** خط العناوين (theme.fontDisplay — لو ما حدّده يستعمل خطه الأساسي). حطّه مرة داخل أي مشهد يستعمل SER */
export const EdFonts = () => null;
export const SER = (w:number,px:number):React.CSSProperties => ({fontFamily:FONT_DISPLAY,fontWeight:w,fontSize:px});
export const RQ = (px:number):React.CSSProperties => ({fontFamily:'Ruqaa',fontWeight:700,fontSize:px});

/* ═══ الخلفيات (خلفية وحدة للمقطع كله — DOCUMENTARY.md): صورة برّا شفافة · رملي مكرمش · فاتح · داكن مكرمش بلونه · ورق مربعات ═══ */
const Grain = ({o=.3,dark=false}:{o?:number;dark?:boolean}) =>
  <svg width={1080} height={1920} style={abs({left:0,top:0,opacity:o,mixBlendMode:dark?'screen':'multiply'})}><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 .5 0"/></filter><rect width="1080" height="1920" filter="url(#grain)"/></svg>;
export const Paper = ({t,A,B,kind,photo,po=0.16}:{t:number;A:number;B:number;kind:'light'|'sand'|'dark'|'grid';photo?:string;po?:number}) => {
  const dark=kind==='dark', z=1+p(t,A,B)*0.03;
  return (<>
    <div style={abs({inset:0,background:dark?ED.DARK:kind==='light'?ED.LIGHT:ED.SAND})}/>
    {kind!=='light' && <Img src={staticFile('crumple_gray.png')} style={abs({inset:0,width:1080,height:1920,objectFit:'cover',mixBlendMode:dark?'soft-light':'multiply',opacity:dark?0.9:0.5,transform:`scale(${z})`})}/>}
    {kind==='grid' && <div style={abs({inset:-40,transform:`scale(${z})`,backgroundImage:'linear-gradient(rgba(40,52,70,0.20) 2px,transparent 2px),linear-gradient(90deg,rgba(40,52,70,0.20) 2px,transparent 2px)',backgroundSize:'64px 64px'})}/>}
    {photo && <Img src={staticFile(photo)} style={abs({left:-40,top:-40,width:1160,height:2000,objectFit:'cover',filter:'grayscale(1) contrast(1.1)',opacity:po,mixBlendMode:dark?'screen':'multiply',transform:`scale(${1.04+p(t,A,B)*0.05})`})}/>}
    <div style={abs({inset:0,background:dark?'radial-gradient(ellipse at 50% 34%, rgba(255,235,210,0.10) 0%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.5) 100%)'
      :'radial-gradient(ellipse at 50% 36%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 55%, rgba(0,0,0,0.2) 100%)'})}/>
    <Grain o={dark?.2:.32} dark={dark}/>
  </>); };

/** صورة ملء الشاشة بدفعة كاميرا بطيئة (9:16 مولّدة أو من برّا) */
export const Shot = ({src,t,A,B,pos='50% 50%',z0=1.02,z1=1.08,style}:{src:string;t:number;A:number;B:number;pos?:string;z0?:number;z1?:number;style?:React.CSSProperties}) =>
  <Img src={staticFile(src)} style={abs({left:0,top:0,width:1080,height:1920,objectFit:'cover',objectPosition:pos,transform:`scale(${lerp(z0,z1,p(t,A,B))})`,...style})}/>;
/** قصاصة على ورق — ظلّ ورقي لا توهّج (⛔ لا تطفو على الخلفية الداكنة بتوهّج — تبان رخيصة) */
export const Cut = ({src,x,y,w,k,rot=0,gray=0,dim=0,style}:{src:string;x:number;y:number;w:number;k:number;rot?:number;gray?:number;dim?:number;style?:React.CSSProperties}) => k<=0?null:(
  <Img src={staticFile(src)} style={abs({left:x,top:y,width:w,opacity:Math.min(1,k*3)*(1-dim*0.55),transformOrigin:'50% 80%',
    transform:`rotate(${rot}deg) scale(${lerp(.9,1,back(Math.min(1,k)))})`,filter:`grayscale(${gray}) drop-shadow(0 10px 12px rgba(0,0,0,0.28))`,...style})}/>);
/** غرض فوق رأسه — lit: ينوّر ويكبر (1) / ينطفي ويصغر (0) */
export const Obj = ({src,x,y,w,k,lit=1,rot=0,gray=0,origin='50% 50%'}:{src:string;x:number;y:number;w:number;k:number;lit?:number;rot?:number;gray?:number;origin?:string}) => k<=0?null:(
  <Img src={staticFile(src)} style={abs({left:x,top:y,width:w,opacity:Math.min(1,k*3),transformOrigin:origin,
    transform:`rotate(${rot}deg) scale(${lerp(.86,1,back(Math.min(1,k)))*lerp(.72,1.08,lit)})`,
    filter:`grayscale(${Math.max(gray,1-lit)}) brightness(${lerp(.38,1.06,lit)}) drop-shadow(0 ${lerp(6,18,lit)}px ${lerp(8,24,lit)}px rgba(0,0,0,${lerp(.35,.6,lit)}))`})}/>);
/** لوح زجاجي للرسوم البيانية فوق وجهه */
export const Glass = ({x,y,w,h,k,children}:{x:number;y:number;w:number;h:number;k:number;children?:React.ReactNode}) => k<=0?null:(
  <div style={abs({left:x,top:y,width:w,height:h,borderRadius:26,background:'rgba(18,19,22,0.58)',backdropFilter:'blur(14px)',
    border:'1.5px solid rgba(255,255,255,0.16)',boxShadow:'0 18px 34px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)',
    opacity:Math.min(1,k*3),transform:`translateY(${(1-ease(Math.min(1,k)))*24}px)`,overflow:'hidden'})}>{children}</div>);
/** تظليل أصفر يمشي على النص */
export const Mark = ({x,y,w,h,k,a=0.72}:{x:number;y:number;w:number;h:number;k:number;a?:number}) =>
  <div style={abs({left:x,top:y,width:w*Math.max(0,Math.min(1,k)),height:h,background:`rgba(242,201,76,${a})`,mixBlendMode:'multiply'})}/>;
/** رقم ضخم بإزاحة لونية (مرجع Pinterest الأول) */
export const BigNum = ({children,x=40,y,size,k,col=ED.INK}:{children:React.ReactNode;x?:number;y:number;size:number;k:number;col?:string}) => k<=0?null:(
  <div dir="ltr" style={abs({left:x,top:y,width:1000,textAlign:'center',...SER(900,size),lineHeight:1,color:col,opacity:Math.min(1,k*3),
    textShadow:`${-4*(1-k)-2}px 0 0 rgba(200,40,40,0.35), ${4*(1-k)+2}px 0 0 rgba(40,160,200,0.35)`,transform:`scale(${lerp(1.15,1,ease(Math.min(1,k)))})`})}>{children}</div>);
/** رقم ضخم يدخل بغباش حركة — للسنوات والأرقام الكبيرة */
export const BlurNum = ({children,y,size,k,col=ED.INK}:{children:React.ReactNode;y:number;size:number;k:number;col?:string}) => k<=0?null:(
  <div dir="ltr" style={abs({left:0,right:0,top:y,textAlign:'center',...SER(900,size),lineHeight:1,color:col,opacity:Math.min(1,k*2.5),
    filter:`blur(${(1-ease(Math.min(1,k)))*14}px)`,transform:`translateX(${(1-ease(Math.min(1,k)))*-120}px) scaleX(${lerp(1.25,1,ease(Math.min(1,k)))})`,
    textShadow:`${-3*(1-k)-2}px 0 0 rgba(200,40,40,0.3), ${3*(1-k)+2}px 0 0 rgba(40,160,200,0.3)`})}>{children}</div>);
/** قصاصة ورق ممزّقة (ورق مصوّر لا مسطّح) */
export const Slip = ({x,y,w,k,rot=0,children,size=38,col=ED.INK}:{x:number;y:number;w:number;k:number;rot?:number;children:React.ReactNode;size?:number;col?:string}) => k<=0?null:(
  <div style={abs({left:x,top:y,width:w,opacity:Math.min(1,k*3),transform:`rotate(${rot}deg) translateY(${(1-ease(Math.min(1,k)))*20}px)`,filter:'drop-shadow(0 8px 10px rgba(0,0,0,0.3))'})}>
    <div style={{position:'relative',padding:'16px 22px',backgroundImage:`url(${staticFile('paper_old.png')})`,backgroundSize:'cover',
      clipPath:'polygon(0 6%,4% 0,18% 5%,33% 0,52% 4%,70% 0,86% 5%,100% 1%,99% 92%,95% 100%,78% 95%,60% 100%,41% 94%,22% 100%,6% 95%,0 100%)'}}>
      <div dir="rtl" style={{textAlign:'center',...F(WGT.black,size),color:col,lineHeight:1.25}}>{children}</div></div>
  </div>);
/** كتابة يد بالرقعة تنكتب من اليمين لليسار. رأس الكتابة (مكان القلم) = x + w×(1−k) */
export const Scrawl = ({text,x,y,w,size,k,col=ED.INKRED,rot=-3}:{text:string;x:number;y:number;w:number;size:number;k:number;col?:string;rot?:number}) => k<=0?null:(
  <div dir="rtl" style={abs({left:x,top:y,width:w,textAlign:'right',...RQ(size),lineHeight:1.2,color:col,whiteSpace:'nowrap',
    transform:`rotate(${rot}deg)`,clipPath:`inset(-20% 0 -20% ${(1-Math.min(1,k))*100}%)`})}>{text}</div>);
/** يد بقلم أحمر — (x,y) = رأس القلم بالضبط. معكوسة ومدوّرة: الذراع يدخل من تحت يسار، والقلم يسبق الكتابة العربية.
    ⛔ لا تدخلها من اليمين فوق الأسطر — تغطي الكتابة وتبان غلط. رأس القلم بالصورة (7,743) من 1186×748. */
export const PenHand = ({x,y,k}:{x:number;y:number;k:number}) => k<=0?null:(
  <Img src={staticFile('k_hand_pen.png')} style={abs({left:x-4.5,top:y-476,width:760,transform:'rotate(-88deg) scaleX(-1)',transformOrigin:'4.5px 476px',
    opacity:Math.min(1,k*3),filter:'drop-shadow(0 18px 18px rgba(0,0,0,0.35))'})}/>);
/** دائرة قلم مرسومة باليد */
export const InkCircle = ({cx,cy,rx,ry,k,col=ED.INKRED,w=6}:{cx:number;cy:number;rx:number;ry:number;k:number;col?:string;w?:number}) => k<=0?null:(
  <svg width={1080} height={1920} style={abs({left:0,top:0})}>
    <path d={`M${cx+rx},${cy-6} C${cx+rx},${cy-ry-8} ${cx-rx-10},${cy-ry} ${cx-rx},${cy+4} C${cx-rx+6},${cy+ry+6} ${cx+rx+12},${cy+ry-2} ${cx+rx-4},${cy-ry*0.6}`}
      fill="none" stroke={col} strokeWidth={w} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1-eio(Math.min(1,k))} opacity={.9}/>
  </svg>);
/** خط قلم (تحته خط / شطب) يُرسم من اليمين */
export const InkLine = ({x1,x2,y,k,col=ED.INKRED,w=6}:{x1:number;x2:number;y:number;k:number;col?:string;w?:number}) => k<=0?null:(
  <svg width={1080} height={1920} style={abs({left:0,top:0})}>
    <path d={`M${x2},${y} Q${(x1+x2)/2},${y+9} ${x1},${y-3}`} fill="none" stroke={col} strokeWidth={w} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1-eio(Math.min(1,k))} opacity={.9}/>
  </svg>);
export const Tick = ({x,y,s,k,col=ED.CLAY}:{x:number;y:number;s:number;k:number;col?:string}) => k<=0?null:(
  <svg width={s} height={s} viewBox="0 0 100 100" style={abs({left:x,top:y,filter:'drop-shadow(0 4px 8px rgba(0,0,0,0.5))'})}>
    <path d="M12,55 L40,82 L90,16" fill="none" stroke={col} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1-eio(Math.min(1,k))}/>
  </svg>);

/* ═══ وثيقة حقيقية (صفحة PDF) بتظليل بإحداثيات pdftotext ═══
   pdftoppm -r 300 -f 1 -l 1 -png doc.pdf page  ·  pdftotext -bbox -f 1 -l 1 doc.pdf box.html  (الإحداثيات بالـpt)
   srcW = عرض الصورة بالبكسل · dpi = دقة الرندر (px = pt × dpi/72) */
export const DocPage = ({src,srcW,srcH,x,y,w,children,style}:{src:string;srcW:number;srcH:number;x:number;y:number;w:number;children?:React.ReactNode;style?:React.CSSProperties}) => {
  const s=w/srcW;
  return (<div style={abs({left:x,top:y,width:w,height:srcH*s,...style})}>
    <Img src={staticFile(src)} style={{width:w,height:srcH*s,filter:'grayscale(1) contrast(1.05)'}}/>{children}</div>); };
export const DocMark = ({w,srcW,dpi=300,x0,x1,y0,y1,k}:{w:number;srcW:number;dpi?:number;x0:number;x1:number;y0:number;y1:number;k:number}) => {
  const f=(dpi/72)*w/srcW; return <Mark x={x0*f-3} y={y0*f-2} w={(x1-x0)*f+6} h={(y1-y0)*f+4} k={k}/>; };
