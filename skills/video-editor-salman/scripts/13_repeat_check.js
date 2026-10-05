/* ═══ الفاحص السادس: منع تكرار الآليات ═══
   node 13_repeat_check.js <work> <اسم المقطع>

   ليش: القاعدة ١٢ («اخترع مشاهد جديدة كل مرة») كانت تعتمد على ذاكرتي، وبعد خمسة مقاطع ما عادت تكفي.
   شلون: يقرأ دوال المشاهد (kN/jN) من compose.html، يطلّع الدوال اللي تستدعيها،
         يطابقها بـmechanisms.json، ويسقط لو أي آلية استُعملت في آخر مقطعين.        */
const fs=require('fs'), path=require('path');
const W=path.resolve(process.argv[2])+path.sep;
const NAME=process.argv[3]||'(بلا اسم)';
const P=require('./_paths'); P.ensure();
const MF=P.data('mechanisms.json');
const M=fs.existsSync(MF)?JSON.parse(fs.readFileSync(MF,'utf8')):{videos:[],mechs:{},rejected:[],sounds:{}};
if(!M.videos.length){ console.log('✅ السجل فاضي (أول مقطع) — ما فيه شي يتكرر'); process.exit(0); }
/* ريموشن: المشاهد مكوّنات بـScenes.tsx — كان الفاحص يقرأ compose.html بس فيطلّع «مشاهد: 0»
   ويقول «ولا آلية مكرّرة» وهو ما فحص شيئاً. */
const TSX=fs.existsSync(W+'Scenes.tsx'), HTML=fs.existsSync(W+'compose.html');
const src=TSX ? fs.readFileSync(W+'Scenes.tsx','utf8') : fs.readFileSync(W+'compose.html','utf8');

const SKIP=new Set(['X','Math','T','rr','sh','nsh','pr','cl','ease','eio','back','lerp','rgba','cBG','cINK',
 'FT','_fd','_kf','headroomZone','overlayZone','vrect','safe','String','Number','Array','Object','parseInt',
 'save','restore','translate','scale','rotate','beginPath','moveTo','lineTo','arc','stroke','fill','clip',
 'rect','fillRect','quadraticCurveTo','bezierCurveTo','closePath','measureText','createLinearGradient',
 'createRadialGradient','addColorStop','toLocaleString','forEach','includes','slice','padStart','map',
 'sin','cos','exp','pow','max','min','round','floor','abs','sqrt','row','ic','card','draw','setLineDash']);

const L=src.split('\n'); const used=new Set(); const scenes=[];
for(let i=0;i<L.length;i++){
  const m=L[i].match(/^function ([jk]\d+)\(t\)/); if(!m) continue;
  let d=0,j=i; for(;j<L.length;j++){ d+=(L[j].match(/{/g)||[]).length-(L[j].match(/}/g)||[]).length;
    if(j>i&&d<=0) break; }
  const body=L.slice(i,j+1).join('\n');
  const calls=[...new Set([...body.matchAll(/\b([a-zA-Z_][A-Za-z0-9_]*)\s*\(/g)].map(x=>x[1]))]
    .filter(c=>!SKIP.has(c)&&c!==m[1]);
  scenes.push({fn:m[1],calls});
  calls.forEach(c=>used.add(c)); used.add(m[1]);
}
if(TSX){
  /* كل مكوّن مشهد مستعمل داخل <Scenes> + وسوم صريحة /* M45 *\/ لو كتبها */
  const block=(src.split('export const Scenes')[1]||'');
  for(const m of block.matchAll(/<([A-Z]\w*)\s+t=\{t\}/g)){ used.add(m[1]); scenes.push({fn:m[1],calls:[]}); }
  for(const m of src.matchAll(/\/\*\s*(M\d{2,3})\s*\*\//g)) used.add('#'+m[1]);
}
if(!scenes.length){ console.log('❌ ما لقيت ولا مشهد — الفاحص ما فحص شيئاً، لا تعتبرها «سليمة».'); process.exit(3); }
/* آخر مقطعين */
const prev=M.videos.filter(v=>v.name!==NAME).slice(-2);
const prevCodes=new Set(prev.flatMap(v=>v.mechs));
const hits=[];
for(const [code,mm] of Object.entries(M.mechs)){
  const fns=String(mm.fn).split(/[+·\/]/).map(x=>x.trim()).filter(Boolean);
  if(!fns.some(f=>used.has(f)) && !used.has('#'+code)) continue;
  if(prevCodes.has(code)) hits.push({code,ar:mm.ar,في:prev.filter(v=>v.mechs.includes(code)).map(v=>v.name).join(' · ')});
}
const warns=[];
for(const [code,mm] of Object.entries(M.mechs)){
  if(!mm.warn) continue;
  const fns=String(mm.fn).split(/[+·\/]/).map(x=>x.trim()).filter(Boolean);
  if(fns.some(f=>used.has(f))) warns.push(`${code} ${mm.ar} — ${mm.warn}`);
}
console.log(`مشاهد: ${scenes.length} · آخر مقطعين: ${prev.map(v=>v.name).join(' · ')||'—'}`);
if(warns.length){ console.log('\n⚠️  تنبيهات:'); warns.forEach(w=>console.log('   '+w)); }
if(hits.length){
  console.log('\n❌ آليات مكرّرة من آخر مقطعين:');
  hits.forEach(h=>console.log(`   ${h.code} ${h.ar} — استُعملت في: ${h.في}`));
  console.log('\n⛔ غيّر الشكل قبل التسليم (القاعدة ١٢).');
  process.exit(1);
}
console.log('\n✅ ولا آلية مكرّرة من آخر مقطعين.');
