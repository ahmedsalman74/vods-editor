import {continueRender, delayRender} from 'remotion';
import {T, FONT_LOCAL} from './theme';

/* ⛔ القاعدة ١٤ — الوزن الغائب يخرّب الفيديو بصمت.
   كثير من الخطوط المثبّتة محلياً (خصوصاً الخطوط التجارية) العائلة الأساسية فيها 400 و700 بس،
   والأوزان 300/500/900 عائلات **منفصلة** ('… Light' · '… Med' · '… Black').
   فطلبُ 800 يعطي بولد مزيّفاً. نجمعها كلها بعائلة وحدة بـ@font-face + local(). */
const h = delayRender('font');
const W: [number,string][] = [[300,'Light'],[400,'Regular'],[500,'Medium'],[700,'Bold'],[900,'Black']];

if (FONT_LOCAL) {
  const base = T.font.replace(/\s+/g,'');                       // الاسم بلا مسافات
  const css = W.map(([w,n]) =>
    `@font-face{font-family:'${T.font}';font-style:normal;font-weight:${w};` +
    `src:local('${T.font} ${n}'),local('${base}-${n}');font-display:block;}`).join('\n');
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  document.fonts.ready.then(() => continueRender(h));
} else {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(T.font) +
    ':wght@300;400;500;700;900&display=swap';
  link.onload  = () => document.fonts.ready.then(() => continueRender(h));
  link.onerror = () => continueRender(h);
  document.head.appendChild(link);
}
