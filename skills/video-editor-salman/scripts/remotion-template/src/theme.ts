/* كل القيم تجي من project.json — يبنيه 04b_remotion.sh من theme.json و caps.json.
   ⛔ لا تكتب لوناً ثابتاً هني. */
import P from './project.json';

/* ⛔⛔ ما فيه لون ولا خط ولا مقاس افتراضي بهذا الملف — نهائياً.
   القالب العام كان يحمل قيماً افتراضية (كريمي · Cairo · شارة أعلى الوسط · شريط تقدّم ·
   كابشن ٣ أسطر · كرت نهاية)، فورثها المقطع وطلع «كأننا ما عدّلنا».
   المصدر الوحيد هو theme.json الخاص بصانع المحتوى. الناقص **يوقف البناء** ولا يُستبدل بشي. */
const need = (k: string): string => {
  const v = (P.theme as any)[k];
  if (!v) throw new Error(`⛔ theme.json ناقص المفتاح «${k}» — القالب ما فيه بديل افتراضي عمداً.`);
  return v as string;
};
export const T = {
  bg: need('bg'), ink: need('ink'), acc: need('acc'), font: need('font'), handle: need('handle'),
  clay: (P.theme as any).clay || need('acc'),
  mut:  need('mut'),  sky:  need('sky'),
  warm: need('warm'), cream:need('cream'), sand: need('sand'),
};
export const FPS   = 30;
export const VEND  = P.total;              // نهاية كلام الفيديو
export const OUTRO = P.outro;              // مدة كرت النهاية
export const DUR_F = Math.round((VEND + OUTRO) * FPS);
export const HAS_LOGO: boolean = (P as any).logo !== false;
export const HAS_SFX = !!P.sfx;
export const OUTRO_COPY = P.outro_copy || {recap:[]};
export const STAGE = P.stage || [{s:0,e:1e9,m:'FULL'}];
/** capmove.json بمجلد الشغل: [[من, إلى, bottom]] — يرفع/ينزّل الكابشن مؤقتاً لما يغطي شي مهم بلقطة (بلا انتقال) */
export const CAPMOVE: number[][] = ((P as any).capMove || []) as number[][];
/* "guides": true بـproject.json → تظهر مناطق انستقرام الحمراء بالاستوديو (اطفيها قبل الرندر) */
export const FONT_LOCAL: boolean = !!(P.theme as any).fontLocal;
/** خط العناوين الكبيرة (اختياري) — لو ما حدّده، نفس خطه الأساسي */
export const FONT_DISPLAY: string = (P.theme as any).fontDisplay || T.font;
/** أوزان موجودة فعلاً بالعائلة — لا تطلب غيرها (القاعدة ١٤) */
export const WGT = {light:300, reg:400, med:500, bold:700, black:900} as const;
export const CAP = {                       /* مقاسات الكابشن من ملف هويته — لا أرقام محفورة */
  size:   Number((P.theme as any).captionSize),
  weight: Number((P.theme as any).captionWeight),
  maxW:   Number((P.theme as any).captionMaxW),
  /* حافة الكابشن السفلى (y). اختياري لمقاطع بتقسيم خاص (شاشة مقسومة فوق/تحت) — بدونه 1460 المعتمدة */
  bottom: Number((P.theme as any).captionBottom ?? 1460),
  /* captionStyle بملف الهوية: "slim" = سطر واحد بخلفية شفافة مغبّشة (يراعي منطقة أزرار انستقرام)
     · الافتراضي "card" = كرت داكن. */
  style:  String((P.theme as any).captionStyle ?? 'card'),
  lines:  Number((P.theme as any).maxLines ?? 2),
};
if (!CAP.size || !CAP.weight || !CAP.maxW)
  throw new Error('⛔ theme.json ناقص captionSize/captionWeight/captionMaxW');
export const RECTS = (P as any).rects || {};
/** من أين يُقصّ وجهه داخل كرت مصغّر — من theme.json لا تخمين */
export const FACE_ANCHOR: number = (P.theme as any).faceAnchor ?? 0.30;
export const GUIDES = !!(P as any).guides;
