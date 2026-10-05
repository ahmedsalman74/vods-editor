/* ═══ تصدير خلفية الهوية كصور ثابتة — للثمنيل والمنشورات ═══
   node 17_bg_export.js <مجلد الخرج> [theme.json]
   يطلّع نفس خلفية الفيديو الحيّة بمقاسات جاهزة وبثلاث حالات توهّج. */
const path=require('path'), fs=require('fs');
const OUT=path.resolve(process.argv[2]);
const K=require('./_paths');
const TH=JSON.parse(fs.readFileSync(process.argv[3]||K.data('profile.json'),'utf8'));
function pup(){ for(const p of ['puppeteer-core','puppeteer',path.join(K.HOME,'tools','node_modules','puppeteer-core')])
  { try{ return require(p); }catch(e){} } throw new Error('ما لقيت puppeteer-core'); }
const CHROME=require('./_paths').chrome();
const SIZES=[[1080,1920,'ريلز-ستوري'],[1080,1350,'منشور-عمودي'],[1080,1080,'مربع'],
             [1920,1080,'أفقي'],[1280,720,'ثمنيل-يوتيوب']];
const PHASES=[[0.0,'أ'],[3.4,'ب'],[7.1,'ج']];
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const b=await pup().launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--force-color-profile=srgb']});
  const p=await b.newPage();
  await p.goto(require('url').pathToFileURL(path.join(K.SKILL,'scripts/bg.html')).href,{waitUntil:'networkidle0'});
  let n=0;
  for(const [w,h,nm] of SIZES) for(const [t,ph] of PHASES){
    const d=await p.evaluate((w,h,t,TH)=>window.bg(w,h,t,TH),w,h,t,TH);
    fs.writeFileSync(path.join(OUT,`خلفية-${nm}-${ph}.png`),Buffer.from(d.split(',')[1],'base64')); n++;
  }
  await b.close();
  console.log(`✅ ${n} خلفية في ${OUT}`);
})();
