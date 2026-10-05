/* فاحص تداخل النصوص — يسجّل صندوق كل نص يُرسم ويبحث عن تقاطعات.
   الفاحصان الآخران يمسكان الرسم فوق الوجه وداخل الكابشن، وما يمسكان نصاً فوق نص.
   الاستعمال: node scripts/08c_text_collide.js <work> [خطوة] · يخرج بالرمز 3 لو فيه تداخل */
const path=require('path'), fs=require('fs');
const W=path.resolve(process.argv[2])+path.sep;
const STEP=parseFloat(process.argv[3]||'0.3');
const OVERLAP=0.18;   /* نسبة التداخل المسموحة من مساحة الأصغر */
const MINGAP=22;      /* أقل مسافة رأسية بين نصين متحاذيين أفقياً — أقل منها تُقرأ ملتصقة */
function resolvePuppeteer(){
  for(const p of [process.env.PUPPETEER_PATH,'puppeteer-core',
      path.join(require('./_paths').HOME,'tools','node_modules','puppeteer-core')]){
    if(!p) continue; try{ return require(p); }catch(e){}
  }
  throw new Error('ما لقيت أداة الرسم — شغّل scripts/00_setup.sh --install');
}
const CHROME=require('./_paths').chrome();
async function ensureFont(p,FF){
  await p.evaluate(f=>Promise.all([document.fonts.load('700 100px '+f),
    document.fonts.load('400 40px '+f)]).then(()=>document.fonts.ready),FF);
  for(let i=0;i<40;i++){
    const ok=await p.evaluate(f=>{const c=document.createElement('canvas').getContext('2d');
      const w=fam=>{c.font='700 80px '+fam;return c.measureText('نصّ تجريبي ABC').width;};
      return w(f+', monospace')!==w('monospace');},FF);
    if(ok) return true;
    await new Promise(r=>setTimeout(r,100));
  }
  console.log('⚠️  الخط «'+FF+'» ما نزل.');return false;
}
(async()=>{
  const puppeteer=resolvePuppeteer();
  const caps=JSON.parse(fs.readFileSync(W+'caps.json','utf8'));
  const TH=JSON.parse(fs.readFileSync(W+'theme.json','utf8'));
  const SFX=fs.existsSync(W+'sfx.json')?JSON.parse(fs.readFileSync(W+'sfx.json','utf8')):{outro:0};
  const dur=caps.total+(SFX.outro||0);
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',
    args:['--no-sandbox','--allow-file-access-from-files','--font-render-hinting=none']});
  const p=await b.newPage();
  await p.setViewport({width:1080,height:1920,deviceScaleFactor:1});
  await p.setCacheEnabled(false);
  await p.goto(require('url').pathToFileURL(W+'compose.html').href,{waitUntil:'networkidle0'});
  await p.evaluate((c,o,t)=>window.init({cards:c.cards,total:c.total,outro:o,theme:t}),caps,SFX.outro||0,TH);
  await ensureFont(p,TH.font||'Cairo');
  await p.evaluate(()=>{window.__collect=true;});
  const hits=[];
  for(let t=0;t<dur;t+=STEP){
    const bad=await p.evaluate((t,OV,MG)=>{
      window.__resetBoxes(); window.draw(t);
      const B=window.__boxes().filter(b=>b.w>4&&b.h>4);
      const out=[];
      for(let i=0;i<B.length;i++) for(let j=i+1;j<B.length;j++){
        const a=B[i],c=B[j];
        const ix=Math.min(a.x+a.w,c.x+c.w)-Math.max(a.x,c.x);
        if(ix<=0) continue;                       /* ما يتحاذيان أفقياً */
        const iy=Math.min(a.y+a.h,c.y+c.h)-Math.max(a.y,c.y);
        if(iy>0){                                  /* تراكب فعلي */
          const area=ix*iy, small=Math.min(a.w*a.h,c.w*c.h);
          if(area/small>OV) out.push([a.t,c.t,'تراكب '+Math.round(area/small*100)+'٪']);
        }else{                                     /* تلاصق: قريبان لدرجة يُقرآن كتلة وحدة */
          const gap=Math.max(a.y,c.y)-Math.min(a.y+a.h,c.y+c.h);
          if(gap<MG) out.push([a.t,c.t,'تلاصق '+Math.round(gap)+'بكسل']);
        }
      }
      return out;
    },t,OVERLAP,MINGAP);
    if(bad.length) hits.push({t:+t.toFixed(2),pairs:bad.slice(0,3)});
  }
  await b.close();
  if(!hits.length){ console.log(`✅ ما فيه تراكب ولا تلاصق بين النصوص — ${Math.round(dur/STEP)} لحظة`); process.exit(0); }
  console.log('❌ نصوص متداخلة:');
  const seen=new Set();
  for(const h of hits){
    for(const [a,c,r] of h.pairs){
      const k=a+'|'+c; if(seen.has(k)) continue; seen.add(k);
      console.log(`  ${h.t.toFixed(2)}ث  «${a}» × «${c}»  — ${r}`);
    }
  }
  console.log(`\n⛔ ${seen.size} زوج — صغّر الخط أو باعد العناصر (الخط يصغر عادي عشان يواكب الرسم).`);
  process.exit(3);
})();
