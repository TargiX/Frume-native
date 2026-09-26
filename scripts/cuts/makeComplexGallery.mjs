import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const [installedPath, largePath, outputPath] = process.argv.slice(2);
if (!installedPath || !largePath || !outputPath) throw new Error('Usage: node makeComplexGallery.mjs <installed-review> <large-review> <output>');
const output = resolve(outputPath);
if ([installedPath, largePath].some(path => resolve(path) === output)) throw new Error('Gallery needs its own output directory');
mkdirSync(output, { recursive: true });
const sources = [installedPath, largePath].map(path => ({ directory: resolve(path),
  summary: JSON.parse(readFileSync(`${path}/summary.json`, 'utf8')) }));
const records = sources.flatMap(({ directory, summary }) => summary.records.map(record => ({
  id: record.id, style: record.style, name: record.name, pieces: record.pieces, variant: record.variant,
  accepted: record.accepted, changed: record.changed,
  before: record.before.pinches.length, after: record.after.pinches.length,
  curveMovement: (record.shapeChange?.maximumCurveMovement ?? 0) * 100,
  seamChange: ((record.shapeChange?.seamLengthRatio ?? 1) - 1) * 100,
  image: relative(output, `${directory}/${record.id}.svg`),
  card: relative(output, `${directory}/${record.id}.card.svg`),
  phone: relative(output, `${directory}/${record.id}.phone.svg`),
  payload: record.accepted ? relative(output, `${directory}/${record.outputFile}`) : null,
})));
const styles = ['living-fringe', 'living-spectrum', 'crystal-six', 'crystal-four', 'amoeba-coral', 'amoeba-columnar'];
const safeData = JSON.stringify(records).replaceAll('<', '\\u003c');
const css = `<style>
*{box-sizing:border-box}body{margin:0;background:#101714;color:#e9ede2;font:16px/1.45 system-ui}main{max-width:1240px;margin:auto;padding:32px}h1{font-size:30px;margin:0 0 8px}p{color:#bac8bd;margin:8px 0 20px}button,select{font:inherit;border:1px solid #506256;border-radius:8px;background:#1b2820;color:#e9ede2;padding:9px 14px;cursor:pointer}button.active{background:#d3e6cc;color:#14251c;border-color:#d3e6cc}button:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid #dbb67b;outline-offset:3px}.controls{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}label{display:flex;align-items:center;gap:10px}a{color:#bbdfb9}.status{padding:14px 16px;background:#1b2820;border-radius:8px;margin:18px 0}.sheet{display:block;width:100%;max-width:1160px}.phone-grid{display:grid;grid-template-columns:repeat(auto-fit,330px);gap:24px}.phone-grid img{width:330px;height:330px}.phone-grid h2{font-size:17px;margin:0 0 8px}.phone-grid p{font-size:13px;margin:0 0 8px}.links{display:flex;gap:18px;flex-wrap:wrap}.note{font-size:13px}#download[hidden]{display:none}@media(max-width:650px){main{padding:18px}h1{font-size:24px}}
</style>`;
writeFileSync(`${output}/index.html`, `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css}<title>Frume · сложные нарезки</title><main>
<h1>Шесть исходных стилей Frume</h1><p>Запечённые варианты, локальные исправления и большие поля. Выберите стиль, количество деталей и вариант.</p>
<nav class="controls" id="styles" aria-label="Стиль нарезки"></nav><div class="controls" id="sizes" aria-label="Количество деталей"></div>
<div class="controls"><label>Вариант <select id="variants" aria-label="Вариант нарезки"></select></label><button id="random">Другой случайный вариант</button></div>
<div class="status" id="status" role="status"></div><div class="links"><a id="full" target="_blank">Открыть лист целиком</a><a id="download" download>JSON нарезки</a><a href="phone-preview.html">Фото при размере поля 330 px</a></div>
<p class="note">Проверены геометрия, кодирование и повороты; взаимодействие на телефоне проверяется отдельно. Острые углы на стыках сохранены и отмечаются отдельно от микроперегибов.</p>
<img class="sheet" id="sheet" alt="Исходная и исправленная нарезка, фото и увеличенные детали">
<script>
const records=${safeData};const styles=${JSON.stringify(styles)};
let selected=records.find(r=>r.style==='living-fringe'&&r.pieces===100&&r.variant===0)||records[0];
const byId=id=>document.getElementById(id);
const button=(text,active,action)=>{const b=document.createElement('button');b.textContent=text;b.className=active?'active':'';b.setAttribute('aria-pressed',String(active));b.onclick=action;return b;};
function choose(style,pieces,variant){selected=records.find(r=>r.style===style&&r.pieces===pieces&&r.variant===variant)||records.find(r=>r.style===style&&r.pieces===pieces)||records.find(r=>r.style===style);draw();}
function draw(){const r=selected;byId('styles').replaceChildren(...styles.filter(s=>records.some(r=>r.style===s)).map(s=>button(records.find(r=>r.style===s).name,s===r.style,()=>choose(s,r.pieces,r.variant))));
byId('sizes').replaceChildren(...[...new Set(records.filter(x=>x.style===r.style).map(x=>x.pieces))].sort((a,b)=>a-b).map(n=>button(n+' деталей',n===r.pieces,()=>choose(r.style,n,r.variant))));
const variants=records.filter(x=>x.style===r.style&&x.pieces===r.pieces).sort((a,b)=>a.variant-b.variant);byId('variants').replaceChildren(...variants.map(v=>{const o=document.createElement('option');o.value=v.variant;o.textContent=String(v.variant+1);o.selected=v.variant===r.variant;return o;}));
byId('variants').onchange=e=>choose(r.style,r.pieces,Number(e.target.value));byId('random').disabled=variants.length<2;byId('random').onclick=()=>{const other=variants.filter(v=>v.variant!==r.variant);const bits=new Uint32Array(1);crypto.getRandomValues(bits);choose(r.style,r.pieces,other[bits[0]%other.length].variant);};
byId('status').textContent=r.name+' · '+r.pieces+' деталей · вариант '+(r.variant+1)+' · '+(r.accepted?(r.changed?'локально исправлен':'исходные линии сохранены'):'не прошёл проверку')+'. Микродефекты: '+r.before+' → '+r.after+'. Максимальное смещение: '+r.curveMovement.toFixed(3)+'% клетки.';
byId('sheet').src=r.image;byId('full').href=r.image;byId('download').hidden=!r.payload;if(r.payload)byId('download').href=r.payload;history.replaceState(null,'','#'+r.style+'/'+r.pieces+'/'+r.variant);}
const parts=location.hash.slice(1).split('/');if(parts.length===3&&records.some(r=>r.style===parts[0]&&r.pieces===Number(parts[1])&&r.variant===Number(parts[2])))selected=records.find(r=>r.style===parts[0]&&r.pieces===Number(parts[1])&&r.variant===Number(parts[2]));draw();
</script></main></html>`);
const phones = [100, 196].flatMap(pieces => styles.flatMap(style => records.filter(r => r.style === style && r.pieces === pieces && r.variant === 0)));
writeFileSync(`${output}/phone-preview.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css}<title>Frume · 330 px photo boards</title><main><h1>Photo boards at 330 CSS px</h1><p>Six original styles, variant 1. Static geometry preview; this does not reproduce Skia, zoom, the tray or touch behavior.</p><p><a href="index.html">Interactive cut review</a></p><div class="phone-grid">${phones.map(r => `<section><h2>${r.name} · ${r.pieces} pieces</h2><p>${r.accepted ? 'Geometry checked' : 'REJECTED'}</p><a href="index.html#${r.style}/${r.pieces}/${r.variant}"><img src="${r.phone}" alt="${r.name}, ${r.pieces} pieces"/></a></section>`).join('')}</div></main></html>`);
writeFileSync(`${output}/manifest.json`, JSON.stringify({ generatedAt: new Date().toISOString(), sources: sources.map(s=>({ directory:s.directory, sourceFingerprint:s.summary.sourceFingerprint })), records:records.length },null,2));
console.log(`${records.length} cuts: ${output}/index.html`);
