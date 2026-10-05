/* مستطيلات عرض الفيديو والانتقال بينها.
   الجدول من project.json ← stage: [{s,e,m:"FULL"|"CARD"|"SIDE"|"NONE"|"OUTRO"}]
   والمستطيلات نفسها تُقرأ من project.json ← rects (تُشتق من حارس الوجه، لا تُخمَّن). */
import {eio, lerp} from './util';
import {STAGE, RECTS} from './theme';

export type Rect = {x:number;y:number;w:number;h:number;r:number};
const D: Record<string,Rect> = {
  FULL : {x:0,   y:0,   w:1080, h:1920, r:0},
  /* 940×612 عند y=545. حدّها الأسفل 1157، وأعلى الكابشن (سطران) ~1237.
     وحيّز الرسم فوقها 215…505، وفرجته عن الكرت 40 — نفس فرجة الكابشن، فيصير تناغم.
     المرساة (faceAnchor) يحسبها 12_face_guard.js scan من وجه المتحدث. */
  CARD : {x:70,  y:545, w:940,  h:612,  r:40},   /* هامش 70 عن الحافة — عمود أزرار انستقرام يبدأ 900 */
  /* نافذة جانبية — نسبتها 9:16 بالضبط (470/835 = 0.5629) فالفريم يدخل **بلا قص إطلاقاً**.
     تعطي الرسم عموداً 480×835 بدل شريط 290 — للمرآة والجرة والقياس. */
  SIDE : {x:566, y:330, w:470,  h:835,  r:34},
  OUTRO: {x:250, y:470, w:580,  h:580,  r:290},
  NONE : {x:540, y:960, w:0,    h:0,    r:0},
};
const M: Record<string,Rect> = {...D, ...(RECTS as Record<string,Rect>)};
/* h:1 = قطع فوري (القاعدة ٢٣): لا انتقال داخل النافذة ولا خارجها — للومضات وصور الضيوف */
const S = (STAGE as {s:number;e:number;m:string;h?:number}[]).map(x => ({s:x.s, e:x.e, m:M[x.m] || M.FULL, h:!!x.h}));
const TR = 0.42;                                   // مدة الانتقال بين مستطيلين

export const vrect = (t:number):Rect => {
  let i = S.findIndex(x => t >= x.s && t < x.e); if (i < 0) i = Math.max(0, S.map(x=>x.s<=t).lastIndexOf(true));
  let a = S[i].m, b = a, k = 1;
  const hard = S[i].h || (i > 0 && S[i-1].h);
  if (!hard && t < S[i].s + TR && i > 0) { a = S[i-1].m; b = S[i].m; k = eio((t - S[i].s)/TR); }
  return {x:lerp(a.x,b.x,k), y:lerp(a.y,b.y,k), w:lerp(a.w,b.w,k), h:lerp(a.h,b.h,k), r:lerp(a.r,b.r,k)};
};

/** ═══ الزوم ═══
   ① زوم تشويق بالبداية: دخول ناعم يثبت — لا قفزة (مزعج للعين).
   ② وأي لقطة ملء الشاشة أطول من ٨ ثوانٍ تاخذ انجرافاً بطيئاً جداً،
      عشان الوقت الطويل على وجهه ما يُقرأ ساكناً. ⛔ بلا زوم-أوت: يثبت ثم القطع يخفي رجوعه. */
export const HOOK_END = 4.60;
export const vzoom = (t:number):number => {
  /* الهوك: لو أول نافذة FULL وأطول من HOOK_END، الزوم يكمل بنعومة لآخرها (كان يقفز من 1.085 لـ1.02 عند 4.6 ث) */
  const h0 = S[0] && S[0].s <= 0.01 && S[0].m === M.FULL ? Math.max(HOOK_END, S[0].e) : HOOK_END;
  if (t < h0) return 1 + 0.085 * eio(Math.min(1, Math.max(0, (t - 0.25) / (h0 - 0.25))));
  const i = S.findIndex(x => t >= x.s && t < x.e);
  if (i < 0) return 1;
  const seg = S[i], dur = Math.min(seg.e, 1e5) - seg.s;
  if (seg.m !== M.FULL || dur < 8) return 1;
  return 1 + 0.05 * eio(Math.min(1, (t - seg.s) / dur));
};
