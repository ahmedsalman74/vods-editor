/* ═══ الكلام يمرّ ورا الشخص (كشيدة عربية) ═══
   node 11_behind_text.js <work> plan            → يرشّح الجُمل المناسبة
   node 11_behind_text.js <work> build 1 9       → يجهّز قصّ الشخص لهالجُمل ويكتب behind.json
   node 11_behind_text.js <work> build 2:6-8     → كلمات بعينها داخل جملة
   node 11_behind_text.js <work> off             → يلغي التأثير

   شلون يشتغل: نقصّ جسم المتحدث بكل فريم (Vision بالماك · mediapipe بالويندوز)،
   نرسم الكلمة ممدودة بالكشيدة تحته، ثم نرجّع جسمه فوقها — فالكشيدة وحدها تمرّ ورا الراس
   والحروف تبقى بارزة على الجانبين.  يحتاج: ffmpeg + (ماك: أدوات Xcode · ويندوز: mediapipe). */
const path=require('path'), fs=require('fs'), cp=require('child_process');
const W=path.resolve(process.argv[2])+path.sep, MODE=process.argv[3]||'plan';
const SC=path.dirname(path.resolve(process.argv[1]))+path.sep;
const caps=JSON.parse(fs.readFileSync(W+'caps.json','utf8'));
const FPS=30, MAXW=4, MINDUR=0.85;

const words=c=>c.w.map(w=>w.t).join(' ');
if(MODE==='off'){ try{fs.unlinkSync(W+'behind.json');}catch(e){} console.log('انلغى التأثير.'); process.exit(0); }

if(MODE==='plan'){
  console.log('الجُمل اللي تنفع يمرّ كلامها ورا الشخص (قصيرة وواضحة):');
  let n=0;
  caps.cards.forEach((c,i)=>{
    const dur=c.w[c.w.length-1].e-c.w[0].s;
    if(c.w.length>MAXW||dur<MINDUR) return;
    n++;
    console.log(`  ${i+1}  [${c.s.toFixed(2)}]  ${words(c)}   (${c.w.length} كلمات · ${dur.toFixed(2)}ث)${i===0?'  ← الهوك، أقواها':''}`);
  });
  if(!n) console.log('  ما فيه جملة قصيرة — اختر كلمات بعينها: build 2:6-8 (الكلمات 6→8 من الجملة 2)');
  console.log('\n⚠️ اختر وحدة أو ثنتين بالكثير — لو تكرر بكل جملة يفقد أثره.');
  console.log('ثم: node 11_behind_text.js <work> build <أرقام الجُمل>');
  process.exit(0);
}

if(MODE!=='build'){ console.log('الأوامر: plan · build · off'); process.exit(2); }
/* «2» = الجملة كاملة · «2:6-8» = الكلمات 6→8 داخل الجملة 2 */
const pick=process.argv.slice(4).map(a=>{
  const m=String(a).match(/^(\d+)(?::(\d+)-(\d+))?$/); if(!m) return null;
  const i=parseInt(m[1],10)-1; if(i<0||i>=caps.cards.length) return null;
  const n=caps.cards[i].w.length;
  return {i, from:m[2]?Math.max(0,parseInt(m[2],10)-1):0, to:m[3]?Math.min(n-1,parseInt(m[3],10)-1):n-1};
}).filter(Boolean);
if(!pick.length){ console.log('عطني أرقام الجُمل: build 1 9   أو   build 2:6-8'); process.exit(2); }
if(!fs.existsSync(W+'vfr')){ console.log('❌ ما فيه مجلد vfr — استخرج الفريمات أول'); process.exit(3); }

/* 1) بناء أداة القصّ مرة وحدة */
let PM=null;
fs.mkdirSync(W+'bt/src',{recursive:true}); fs.mkdirSync(W+'bt/mask',{recursive:true}); fs.mkdirSync(W+'bt/person',{recursive:true});
PM=require('./_paths').personmask(W+'bt');
if(!PM){ console.log('❌ ما قدرت أجهّز أداة القصّ — بالماك تحتاج أدوات Xcode: xcode-select --install'); process.exit(4); }

/* 2) الفريمات المطلوبة فقط (مو الفيديو كله) */
const NVF=fs.readdirSync(W+'vfr').filter(f=>f.endsWith('.jpg')).length;
const lines=[], ranges=[];
for(const sel of pick){
  const c=caps.cards[sel.i];
  const ws=c.w.slice(sel.from, sel.to+1);
  const a=Math.max(0,ws[0].s-0.20), b=Math.min(caps.total,ws[ws.length-1].e+0.45);
  const f0=Math.max(1,Math.floor(a*FPS)+1), f1=Math.min(NVF,Math.ceil(b*FPS)+1);
  ranges.push([f0,f1]);
  lines.push({card:sel.i, s:a, e:b, words:ws.map(w=>({t:w.t,s:w.s,e:w.e}))});
}
let copied=0;
for(const [f0,f1] of ranges) for(let f=f0;f<=f1;f++){
  const id=String(f).padStart(5,'0');
  if(fs.existsSync(W+'vfr/'+id+'.jpg')){ fs.copyFileSync(W+'vfr/'+id+'.jpg', W+'bt/src/'+id+'.jpg'); copied++; }
}
console.log('فريمات التأثير:',copied,'— أقصّ الشخص فيها…');

/* 3) القصّ + بيانات الوجه */
cp.execSync(PM+' '+JSON.stringify(W+'bt/src')+' '+JSON.stringify(W+'bt/mask')+' accurate 2.5',{stdio:'inherit'});

/* 4) دمج القناع كشفافية → صورة الشخص وحده (كل مدى على حدة) */
for(const [f0,f1] of ranges){
  cp.execSync('ffmpeg -v error -start_number '+f0+' -i '+JSON.stringify(W+'bt/src/%05d.jpg')+
    ' -start_number '+f0+' -i '+JSON.stringify(W+'bt/mask/%05d.png')+
    ' -frames:v '+(f1-f0+1)+
    ' -filter_complex "[1:v]format=gray,scale=1080:1920[a];[0:v][a]alphamerge,format=rgba"'+
    ' -start_number '+f0+' -y '+JSON.stringify(W+'bt/person/%05d.png'),{stdio:'pipe'});
}

const meta=JSON.parse(fs.readFileSync(W+'bt/mask/meta.json','utf8'));
const faces={};
for(const m of meta) if(m.face) faces[parseInt(m.f,10)]=m.face;
fs.writeFileSync(W+'behind.json',JSON.stringify({lines,ranges,faces},null,1));
console.log('✅ behind.json جاهز —',lines.length,'جملة يمرّ كلامها ورا الشخص.');
console.log('   الحين ارسم: node 04_render_frames.js '+W+' all --force');
