/* حارس الوجه — يمنع أي قص يلمس وجه المتحدث.
   يكتشف مكان الوجه بعيّنة من الفريمات (Vision بالماك · mediapipe بالويندوز)، ثم:
     scan  → يحسب الهامش المطلوب ويكتب faceAnchor المناسب بـtheme.json
     check → يفحص كل مستطيلات العرض بـSCENES ويخرج بالرمز 3 لو أي وجه انقص

   broll → يكتشف لقطات البي-رول (فريمات بلا وجه متحدث) ويطبع مداها

   الاستعمال:  node scripts/12_face_guard.js <work> scan|check|broll
*/
const path=require('path'), fs=require('fs'), cp=require('child_process');
const W=path.resolve(process.argv[2])+path.sep, MODE=process.argv[3]||'scan';
const TMP=W+'fg';
/* الفريمات: المحرّك الخفيف عنده vfr/ كاملة (30 بالثانية). ريموشن ما يحتاجها، فنطلّع عيّنة 2 بالثانية من cutz.mp4
   (بمسار اللون الصحيح — القاعدة ٢٨) مرة وحدة بـfg/vfr2. SPS = عيّنات بالثانية. */
let VFR=W+'vfr', SPS=30;
if(!fs.existsSync(VFR) || !fs.readdirSync(VFR).some(f=>f.endsWith('.jpg'))){
  VFR=TMP+'/vfr2'; SPS=2;
  if(!fs.existsSync(VFR) || !fs.readdirSync(VFR).some(f=>f.endsWith('.jpg'))){
    if(!fs.existsSync(W+'cutz.mp4')){ console.log('❌ ما فيه cutz.mp4 — شغّل 03_cut_zoom.py أول'); process.exit(2); }
    fs.mkdirSync(VFR,{recursive:true});
    cp.execSync('ffmpeg -v error -i '+JSON.stringify(W+'cutz.mp4')+' -vf "fps=2,format=rgb24" -pix_fmt yuvj444p -q:v 3 '+JSON.stringify(VFR+'/%05d.jpg'),{stdio:'pipe'});
  }
}
let PM=null;   /* أمر كاشف الوجه: مكتبة أبل بالماك · mediapipe بغيره (_paths.personmask) */
const M_TOP=0.14, M_BOT=0.06;   /* هامش أمان: فوق الرأس أكثر من تحت الذقن.
   قص الشعر يبان فوراً، وقص الرقبة ما ينتبه له أحد — فنعطي الأعلى ضعف الأسفل. */

function ensureBin(){
  if(PM) return;
  fs.mkdirSync(TMP,{recursive:true});
  PM=require('./_paths').personmask(TMP);
  if(!PM){ console.log('⚠️ ما قدرت أجهّز كاشف الوجه — بالماك يحتاج أدوات Xcode (xcode-select --install)'); process.exit(0); }
}
/* عيّنة فريمات موزّعة على الفيديو */
function sample(n){
  const all=fs.readdirSync(VFR).filter(f=>f.endsWith('.jpg')).sort();
  if(!all.length){ console.log('❌ ما فيه مجلد vfr — استخرج الفريمات أول'); process.exit(2); }
  const step=Math.max(1,Math.floor(all.length/n)), out=[];
  for(let i=0;i<all.length;i+=step) out.push(all[i]);
  return out;
}
function detect(){
  ensureBin();
  const dir=TMP+'/in', outd=TMP+'/out';
  fs.rmSync(dir,{recursive:true,force:true}); fs.mkdirSync(dir,{recursive:true});
  const files=sample(40);
  for(const f of files) fs.copyFileSync(VFR+'/'+f, dir+'/'+f);
  cp.execSync(PM+' '+JSON.stringify(dir)+' '+JSON.stringify(outd)+' fast 2',{stdio:'pipe'});
  const meta=JSON.parse(fs.readFileSync(outd+'/meta.json','utf8'));
  const faces=[];
  for(const row of meta){
    const b=row.face;                       /* الصندوق متداخل تحت مفتاح face */
    if(!b||typeof b.y!=='number'||typeof b.h!=='number') continue;
    faces.push({top:b.y, bot:b.y+b.h, idx:files.indexOf(row.f)});
  }
  fs.rmSync(dir,{recursive:true,force:true}); fs.rmSync(outd,{recursive:true,force:true});
  return faces;
}
/* ═══ كشف البي-رول: الفريمات اللي ما فيها وجه المتحدث ═══
   صنّاع كثير يدمجون لقطاتهم وصورهم بالمصدر. القص العادي يبترها،
   فلازم نعرف مداها ونعرضها كاملة (R_FIT) أو ملء الشاشة. */
if (MODE === 'broll') {
  ensureBin();
  const all = fs.readdirSync(VFR).filter(f => f.endsWith('.jpg')).sort();
  const STEP = Math.max(1, Math.round(SPS/2));      /* عيّنة كل نصف ثانية */
  const dir = TMP + '/bin', outd = TMP + '/bout';
  fs.rmSync(dir, {recursive:true, force:true}); fs.mkdirSync(dir, {recursive:true});
  const picked = [];
  for (let i = 0; i < all.length; i += STEP) { picked.push(all[i]); fs.copyFileSync(VFR+'/'+all[i], dir+'/'+all[i]); }
  cp.execSync(PM+' '+JSON.stringify(dir)+' '+JSON.stringify(outd)+' fast 2', {stdio:'pipe'});
  const meta = JSON.parse(fs.readFileSync(outd+'/meta.json','utf8'));
  const byFile = {}; for (const r of meta) byFile[r.f] = r.face || null;
  /* الوجه "متحدث" إذا كان كبيراً وقريب من مركز الكادر أفقياً */
  const isHead = b => b && b.h > 260 && Math.abs((b.x + b.w/2) - 540) < 300;
  const flags = picked.map(f => isHead(byFile[f]));
  const segs = []; let st = null;
  flags.forEach((ok, i) => {
    const t = (i * STEP) / SPS;
    if (!ok && st === null) st = t;
    if (ok && st !== null) { segs.push([st, t]); st = null; }
  });
  if (st !== null) segs.push([st, (all.length) / SPS]);
  fs.rmSync(dir,{recursive:true,force:true}); fs.rmSync(outd,{recursive:true,force:true});
  const keep = segs.filter(([a,b]) => b - a >= 0.7);
  if (!keep.length) console.log('ما لقيت لقطات بي-رول — الفيديو كله حديث للكاميرا.');
  else {
    console.log('لقطات البي-رول (اعرضها كاملة — لا تقصّها):');
    for (const [a,b] of keep) console.log(`  ${a.toFixed(2)} → ${b.toFixed(2)}   (${(b-a).toFixed(1)}ث)`);
  }
  fs.writeFileSync(W + 'broll.json', JSON.stringify({ranges: keep}, null, 1));
}

if (MODE === 'broll') process.exit(0);

const faces=detect();
if(!faces.length){ console.log('⚠️ ما لقيت وجهاً بالعيّنة — تخطّيت الفحص'); process.exit(0); }
const TOP=Math.min(...faces.map(f=>f.top)), BOT=Math.max(...faces.map(f=>f.bot));
console.log(`الوجه بالفيديو المصدر: من ${Math.round(TOP)} إلى ${Math.round(BOT)} (من 1920)`);


/* النوافذ: المحرّك الخفيف يعرّفها بـcompose.html، وريموشن بـstage.ts (CARD · SIDE) + rects.json المخصّصة */
function getRects(){
  if(fs.existsSync(W+'compose.html')){
    const src=fs.readFileSync(W+'compose.html','utf8');
    return [...src.matchAll(/const (R_[A-Z]+)\s*=\s*\{x:(-?\d+),y:(-?\d+),w:(\d+),h:(\d+)/g)]
      .map(m=>({n:m[1],w:+m[4],h:+m[5]})).filter(r=>r.w>2&&r.h>2);
  }
  const R={CARD:{w:940,h:612}, SIDE:{w:470,h:835}};
  if(fs.existsSync(W+'rects.json')) Object.assign(R, JSON.parse(fs.readFileSync(W+'rects.json','utf8')));
  return Object.entries(R).filter(([n,r])=>r.w>2&&r.h>2&&n!=='FULL'&&n!=='NONE'&&n!=='OUTRO').map(([n,r])=>({n,w:r.w,h:r.h}));
}
const SH=1920, SW=1080;
/* أين يقع الوجه داخل نافذة عرضها w وارتفاعها h، بمرساة a */
function faceIn(w,h,a){
  const sc=Math.max(w/SW,h/SH), ch=h/sc, sy=(SH-ch)*a;
  return {top:(TOP-sy)*sc, bot:(BOT-sy)*sc, h};
}
function bestAnchor(w,h){
  let best=null;
  for(let a=0;a<=1.0001;a+=0.005){
    const f=faceIn(w,h,a);
    /* نوازن بالنسبة للمطلوب: الأعلى مقسوم على نصيبه والأسفل على نصيبه */
    const score=Math.min(f.top/M_TOP, (h-f.bot)/M_BOT);
    if(!best||score>best.score) best={a:+a.toFixed(3), score, top:f.top, bot:h-f.bot};
  }
  return best;
}
if(MODE==='scan'){
  const tp=W+'theme.json', th=JSON.parse(fs.readFileSync(tp,'utf8'));
  /* نضبط المرساة على أضيق نافذة مستعملة — تنفع الباقي تلقائياً */
  const rects=getRects();
  let worst=null;
  for(const r of rects){
    const b=bestAnchor(r.w,r.h);
    console.log(`  ${r.n} ${r.w}×${r.h} → مرساة ${b.a} · فوق الشعر ${Math.round(b.top)} · تحت الذقن ${Math.round(b.bot)}`);
    if(!worst||b.score<worst.score) worst={...b,r};
  }
  th.faceAnchor=worst.a;
  fs.writeFileSync(tp,JSON.stringify(th,null,1));
  console.log(`\n✅ faceAnchor=${worst.a} — الأحرج ${worst.r.n}: فوق ${Math.round(worst.top)} · تحت ${Math.round(worst.bot)}`);
  /* حدّ الرسم فوق رأسه بصيغة FULL (القاعدة ٨٢): أعلى وجهه ناقص 158 — يختلف حسب قربه من الكاميرا */
  const sp=W+'safe.json', sj=fs.existsSync(sp)?JSON.parse(fs.readFileSync(sp,'utf8')):{};
  sj.fullFloor=Math.max(260, Math.round(TOP-158));
  fs.writeFileSync(sp,JSON.stringify(sj,null,1));
  console.log(`✅ حدّ الرسم فوق رأسه (fullFloor) = ${sj.fullFloor} → safe.json`);
  if(worst.top < worst.r.h*M_TOP)
    console.log(`⚠️ الهامش فوق الشعر أقل من ${Math.round(M_TOP*100)}٪ — صغّر ارتفاع ${worst.r.n} أو زد عرضها`);
}else{
  const th=JSON.parse(fs.readFileSync(W+'theme.json','utf8'));
  const a=typeof th.faceAnchor==='number'?th.faceAnchor:0.30;
  const rects=getRects();
  let bad=0;
  for(const r of rects){
    const f=faceIn(r.w,r.h,a);
    const top=f.top, bot=r.h-f.bot;
    const nt=r.h*M_TOP, nb=r.h*M_BOT;
    const ok=top>=nt && bot>=nb;
    console.log(`${ok?'✅':'❌'} ${r.n} ${r.w}×${r.h} · فوق الشعر ${Math.round(top)}/${Math.round(nt)} · تحت الذقن ${Math.round(bot)}/${Math.round(nb)}`);
    if(!ok) bad++;
  }
  console.log(bad? '\n⛔ وجهه ينقص بنافذة أو أكثر — عدّل قبل الرسم.' : '\n✅ وجهه كامل بكل النوافذ.');
  process.exit(bad?3:0);
}
