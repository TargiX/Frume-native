import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { afterAll, describe, it } from 'vitest';
import { decodeBakedCut, type BakedCut } from '../../src/puzzle/cutters/biomorphic/bakedCut';
import { CUT_STYLES } from '../../src/puzzle/cutters/biomorphic/cutStyles';
import { generateBiomorphicPiecesFromTopology, type BiomorphicTopology } from '../../src/puzzle/cutters/biomorphic/generateBiomorphic';
import { COMPLEX_CUT_REPAIR_OPTIONS, prepareComplexCut } from '../../src/puzzle/cutters/biomorphic/prepareComplexCut';
import { edgePath, renderCut, renderPhoneCut } from './renderCut';

const from = resolve(process.env.FRUME_COMPLEX_REVIEW_FROM ?? 'assets/cuts');
const to = process.env.FRUME_COMPLEX_REVIEW_TO && resolve(process.env.FRUME_COMPLEX_REVIEW_TO);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const styleNames = new Map<string, string>(CUT_STYLES.map(style => [style.id, style.name]));
const sources = [
  'src/puzzle/cutters/biomorphic/auditCut.ts', 'src/puzzle/cutters/biomorphic/cutGeometry.ts',
  'src/puzzle/cutters/biomorphic/prepareBakedCut.ts', 'src/puzzle/cutters/biomorphic/prepareComplexCut.ts',
  'src/puzzle/cutters/biomorphic/bakedCut.ts', 'src/puzzle/cutters/biomorphic/cutStyles.ts',
  'src/puzzle/cutters/biomorphic/generateBiomorphic.ts', 'src/puzzle/cutters/biomorphic/generateBiomorphicPhaseField.ts',
  'scripts/cuts/renderCut.ts', 'scripts/cuts/reviewComplexLibrary.test.ts',
];
const sourceFingerprint = to ? hash(sources.map(file => `${file}\n${readFileSync(file, 'utf8')}`).join('\n')) : '';
function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : entry.isFile() ? [relative(from, path)] : [];
  });
}
const files = to ? walk(from).flatMap(file => {
  const match = /(?:^|\/)([^/]+)\/(\d+x\d+)\/(\d+)\.json$/.exec(file);
  if (!match || !styleNames.has(match[1])) return [];
  return [{ path: resolve(from, file), style: match[1], grid: match[2], variant: Number(match[3]),
    id: `${match[1]}-${match[2]}-${match[3]}` }];
}).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })) : [];

function closeup(topology: BiomorphicTopology, x: number, y: number, side: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="420" viewBox="${x - side / 2} ${y - side / 2} ${side} ${side}"><rect x="-1" y="-1" width="3" height="3" fill="#101714"/>${topology.edges.map(edge => `<path d="${edgePath(edge)}" fill="none" stroke="#e9ede2" stroke-width="${side / 420}"/>`).join('')}</svg>`;
}

function card(topology: BiomorphicTopology, title: string, subtitle: string) {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="654" viewBox="0 0 480 654"><rect width="480" height="654" fill="#101714"/><g font-family="Helvetica,Arial,sans-serif" fill="#e9ede2"><text x="18" y="28" font-size="22">${escape(title)}</text><text x="18" y="53" font-size="13">${escape(subtitle)}</text><g transform="translate(18,70) scale(444)">`;
  for (const edge of topology.edges) svg += `<path d="${edgePath(edge)}" fill="none" stroke="#e9ede2" stroke-width="${0.65 / 444}"/>`;
  svg += '</g>';
  [Math.floor(topology.cells.length / 3), Math.floor(topology.cells.length / 2), topology.cells.length - 1].forEach((index, i) => {
    const cell = topology.cells[index];
    const bounds = cell.edgeTraversals.flatMap(t => t.edge.segments.flatMap(s => s.kind === 'line' ? [s.start, s.end] : [s.start, s.control1, s.control2, s.end]));
    const minX = Math.min(...bounds.map(p => p.x)), minY = Math.min(...bounds.map(p => p.y));
    const side = Math.max(Math.max(...bounds.map(p => p.x)) - minX, Math.max(...bounds.map(p => p.y)) - minY);
    const path = cell.edgeTraversals.map((t, j) => edgePath(t.edge, t.direction === -1, j === 0)).join('') + 'Z';
    svg += `<path transform="translate(${22 + i * 153},537) scale(${94 / side}) translate(${-minX},${-minY})" d="${path}" fill="#dce8db"/>`;
  });
  return svg + '</g></svg>';
}

/** Offline staging only: immutable inputs, resumable receipts, no asset replacement. */
describe.skipIf(!to)('review and locally correct existing complex cuts', () => {
  const records: Record<string, any>[] = [];
  if (to) {
    if (!files.length) throw new Error(`No complex cut files found in ${from}`);
    if (new Set(files.map(file => file.id)).size !== files.length) throw new Error('Duplicate style/grid/variant input');
    if (to === resolve('assets/cuts') || !relative(from, to).startsWith('..')) throw new Error('Use an output directory outside the input library');
    mkdirSync(to, { recursive: true });
    const manifestPath = `${to}/manifest.json`;
    if (existsSync(manifestPath)) {
      const existing = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (existing.sourceFingerprint !== sourceFingerprint || existing.inputDirectory !== from) throw new Error('Source changed: choose a fresh review directory');
    } else {
      writeFileSync(manifestPath, JSON.stringify({ sourceFingerprint, inputDirectory: from, createdAt: new Date().toISOString(),
        options: COMPLEX_CUT_REPAIR_OPTIONS, note: 'Geometry and shape retention checks only; device review is separate.' }, null, 2));
      for (const source of sources) {
        const target = `${to}/source/${source}`;
        mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, readFileSync(source, 'utf8'));
      }
    }
  }
  for (const file of files) it(file.id, () => {
    const raw = readFileSync(file.path, 'utf8'), inputSha256 = hash(raw), receiptPath = `${to}/${file.id}.receipt.json`;
    if (existsSync(receiptPath)) {
      const existing = JSON.parse(readFileSync(receiptPath, 'utf8'));
      if (existing.inputSha256 !== inputSha256 || existing.sourceFingerprint !== sourceFingerprint) throw new Error(`Resume provenance mismatch: ${file.id}`);
      if (existing.accepted && hash(readFileSync(`${to}/${existing.outputFile}`, 'utf8')) !== existing.outputSha256) throw new Error(`Resume output mismatch: ${file.id}`);
      records.push(existing); return;
    }
    const baked = JSON.parse(raw) as BakedCut, before = decodeBakedCut(baked);
    if (file.grid !== `${baked.rows}x${baked.columns}`) throw new Error(`Grid mismatch: ${file.id}`);
    const started = performance.now(), prepared = prepareComplexCut(baked);
    const outputFile = prepared.baked ? `accepted/${file.style}/${file.grid}/${file.variant}.json` : undefined;
    const outputRaw = prepared.baked ? (prepared.baked === baked ? raw : JSON.stringify(prepared.baked)) : undefined;
    const receipt = { ...file, name: styleNames.get(file.style), pieces: baked.rows * baked.columns,
      sourceFingerprint, inputSha256, processedAt: new Date().toISOString(), validationMs: performance.now() - started,
      accepted: prepared.accepted, changed: (prepared.shapeChange?.changedKnots ?? 0) > 0,
      outputFile, outputSha256: outputRaw ? hash(outputRaw) : undefined,
      before: prepared.before, after: prepared.audit, repair: prepared.repair, shapeChange: prepared.shapeChange,
      rejectionReasons: prepared.rejectionReasons };
    if (prepared.baked && outputFile && outputRaw) {
      const pieces = generateBiomorphicPiecesFromTopology(prepared.topology, 330, 330);
      if (pieces.length !== receipt.pieces) throw new Error(`Game geometry lost a piece: ${file.id}`);
      mkdirSync(dirname(`${to}/${outputFile}`), { recursive: true }); writeFileSync(`${to}/${outputFile}`, outputRaw);
    }
    const title = `${receipt.name} · ${receipt.pieces} pieces · variant ${file.variant + 1}`;
    writeFileSync(`${to}/${file.id}.card.svg`, card(prepared.topology, String(receipt.name), `${receipt.pieces} pieces · independent variant ${file.variant + 1} · ${prepared.accepted ? 'geometry checked' : 'REJECTED'}`));
    const photo = `data:image/jpeg;base64,${readFileSync('assets/categories/nature.jpg').toString('base64')}`;
    writeFileSync(`${to}/${file.id}.phone.svg`, renderPhoneCut(prepared.topology, prepared.audit, photo));
    writeFileSync(`${to}/${file.id}.svg`, renderCut(prepared.topology, before, prepared.audit, prepared.before, title, photo, prepared.accepted,
      'Complex styles: micro-gap threshold 1% of a cell; pointed junctions retained. Geometry review, not device interaction.'));
    const locations = [...prepared.before.pinches, ...prepared.before.junctionTips];
    if (locations.length) {
      const worst = locations.reduce((a, b) => a.width < b.width ? a : b);
      writeFileSync(`${to}/${file.id}.before.svg`, closeup(before, worst.at.x, worst.at.y, 0.25 / baked.rows));
      writeFileSync(`${to}/${file.id}.after.svg`, closeup(prepared.topology, worst.at.x, worst.at.y, 0.25 / baked.rows));
    }
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2)); records.push(receipt);
    console.log(`${file.id}: ${prepared.accepted ? 'accepted' : 'REJECTED'}; ${prepared.before.pinches.length} → ${prepared.audit.pinches.length} micro defects; ${prepared.shapeChange?.changedKnots ?? 0} knots changed`);
  }, 600_000);
  afterAll(() => {
    if (!to) return;
    const summary = { sourceFingerprint, generatedAt: new Date().toISOString(), inputDirectory: from,
      discovered: files.length, processed: records.length, accepted: records.filter(r => r.accepted).length,
      changed: records.filter(r => r.changed).length, rejected: records.filter(r => !r.accepted).map(r => r.id), records };
    writeFileSync(`${to}/summary.json`, JSON.stringify(summary, null, 2));
    const css = '<style>body{margin:24px;background:#101714;color:#e9ede2;font:16px system-ui}h1{font-size:28px}p{color:#b5c5b6;max-width:1200px}.grid{display:grid;grid-template-columns:repeat(3,480px);gap:18px}img{display:block;width:480px}table{border-collapse:collapse}td,th{padding:9px 15px;border-bottom:1px solid #455046;text-align:left}a{color:#bbdfb9}</style>';
    const counts = [...new Set(records.map(r => r.pieces))].sort((a, b) => a - b);
    for (const pieces of counts) for (const variant of [...new Set(records.filter(r => r.pieces === pieces).map(r => r.variant))]) {
      const selection = CUT_STYLES.flatMap(s => records.filter(r => r.style === s.id && r.pieces === pieces && r.variant === variant));
      writeFileSync(`${to}/gallery-${pieces}-${variant}.html`, `<!doctype html><meta charset="utf-8">${css}<h1>Frume · original complex styles · ${pieces} pieces · variant ${variant + 1}</h1><p>Original 96-sample profiles. Corrections are limited to extreme local defects; full-size sheets and pieces are linked below. Geometry checks do not establish touch usability.</p><div class="grid">${selection.map(r => `<a href="${r.id}.svg"><img src="${r.id}.card.svg"/></a>`).join('')}</div>`);
    }
    writeFileSync(`${to}/report.html`, `<!doctype html><meta charset="utf-8">${css}<h1>Complex cut review · ${summary.accepted}/${records.length} accepted</h1><p>${summary.changed} locally corrected. ${records.length - summary.accepted} withheld. Inputs remain unchanged. Pinch threshold: 1% of a cell; intentional pointed junctions reported separately.</p><p>${counts.map(n => `<a href="gallery-${n}-0.html">${n} pieces</a>`).join(' · ')}</p><table><tr><th>Cut</th><th>State</th><th>Micro defects before → after</th><th>Curve movement, % cell</th><th>Seam length change</th></tr>${records.map(r => `<tr><td><a href="${r.id}.svg">${escape(r.id)}</a></td><td>${r.accepted ? r.changed ? 'corrected' : 'unchanged' : 'REJECTED'}</td><td>${r.before.pinches.length} → ${r.after.pinches.length}</td><td>${((r.shapeChange?.maximumCurveMovement ?? 0) * 100).toFixed(3)}</td><td>${(((r.shapeChange?.seamLengthRatio ?? 1) - 1) * 100).toFixed(4)}%</td></tr>`).join('')}</table>`);
  });
});
