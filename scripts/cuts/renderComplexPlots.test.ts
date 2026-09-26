import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import CanvasKitInit from 'canvaskit-wasm';
import { describe, expect, it } from 'vitest';
import { decodeBakedCut } from '../../src/puzzle/cutters/biomorphic/bakedCut';
import { CUT_STYLES } from '../../src/puzzle/cutters/biomorphic/cutStyles';
import type { BiomorphicTopology } from '../../src/puzzle/cutters/biomorphic/generateBiomorphic';
import { edgePath } from './renderCut';

const input = process.env.FRUME_COMPLEX_PLOT_REVIEW;

// A standalone geometry figure rendered by CanvasKit's software surface.
// No browser, HTML, development server, or native UI is involved.
describe.skipIf(!input)('complex cut geometry figures', () => {
  it('plots the decoded accepted cuts and isolated pieces', async () => {
    const root = resolve(input!), output = resolve(process.env.FRUME_COMPLEX_PLOT_OUT ?? `${root}/plots`);
    const summary = JSON.parse(readFileSync(`${root}/summary.json`, 'utf8'));
    const ck = await CanvasKitInit();
    const face = ck.Typeface.MakeFreeTypeFaceFromData(Uint8Array.from(readFileSync(
      'node_modules/@shopify/react-native-skia/src/skia/__tests__/assets/Roboto-Regular.ttf')).buffer);
    const ink = new ck.Paint(), stroke = new ck.Paint();
    ink.setAntiAlias(true); stroke.setAntiAlias(true); stroke.setStyle(ck.PaintStyle.Stroke);
    const font = new ck.Font(face, 18);
    const color = (hex: string) => ck.parseColorString(hex);
    const background = color('#101714'), light = color('#e9ede2'), muted = color('#bac8bd');
    const photo = ck.MakeImageFromEncoded(Uint8Array.from(readFileSync('assets/categories/nature.jpg')))!;
    const photoSide = Math.min(photo.width(), photo.height());
    const photoRect = ck.XYWHRect((photo.width() - photoSide) / 2, (photo.height() - photoSide) / 2, photoSide, photoSide);
    mkdirSync(output, { recursive: true });
    const plots: string[] = [];
    for (const pieces of [100, 196]) for (const variant of [0, 1]) {
      const records = CUT_STYLES.map(style => summary.records.find((r: { style: string; pieces: number; variant: number }) =>
        r.style === style.id && r.pieces === pieces && r.variant === variant));
      // An in-progress review can have fewer complete groups. Never draw a
      // partial figure as if it represented all six styles.
      if (records.some(record => !record)) continue;
      const topologies = records.map(record => {
        expect(record.accepted, record.id).toBe(true);
        const raw = readFileSync(`${root}/${record.outputFile}`, 'utf8');
        expect(createHash('sha256').update(raw).digest('hex')).toBe(record.outputSha256);
        return decodeBakedCut(JSON.parse(raw));
      });
      const surface = ck.MakeSurface(1500, 1530)!;
      const canvas = surface.getCanvas(); canvas.clear(background);
      function text(value: string, x: number, y: number, size = 18, fill = light) {
        ink.setColor(fill); font.setSize(size); canvas.drawText(value, x, y, ink, font);
      }
      function path(value: string, fill?: Float32Array) {
        const shape = ck.Path.MakeFromSVGString(value)!;
        if (fill) { ink.setColor(fill); canvas.drawPath(shape, ink); }
        canvas.drawPath(shape, stroke); shape.delete();
      }
      function board(topology: BiomorphicTopology, x: number, y: number, size: number) {
        canvas.save(); canvas.translate(x, y); canvas.scale(size, size);
        stroke.setColor(light); stroke.setStrokeWidth(1.1 / size);
        for (const edge of topology.edges) path(edgePath(edge));
        canvas.restore();
      }
      text(`Frume / ${pieces} pieces / variant ${variant + 1}`, 32, 44, 30);
      text('Six original profiles. Full-resolution baked geometry, with isolated pieces below each board.', 32, 76, 17, muted);
      topologies.forEach((topology, i) => {
        const x = 32 + (i % 3) * 490, y = 110 + Math.floor(i / 3) * 695;
        text(CUT_STYLES[i].name, x, y + 22, 23);
        text(records[i].changed ? 'Local microdefect correction' : 'Original curves retained', x, y + 47, 14, muted);
        board(topology, x, y + 66, 450);
        const picks = [0, Math.floor(topology.cells.length / 2), topology.cells.length - 1];
        picks.forEach((index, j) => {
          const cell = topology.cells[index];
          const points = cell.edgeTraversals.flatMap(t => t.edge.segments.flatMap(s =>
            s.kind === 'line' ? [s.start, s.end] : [s.start, s.control1, s.control2, s.end]));
          const minX = Math.min(...points.map(p => p.x)), minY = Math.min(...points.map(p => p.y));
          const width = Math.max(...points.map(p => p.x)) - minX, height = Math.max(...points.map(p => p.y)) - minY;
          const scale = 130 / Math.max(width, height);
          canvas.save(); canvas.translate(x + j * 154 + (130 - width * scale) / 2, y + 542 + (130 - height * scale) / 2);
          canvas.scale(scale, scale); canvas.translate(-minX, -minY);
          stroke.setColor(color('#b9d8b5')); stroke.setStrokeWidth(1.1 / scale);
          path(cell.edgeTraversals.map((t, n) => edgePath(t.edge, t.direction === -1, n === 0)).join('') + 'Z', color('#263c2e'));
          canvas.restore();
        });
      });
      text('Decoded shared curves / numerical geometry checks passed / device interaction remains unverified', 32, 1510, 15, muted);
      surface.flush(); const snapshot = surface.makeImageSnapshot();
      const file = `styles-${pieces}-variant-${variant + 1}.png`;
      writeFileSync(`${output}/${file}`, snapshot.encodeToBytes()!); plots.push(file);
      snapshot.delete(); surface.delete();

      const phone = ck.MakeSurface(1092, 866)!;
      const pc = phone.getCanvas(); pc.clear(background); ink.setColor(light); font.setSize(25);
      pc.drawText(`${pieces} pieces / 330 px photo boards / variant ${variant + 1}`, 24, 38, ink, font);
      font.setSize(14); pc.drawText('Static CanvasKit geometry figure; native gestures and zoom are not reproduced.', 24, 66, ink, font);
      topologies.forEach((topology, i) => {
        const x = 24 + (i % 3) * 356, y = 98 + Math.floor(i / 3) * 383;
        font.setSize(18); ink.setColor(light); pc.drawText(CUT_STYLES[i].name, x, y, ink, font);
        pc.save(); pc.translate(x, y + 16); pc.scale(330, 330);
        pc.drawImageRect(photo, photoRect, ck.XYWHRect(0, 0, 1, 1), ink);
        stroke.setColor(color('#14251dcc')); stroke.setStrokeWidth(1 / 330);
        for (const edge of topology.edges) {
          const shape = ck.Path.MakeFromSVGString(edgePath(edge))!;
          pc.drawPath(shape, stroke); shape.delete();
        }
        pc.restore();
      });
      phone.flush(); const phoneSnapshot = phone.makeImageSnapshot();
      const phoneFile = `photos-${pieces}-variant-${variant + 1}.png`;
      writeFileSync(`${output}/${phoneFile}`, phoneSnapshot.encodeToBytes()!); plots.push(phoneFile);
      phoneSnapshot.delete(); phone.delete();
    }
    photo.delete(); font.delete(); face?.delete(); ink.delete(); stroke.delete();
    expect(plots.length).toBeGreaterThan(0);
    writeFileSync(`${output}/manifest.json`, JSON.stringify({ reviewSourceFingerprint: summary.sourceFingerprint,
      rendererSha256: createHash('sha256').update(readFileSync('scripts/cuts/renderComplexPlots.test.ts', 'utf8')).digest('hex'), plots,
      note: 'Standalone software-rendered geometry figures, not browser screenshots or native device evidence.' }, null, 2));
  }, 120_000);
});
