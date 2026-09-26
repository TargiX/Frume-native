import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'vitest';
import { auditCut, hasValidCutPartition, type CutAudit } from '../../src/puzzle/cutters/biomorphic/auditCut';
import { decodeBakedCut } from '../../src/puzzle/cutters/biomorphic/bakedCut';
import { BAKED_CUT_LIBRARY } from '../../src/puzzle/cutters/biomorphic/bakedLibrary.generated';
import { CUT_STYLES } from '../../src/puzzle/cutters/biomorphic/cutStyles';
import { flattenEdge, distance } from '../../src/puzzle/cutters/biomorphic/cutGeometry';
import type { BiomorphicTopology } from '../../src/puzzle/cutters/biomorphic/generateBiomorphic';
import { edgePath } from './renderCut';
import { bakedCutOnDisk } from '../../src/puzzle/cutters/biomorphic/bakedCutOnDisk';

const output = process.env.FRUME_CUT_LIBRARY_AUDIT_OUT;
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');

function preview(topology: BiomorphicTopology, name: string, index: number, audit: CutAudit, marked: boolean) {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="590" viewBox="0 0 420 590"><rect width="420" height="590" fill="#101714"/><g fill="#e9ede2" font-family="Helvetica,Arial,sans-serif"><text x="24" y="28" font-size="21">${escape(name)}</text><text x="24" y="53" font-size="13">${topology.cells.length} pieces · installed variant ${index}</text><g transform="translate(24,72) scale(372)">`;
  for (const edge of topology.edges) svg += `<path d="${edgePath(edge)}" fill="none" stroke="#e9ede2" stroke-width="0.0022"/>`;
  if (marked) {
    for (const point of audit.crossings) svg += `<circle cx="${point.x}" cy="${point.y}" r="0.01" fill="#ff6868"/>`;
    for (const pinch of audit.pinches) svg += `<circle cx="${pinch.at.x}" cy="${pinch.at.y}" r="0.01" fill="none" stroke="#ffd076" stroke-width="0.003"/>`;
  }
  svg += '</g>';
  const picks = [0, Math.floor(topology.cells.length / 2), topology.cells.length - 1];
  picks.forEach((index, i) => {
    const cell = topology.cells[index];
    const points = cell.edgeTraversals.flatMap(t => flattenEdge(t.edge, audit.curveTolerance));
    const minX = Math.min(...points.map(p => p.x)), minY = Math.min(...points.map(p => p.y));
    const side = Math.max(Math.max(...points.map(p => p.x)) - minX, Math.max(...points.map(p => p.y)) - minY);
    const path = cell.edgeTraversals.map((t, i) => edgePath(t.edge, t.direction === -1, i === 0)).join('') + 'Z';
    svg += `<path transform="translate(${30 + i * 125},466) scale(${88 / side}) translate(${-minX},${-minY})" d="${path}" fill="#dce8db"/>`;
  });
  svg += `<text x="24" y="579" font-size="11">${audit.crossings.length} contacts · ${audit.pinches.length} thin regions · ${audit.sharpCorners.length} acute corners</text></g></svg>`;
  return svg;
}

/** Inspect the exact installed assets without repairing or replacing their shapes. */
describe.skipIf(!output)('audit installed phase-field library', () => {
  it('records every asset and supported rotation, preserving style geometry', () => {
    const directory = resolve(output!);
    if (existsSync(`${directory}/summary.json`)) throw new Error('Choose a fresh audit directory');
    mkdirSync(directory, { recursive: true });
    const source = createHash('sha256');
    for (const file of ['auditCut.ts', 'cutGeometry.ts', 'bakedCut.ts', 'generateBiomorphic.ts', 'generateBiomorphicPhaseField.ts', 'bakedLibrary.generated.ts']) {
      source.update(file).update(readFileSync(`src/puzzle/cutters/biomorphic/${file}`, 'utf8'));
    }
    source.update(readFileSync('scripts/cuts/auditLibrary.test.ts', 'utf8'));
    const records: Record<string, unknown>[] = [];
    const groups: Record<string, unknown>[] = [];
    const gallery: { id: string; pieces: number }[] = [];
    for (const style of CUT_STYLES) {
      const entriesByGrid = BAKED_CUT_LIBRARY[style.id];
      if (!entriesByGrid) throw new Error(`Installed style missing: ${style.id}`);
      for (const [grid, entries] of Object.entries(entriesByGrid)) {
        let structurallyValid = 0, withinGenericThresholds = 0, contacts = 0, topologyFailures = 0;
        for (const [index, entry] of (entries ?? []).entries()) {
          const baked = bakedCutOnDisk(entry);
          const id = `${style.id}-${grid}-${index}`;
          const topology = decodeBakedCut(baked), original = auditCut(topology);
          if (grid !== `${topology.rows}x${topology.columns}`) throw new Error(`Misfiled ${id}`);
          const turns = topology.rows === topology.columns ? [0, 1, 2, 3] as const : [0, 2] as const;
          const rotations = turns.map(turn => ({ turn, audit: turn === 0 ? original : auditCut(decodeBakedCut(baked, turn)) }));
          // Very close contours deserve a finer contact check: the normal
          // approximation bound can be comparable with a tiny observed gap.
          const refinement = original.pinches.some(pinch => pinch.width < 0.005)
            ? turns.map(turn => ({ turn, audit: auditCut(decodeBakedCut(baked, turn), { flatness: 0.00005 }) })) : [];
          const geometryValid = [...rotations, ...refinement].every(r => hasValidCutPartition(r.audit));
          const withinThresholds = rotations.every(r => r.audit.clean);
          structurallyValid += Number(geometryValid);
          withinGenericThresholds += Number(withinThresholds);
          contacts += Number(rotations.some(r => r.audit.crossings.length > 0));
          topologyFailures += Number(rotations.some(r => r.audit.topologyErrors.length > 0));
          let perimeterSum = 0;
          for (const edge of topology.edges) {
            const points = flattenEdge(edge, original.curveTolerance);
            const length = points.slice(1).reduce((sum, p, i) => sum + distance(p, points[i]), 0);
            perimeterSum += length * edge.ownerIds.length;
          }
          const record = { id, style: style.id, name: style.name, grid, variant: index, pieces: topology.cells.length,
            assetSha256: createHash('sha256').update(JSON.stringify(baked)).digest('hex'),
            structuralValid: geometryValid, withinGenericThresholds: withinThresholds,
            contacts: original.crossings.length, topologyErrors: original.topologyErrors,
            thinPieces: original.pinches.length, acuteCorners: original.sharpCorners.length, areaOutliers: original.oddAreas.length,
            refined: refinement.length > 0,
            minimumObservedWidth: Math.min(...(refinement[0]?.audit ?? original).narrowestPerPiece),
            meanPerimeterInCellSides: perimeterSum / Math.sqrt(topology.cells.length) };
          records.push(record);
          writeFileSync(`${directory}/${id}.audit.json`, JSON.stringify({ ...record, rotations, refinement }, null, 2));
          if (index === 0) {
            writeFileSync(`${directory}/${id}.svg`, preview(topology, style.name, index, original, false));
            writeFileSync(`${directory}/${id}.marked.svg`, preview(topology, style.name, index, original, true));
            gallery.push({ id, pieces: topology.cells.length });
          }
        }
        groups.push({ style: style.id, name: style.name, grid, variants: entries?.length ?? 0,
          structurallyValid, withinGenericThresholds, withContacts: contacts, withTopologyErrors: topologyFailures });
        console.log(`${style.name} ${grid}: ${structurallyValid}/${entries?.length} structural; ${withinGenericThresholds} within generic review thresholds`);
      }
    }
    const summary = { sourceFingerprint: source.digest('hex'), generatedAt: new Date().toISOString(),
      thresholds: { gapFractionOfCell: 0.06, minCornerDegrees: 20, flatnessFractionOfCell: 0.0005 },
      groups, records };
    writeFileSync(`${directory}/summary.json`, JSON.stringify(summary, null, 2));
    const css = '<style>body{margin:24px;background:#101714;color:#e9ede2;font:16px system-ui}h1{font-size:27px}p{color:#b5c5b6}.grid{display:grid;grid-template-columns:repeat(3,420px);gap:18px}img{display:block;width:420px}table{border-collapse:collapse}td,th{padding:9px 15px;border-bottom:1px solid #455046;text-align:left}a{color:#bbdfb9}</style>';
    for (const pieces of [9, 16, 25, 49]) writeFileSync(`${directory}/gallery-${pieces}.html`, `<!doctype html><meta charset="utf-8">${css}<h1>Frume · existing baked styles · ${pieces} pieces</h1><p>Original installed variant 0 for each style. Style-specific seeds; no smoothing or repair applied.</p><div class="grid">${gallery.filter(g => g.pieces === pieces).map(g => `<a href="${g.id}.marked.svg"><img src="${g.id}.svg"/></a>`).join('')}</div>`);
    writeFileSync(`${directory}/report.html`, `<!doctype html><meta charset="utf-8">${css}<h1>Installed library: ${records.length} original cuts</h1><p>Structural checks cover all supported rotations. Thin regions, acute corners and area outliers are reported separately for style review.</p><p>${[9, 16, 25, 49].map(n => `<a href="gallery-${n}.html">${n} pieces</a>`).join(' · ')}</p><table><tr><th>Style</th><th>Grid</th><th>Variants</th><th>Structural pass</th><th>Generic threshold pass</th></tr>${groups.map(g => `<tr><td>${escape(String(g.name))}</td><td>${g.grid}</td><td>${g.variants}</td><td>${g.structurallyValid}</td><td>${g.withinGenericThresholds}</td></tr>`).join('')}</table>`);
  }, 300_000);
});
