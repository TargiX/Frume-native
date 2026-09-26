import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const directory = resolve(process.argv[2] ?? '.context/cut-study/batch-v2');
const receipts = readdirSync(directory).filter(file => file.endsWith('.receipt.json'))
  .map(file => JSON.parse(readFileSync(`${directory}/${file}`, 'utf8'))).sort((a, b) => a.id.localeCompare(b.id));
if (!receipts.length) throw new Error('No study receipts found');
const fingerprints = [...new Set(receipts.map(r => r.sourceFingerprint))];
if (fingerprints.length > 1) throw new Error('Mixed implementations in this study; report them separately');
const buckets = new Map();
for (const receipt of receipts) {
  const { name, rows, columns, numerics } = receipt.settings;
  const key = `${name}:${rows}x${columns}:${numerics.samplesPerPiece}`;
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push(receipt);
}
const groups = [];
for (const rows of buckets.values()) {
  const { name: recipe, rows: height, columns: width, numerics } = rows[0].settings;
  const accepted = rows.filter(r => r.status === 'accepted');
  const seconds = rows.map(r => r.totalMs / 1000).sort((a, b) => a - b);
  const middle = Math.floor(seconds.length / 2);
  groups.push({ recipe, pieces: height * width, samplesPerPiece: numerics.samplesPerPiece,
    attempted: rows.length, accepted: accepted.length,
    acceptedWithoutRepair: accepted.filter(r => r.repair.passes === 0).length,
    rejected: rows.filter(r => r.status === 'rejected').length, failed: rows.filter(r => r.status === 'failed').length,
    medianSeconds: seconds.length % 2 ? seconds[middle] : (seconds[middle - 1] + seconds[middle]) / 2,
    maxAcceptedMovement: Math.max(0, ...accepted.map(r => r.repair.maxMovement)),
  });
}
groups.sort((a, b) => a.recipe.localeCompare(b.recipe) || a.pieces - b.pieces || a.samplesPerPiece - b.samplesPerPiece);
const summary = { completed: receipts.length, sourceFingerprint: fingerprints[0], groups,
  failures: receipts.filter(r => r.status !== 'accepted').map(r => ({ id: r.id, status: r.status, error: r.error,
    contacts: r.after?.crossings.length, narrowPieces: r.after?.pinches.length, sharpCorners: r.after?.sharpCorners?.length,
    oddAreas: r.after?.oddAreas.length, topologyErrors: r.after?.topologyErrors })),
};
writeFileSync(`${directory}/summary.json`, JSON.stringify(summary, null, 2));
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const style = `<style>body{margin:28px;background:#101714;color:#e9ede2;font:16px system-ui}h1{font-size:28px;margin:0 0 12px}p{color:#abbcaf}table{border-collapse:collapse;margin:24px 0}td,th{padding:10px 20px;text-align:left;border-bottom:1px solid #354039}a{color:#b4d9b4}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}img{width:100%;display:block}.status{padding:6px}.rejected,.failed{color:#ffb33e}</style>`;
const table = `<table><tr><th>Recipe</th><th>Pieces</th><th>Samples / piece</th><th>Accepted / tried</th><th>No repair</th><th>Median seconds</th></tr>${groups.map(g => `<tr><td>${escape(g.recipe)}</td><td>${g.pieces}</td><td>${g.samplesPerPiece}</td><td>${g.accepted} / ${g.attempted}</td><td>${g.acceptedWithoutRepair}</td><td>${g.medianSeconds.toFixed(1)}</td></tr>`).join('')}</table>`;
const tile = r => r.status === 'failed' ? `<div class="failed">${escape(r.id)}<pre>${escape(r.error)}</pre></div>` :
  `<div><div class="status ${r.status}">${escape(r.id)} · ${r.status}</div><a href="${encodeURIComponent(r.id)}.svg"><img src="${encodeURIComponent(r.id)}.svg"/></a></div>`;
writeFileSync(`${directory}/report.html`, `<!doctype html><meta charset="utf-8">${style}<h1>Frume · organic cut study</h1><p>${receipts.length} recorded attempts. Every rejection is retained. Local geometry checks; physical-device review is still pending.</p>${table}<div class="grid">${receipts.map(tile).join('')}</div>`);
function pairForGrid(grid) {
  for (const organic of receipts.filter(r => r.settings.name === 'organic-v1' && r.settings.rows === grid && r.status === 'accepted')) {
    const rounded = receipts.find(r => r.settings.name === 'rounded-v1' && r.status === 'accepted' &&
      r.settings.rows === grid && r.settings.columns === organic.settings.columns &&
      r.settings.seed === organic.settings.seed &&
      r.settings.numerics.samplesPerPiece === organic.settings.numerics.samplesPerPiece);
    if (rounded) return [organic, rounded];
  }
  return [];
}
const selected = pairForGrid(5);
writeFileSync(`${directory}/comparison.html`, `<!doctype html><meta charset="utf-8">${style}<h1>Frume · two candidate cut families</h1><p>${selected.length ? 'Same seed · before / after bounded shared-seam repair · scaled photo previews' : 'No accepted 25-piece pair with the same seed and resolution.'}</p><div class="grid">${selected.map(tile).join('')}</div>`);
const photoPairs = [5, 7, 10].flatMap(pairForGrid);
const photoTiles = photoPairs.map(r => {
  const svg = readFileSync(`${directory}/${r.id}.svg`, 'utf8')
    .replace('width="1160" height="1120" viewBox="0 0 1160 1120"', 'width="330" height="330" viewBox="32 745 330 330"');
  writeFileSync(`${directory}/${r.id}.phone.svg`, svg);
  return `<div><p>${escape(r.settings.name)} · ${r.settings.rows * r.settings.columns} pieces<br>${escape(r.settings.seed)}</p><img width="330" height="330" src="${encodeURIComponent(r.id)}.phone.svg"/></div>`;
});
writeFileSync(`${directory}/phone-preview.html`, `<!doctype html><meta charset="utf-8">${style}<style>.grid{grid-template-columns:330px 330px;gap:20px 32px}.grid img{width:330px;height:330px}</style><h1>Frume · 330 px photo boards</h1><p>Fixed CSS size · accepted geometry · matched seeds per row<br>Static browser previews; touch and Skia rendering need device review.</p><div class="grid">${photoTiles.join('')}</div>`);
console.log(JSON.stringify(summary, null, 2));
