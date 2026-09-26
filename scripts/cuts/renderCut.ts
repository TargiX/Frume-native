import type { BiomorphicEdge, BiomorphicTopology } from '../../src/puzzle/cutters/biomorphic/generateBiomorphic';
import type { CutAudit } from '../../src/puzzle/cutters/biomorphic/auditCut';

const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
export function edgePath(edge: BiomorphicEdge, reverse = false, start = true): string {
  const segments = reverse ? [...edge.segments].reverse() : edge.segments;
  return segments.map((s, i) => {
    const a = reverse ? s.end : s.start, b = reverse ? s.start : s.end;
    const move = i === 0 && start ? `M${a.x} ${a.y}` : '';
    if (s.kind === 'line') return `${move}L${b.x} ${b.y}`;
    const c = reverse ? s.control2 : s.control1, d = reverse ? s.control1 : s.control2;
    return `${move}C${c.x} ${c.y} ${d.x} ${d.y} ${b.x} ${b.y}`;
  }).join('');
}
function piecePath(topology: BiomorphicTopology, index: number) {
  return topology.cells[index].edgeTraversals.map((t, i) => edgePath(t.edge, t.direction === -1, i === 0)).join('') + 'Z';
}
function board(topology: BiomorphicTopology, audit: CutAudit, x: number, y: number, size: number, photo?: string) {
  let svg = `<g transform="translate(${x},${y}) scale(${size})"><rect width="1" height="1" rx="0.005" fill="#1b211e"/>`;
  if (photo) svg += `<image href="${photo}" width="1" height="1" preserveAspectRatio="xMidYMid slice"/>`;
  for (const edge of topology.edges) svg += `<path d="${edgePath(edge)}" fill="none" stroke="${photo ? '#14251dcc' : '#e9ede2'}" stroke-width="${(photo ? 1 : 1.5) / size}"/>`;
  for (const pinch of audit.pinches) svg += `<circle cx="${pinch.at.x}" cy="${pinch.at.y}" r="${6 / size}" fill="none" stroke="#ffb33e" stroke-width="${2 / size}"/>`;
  for (const point of audit.crossings) svg += `<circle cx="${point.x}" cy="${point.y}" r="${4 / size}" fill="#ff6b63"/>`;
  return svg + '</g>';
}
const metrics = (audit: CutAudit) => `${audit.crossings.length} contacts · ${audit.pinches.length} narrow · ${audit.junctionTips.length} pointed junctions · ${audit.topologyErrors.length} topology errors`;

/** Fixed CSS-size board for reviewing fine fringe against a photograph. */
export function renderPhoneCut(topology: BiomorphicTopology, audit: CutAudit, photo: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="330" height="330" viewBox="0 0 330 330">${board(topology, audit, 0, 0, 330, photo)}</svg>`;
}

export function renderCut(topology: BiomorphicTopology, before: BiomorphicTopology, audit: CutAudit,
  beforeAudit: CutAudit, title: string, photo: string, accepted = audit.clean,
  policyLabel = 'Review thresholds: gap 6% of a cell; junction angle 20 degrees.'): string {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1160" height="1120" viewBox="0 0 1160 1120"><rect width="1160" height="1120" fill="#101714"/><g font-family="Helvetica,Arial,sans-serif" fill="#e9ede2"><text x="32" y="42" font-size="24">${escape(title)}</text><text x="32" y="76" font-size="16" fill="${accepted ? '#a8dfa3' : '#ffb33e'}">${accepted ? 'ACCEPTED after decode + rotation checks' : 'REJECTED — retained for diagnosis'}</text>`;
  svg += `<text x="32" y="96" font-size="12" fill="#b5c5b6">${escape(policyLabel)}</text><text x="32" y="120" font-size="18">Before local repair</text><text x="604" y="120" font-size="18">After local repair</text>`;
  svg += board(before, beforeAudit, 32, 130, 524) + board(topology, audit, 604, 130, 524);
  svg += `<text x="32" y="683" font-size="15">${metrics(beforeAudit)}</text><text x="604" y="683" font-size="15">${metrics(audit)}</text>`;
  svg += `<text x="32" y="727" font-size="18">330 px board · local nature photo</text>` + board(topology, audit, 32, 745, 330, photo);
  svg += `<text x="400" y="727" font-size="18">Isolated pieces · magnified for shape review</text>`;
  const picks = [...new Set([0, Math.floor(topology.cells.length / 3), Math.floor(topology.cells.length / 2), topology.cells.length - 1])];
  picks.forEach((index, i) => {
    const path = piecePath(topology, index), id = `piece-${index}`;
    const cell = topology.cells[index];
    const bounds = cell.edgeTraversals.flatMap(t => t.edge.segments.flatMap(s => s.kind === 'line' ? [s.start, s.end] : [s.start, s.control1, s.control2, s.end]));
    const xs = bounds.map(p => p.x), ys = bounds.map(p => p.y), minX = Math.min(...xs), minY = Math.min(...ys);
    const side = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY), scale = 136 / side;
    const x = 410 + (i % 2) * 330, y = 770 + Math.floor(i / 2) * 163;
    svg += `<g transform="translate(${x},${y}) scale(${scale}) translate(${-minX},${-minY})"><defs><clipPath id="${id}"><path d="${path}"/></clipPath></defs><g clip-path="url(#${id})"><image href="${photo}" width="1" height="1" preserveAspectRatio="xMidYMid slice"/></g><path d="${path}" fill="none" stroke="#e9ede2" stroke-width="${1.4 / scale}"/></g>`;
  });
  return svg + '</g></svg>';
}
