/* فاحص التداخل بالبكسل — يعزل رسومات المشاهد وحدها (بلا كابشن ولا شارة) ويتأكد إن:
     1) ما فيه رسم فوق مستطيل الفيديو (وجه المتحدث).
     2) ما فيه رسم داخل كرت الكابشن.
     3) ما فيه رسم نازل تحت الحد الآمن.
   الاستعمال:  node scripts/08b_overlap_check.js <work> [خطوة_بالثواني]
   يخرج بالرمز 3 لو فيه خرق — فاستعمله شرطاً قبل التصدير. */
const path=require('path'), fs=require('fs');
const W=path.resolve(process.argv[2])+path.sep;
const STEP=parseFloat(process.argv[3]||'0.25');
function resolvePuppeteer(){
  for(const p of [process.env.PUPPETEER_PATH,'puppeteer-core',
      path.join(require('./_paths').HOME,'tools','node_modules','puppeteer-core')]){
    if(!p) continue; try{ return require(p); }catch(e){}
  }
  throw new Error('ما لقيت أداة الرسم — شغّل scripts/00_setup.sh --install');
}
const CHROME=require('./_paths').chrome();
/* أخضر فاقع مكان الفيديو: أي بكسل أخضر = الفيديو، وأي شي غير الخلفية والأخضر = رسمك أنت */
const VID='#00FF00';
const SOLID='data:image/svg+xml;base64,'+Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="1080" height="1920" fill="${VID}"/></svg>`
).toString('base64');
const hx=h=>{h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');
  return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];};

/* ينتظر نزول الخط فعلياً ويتأكد منه بالقياس (init هو اللي يحقن وصلته) */
async function ensureFont(p,FF){
  await p.evaluate(f=>Promise.all([document.fonts.load('700 100px '+f),
    document.fonts.load('400 40px '+f)]).then(()=>document.fonts.ready),FF);
  for(let i=0;i<40;i++){
    const ok=await p.evaluate(f=>{
      const c=document.createElement('canvas').getContext('2d');
      const w=fam=>{c.font='700 80px '+fam;return c.measureText('نصّ تجريبي ABC').width;};
      return w(f+', monospace')!==w('monospace');
    },FF);
    if(ok) return true;
    await new Promise(r=>setTimeout(r,100));
    await p.evaluate(f=>document.fonts.load('700 100px '+f).then(()=>document.fonts.ready),FF);
  }
  console.log('⚠️  الخط «'+FF+'» ما نزل — النصوص بتطلع بخط النظام.');
  return false;
}

(async()=>{
  const puppeteer=resolvePuppeteer();
  const caps=JSON.parse(fs.readFileSync(W+'caps.json','utf8'));
  const THEME=JSON.parse(fs.readFileSync(W+'theme.json','utf8'));
  const SFX=fs.existsSync(W+'sfx.json')?JSON.parse(fs.readFileSync(W+'sfx.json','utf8')):{outro:0};
  const SAFE=fs.existsSync(W+'safe.json')?JSON.parse(fs.readFileSync(W+'safe.json','utf8')):{};
  const BOTTOM=SAFE.drawBottom||1500;     /* أقصى نقطة ينزل لها أي رسم */
  const PAD=SAFE.videoPad!==undefined?SAFE.videoPad:115;  /* هامش يستثني إطار كرت الفيديو وظلّه */
  const BGC=hx(THEME.bg||'#F3EFEA');
  const dur=caps.total+(SFX.outro||0);

  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',
    args:['--no-sandbox','--allow-file-access-from-files','--font-render-hinting=none','--force-color-profile=srgb']});
  const p=await b.newPage();
  const errs=[];
  p.on('pageerror',e=>errs.push('خطأ صفحة: '+e.message));
  p.on('console',m=>{const s=m.text(); if(s.includes('متخطّى')) errs.push(s);});
  await p.setViewport({width:1080,height:1920,deviceScaleFactor:1});
  await p.setCacheEnabled(false);
  await p.goto(require('url').pathToFileURL(W+'compose.html').href,{waitUntil:'networkidle0'});
  const FF=THEME.font||'Cairo';
  await p.evaluate((c,o,t)=>window.init({cards:c.cards,total:c.total,outro:o,theme:t}),caps,SFX.outro||0,THEME);
  await ensureFont(p,FF);
  await p.evaluate(()=>{window.__noBG=true;});   /* الخلفية الحيّة ليست رسماً — نطفيها للقياس */
  await p.evaluate(s=>window.setFrame(s),SOLID);
  await p.evaluate(()=>{window.__diag=true;});

  const overVideo=[], overCaption=[], belowBand=[];
  for(let t=0;t<dur;t+=STEP){
    /* لقطة ملء الكادر (صورة تحلّ محل الفيديو) — ليست رسماً فوق الوجه */
    const bl=await p.evaluate(t=>{try{return (window.__bleed&&window.__bleed(t))||(window.__flash&&window.__flash(t));}catch(e){return false;}},t);
    if(bl) continue;
    const r=await p.evaluate((t,BGC,PAD)=>{
      const X=document.getElementById('cv').getContext('2d');
      window.draw(t);
      const R=window.vrect(t), cap=window.__capBox||null;
      const d=X.getImageData(0,0,1080,1920).data;
      const isVid=i=>d[i]<70&&d[i+1]>200&&d[i+2]<70;
      const isBG =i=>Math.abs(d[i]-BGC[0])<10&&Math.abs(d[i+1]-BGC[1])<10&&Math.abs(d[i+2]-BGC[2])<10;
      let minY=1e9,maxY=-1,minX=1e9,maxX=-1,n=0;
      const has=R.w>2&&R.h>2;
      const vx0=has?R.x-PAD:1e9, vx1=has?R.x+R.w+PAD:-1e9,
            vy0=has?R.y-PAD:1e9, vy1=has?R.y+R.h+PAD:-1e9;
      for(let y=0;y<1920;y+=2) for(let x=0;x<1080;x+=2){
        if(x>=vx0&&x<=vx1&&y>=vy0&&y<=vy1) continue;   /* داخل/حول الفيديو — مو رسم مشهد */
        const i=(y*1080+x)*4;
        if(isVid(i)||isBG(i)) continue;
        n++;
        if(y<minY)minY=y; if(y>maxY)maxY=y; if(x<minX)minX=x; if(x>maxX)maxX=x;
      }
      return {n,minY,maxY,minX,maxX,R,cap};
    },t,BGC,PAD);
    if(r.n<40) continue;                                /* ما فيه رسم فعلي بهاللحظة */
    /* الوجه مختفٍ (w<2) = ما فيه فيديو يُغطّى — الرسم حر بكل الشاشة */
    const isCard=r.R.r>0.5 && r.R.w>2 && r.R.h>2, vidTop=r.R.y, vidBot=r.R.y+r.R.h;
    if(isCard && r.minY<vidBot-6 && r.maxY>vidTop+6)
      overVideo.push({t:+t.toFixed(2),رسم:r.minY,'نهاية الفيديو':Math.round(vidBot)});
    if(r.cap && r.maxY>r.cap.y+4)
      overCaption.push({t:+t.toFixed(2),رسم:r.maxY,'أعلى الكابشن':Math.round(r.cap.y)});
    if(r.maxY>BOTTOM) belowBand.push({t:+t.toFixed(2),رسم:r.maxY});
  }
  await b.close();

  if(errs.length) console.log('⚠️  أخطاء الصفحة:', errs.slice(0,4));
  const say=(bad,ok,arr)=>console.log(arr.length? '❌ '+bad+': '+JSON.stringify(arr.slice(0,8),null,0) : '✅ '+ok);
  say('رسم فوق الفيديو','ما فيه رسم فوق الفيديو — وجه المتحدث سليم',overVideo);
  say('رسم داخل كرت الكابشن','ما فيه تداخل بين الرسم والكابشن',overCaption);
  say('رسم نازل تحت الحد ('+BOTTOM+')','كل الرسم داخل النطاق',belowBand);
  const total=overVideo.length+overCaption.length+belowBand.length;
  console.log(total? '\n⛔ فيه تداخل — صلّحه قبل التصدير.' : '\n✅ صفر تداخل على '+Math.round(dur/STEP)+' لحظة.');
  process.exit(total?3:0);
})();
