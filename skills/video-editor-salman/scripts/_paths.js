/* مسارات المهارة وبيانات المستخدم — نفس _paths.py بالضبط.
   SKILL: مجلد المهارة (قراءة فقط) · HOME: بيانات المستخدم (~/Documents/video-editor-salman أو VEB_HOME) */
const path=require('path'), fs=require('fs'), os=require('os'), cp=require('child_process');
const SKILL=path.join(__dirname,'..');
const HOME=process.env.VES_HOME||process.env.VEB_HOME||path.join(os.homedir(),'Documents','video-editor-salman');
function ensure(){ for(const d of ['','sounds','refs','tools']) fs.mkdirSync(path.join(HOME,d),{recursive:true}); return HOME; }
function data(...p){ return path.join(HOME,...p); }
/* أداة الرسم بالمتصفح: تُنزَّل مرة وحدة بمجلد بيانات المستخدم (tools/) لأن مجلد المهارة للقراءة فقط */
function puppeteer(){
  for(const p of [process.env.PUPPETEER_PATH,'puppeteer-core',path.join(HOME,'tools','node_modules','puppeteer-core')]){
    if(!p) continue; try{ return require(p); }catch(e){}
  }
  throw new Error('ما لقيت أداة الرسم — شغّل scripts/00_setup.sh --install');
}
/* متصفح كروم: المسار حسب الجهاز، ويتغيّر بـCHROME_PATH */
function chrome(){
  if(process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const c=process.platform==='darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : process.platform==='win32'
      ? [path.join(process.env['PROGRAMFILES']||'C:\\Program Files','Google\\Chrome\\Application\\chrome.exe'),
         path.join(process.env['PROGRAMFILES(X86)']||'C:\\Program Files (x86)','Google\\Chrome\\Application\\chrome.exe'),
         path.join(process.env.LOCALAPPDATA||'','Google\\Chrome\\Application\\chrome.exe')]
      : ['/usr/bin/google-chrome','/usr/bin/chromium'];
  return c.find(p=>{ try{ return fs.existsSync(p); }catch(e){ return false; } })||c[0];
}
/* قاصّ الشخص وكاشف الوجه: بالماك مكتبة أبل (Vision) تُبنى مرة، وبغيره نسخة بايثون (mediapipe).
   يرجّع الأمر اللي ينادى بـ <in> <out> [quality] [feather] — أو null لو ما تجهّز. */
function personmask(binDir){
  if(process.platform==='darwin'){
    const BIN=path.join(binDir,'personmask');
    if(!fs.existsSync(BIN)){
      fs.mkdirSync(binDir,{recursive:true});
      try{ cp.execSync('swiftc -O -o '+JSON.stringify(BIN)+' '+JSON.stringify(path.join(__dirname,'personmask.swift')),{stdio:'pipe'}); }
      catch(e){ return null; }
    }
    return JSON.stringify(BIN);
  }
  const py=process.platform==='win32'?'python':'python3';
  return py+' '+JSON.stringify(path.join(__dirname,'personmask.py'));
}
module.exports={SKILL,HOME,ensure,data,puppeteer,chrome,personmask};
