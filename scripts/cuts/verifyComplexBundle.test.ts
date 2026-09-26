import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { AmoebaCutter } from '../../src/puzzle/cutters/amoeba/AmoebaCutter';
import { BiomorphicCutter } from '../../src/puzzle/cutters/biomorphic/BiomorphicCutter';
import { AmoebaColumnarCutter, CrystalCutter, CrystalQuarteredCutter, LivingSpectrumCutter } from '../../src/puzzle/cutters/biomorphic/createPhaseFieldCutter';
import { clearBakedCutLibrary, installBakedCutLibraries } from '../../src/puzzle/cutters/biomorphic/bakedCutSource';
import { BAKED_CUT_LIBRARY_V1 } from '../../src/puzzle/cutters/biomorphic/bakedLibrary.v1';
import { decodeBakedCut, encodeBakedCut, type BakedCut } from '../../src/puzzle/cutters/biomorphic/bakedCut';
import { hashSeed, type BakedCutLibrary } from '../../src/puzzle/cutters/biomorphic/bakedCutLibrary';
import { canonicalizeBiomorphicSeed, generateBiomorphicPiecesFromTopology } from '../../src/puzzle/cutters/biomorphic/generateBiomorphic';
import { CUT_STYLES, type CutStyleId } from '../../src/puzzle/cutters/biomorphic/cutStyles';
import { BIOMORPHIC_PHASE_FIELD_NUMERICS } from '../../src/puzzle/cutters/biomorphic/phaseFieldLabConfig';
import type { PuzzleCutter, PuzzleSizeId } from '../../src/puzzle/types/cutter';
import { PuzzleEngine } from '../../src/puzzle/engine/PuzzleEngine';
import { deserializePuzzleSession, serializePuzzleSession } from '../../src/puzzle/persistence/PuzzleSessionPersistence';

const directory = process.env.FRUME_COMPLEX_BUNDLE_REVIEW;
const cutters: Record<CutStyleId, PuzzleCutter> = {
  'living-fringe': BiomorphicCutter, 'living-spectrum': LivingSpectrumCutter,
  'crystal-six': CrystalCutter, 'crystal-four': CrystalQuarteredCutter,
  'amoeba-coral': AmoebaCutter, 'amoeba-columnar': AmoebaColumnarCutter,
};
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Final completeness and app-cutter gate for an explicitly planned trial batch. */
describe.skipIf(!directory)('complete complex cut trial bundle', () => {
  afterAll(() => clearBakedCutLibrary());
  it('serves every requested independent geometry and rotation through the actual app cutters', async () => {
    const root = resolve(directory!);
    const planPath = resolve(process.env.FRUME_COMPLEX_BUNDLE_PLAN ?? `${root}/../manifest.json`);
    const planRaw = readFileSync(planPath, 'utf8');
    const plan = JSON.parse(planRaw) as {
      styles: CutStyleId[]; grids: [number, number, number][]; seedOffset?: number;
    };
    const summary = JSON.parse(readFileSync(`${root}/summary.json`, 'utf8'));
    const library: BakedCutLibrary = {}, expectedIds: string[] = [];
    const geometryHashes = new Set<string>();
    const bundle: { style: CutStyleId; grid: string; variants: { file: string; sha256: string }[] }[] = [];
    for (const style of plan.styles) for (const [rows, columns, count] of plan.grids) {
      const grid = `${rows}x${columns}`;
      const entries: BakedCut[] = [], variants: { file: string; sha256: string }[] = [];
      for (let index = plan.seedOffset ?? 0; index < (plan.seedOffset ?? 0) + count; index++) {
        const id = `${style}-${grid}-${index}`; expectedIds.push(id);
        const receipt = summary.records.find((record: { id: string }) => record.id === id);
        expect(receipt, `Missing ${id}`).toBeDefined();
        expect(receipt.accepted, `${id}: ${receipt.rejectionReasons.join(', ')}`).toBe(true);
        const raw = readFileSync(`${root}/${receipt.outputFile}`, 'utf8');
        expect(sha256(raw), id).toBe(receipt.outputSha256);
        expect(sha256(readFileSync(receipt.path, 'utf8')), `Source changed: ${id}`).toBe(receipt.inputSha256);
        const baked = JSON.parse(raw) as BakedCut;
        expect([baked.rows, baked.columns], id).toEqual([rows, columns]);
        const orientationHashes = (rows === columns ? [0, 1, 2, 3] as const : [0, 2] as const).map(turn =>
          sha256(JSON.stringify(encodeBakedCut(decodeBakedCut(baked, turn), baked.tension))));
        for (const hash of orientationHashes) expect(geometryHashes.has(hash), `Duplicate or rotated copy: ${id}`).toBe(false);
        orientationHashes.forEach(hash => geometryHashes.add(hash));
        entries.push(baked); variants.push({ file: receipt.outputFile, sha256: receipt.outputSha256 });
      }
      library[style] ??= {}; library[style]![grid] = entries;
      bundle.push({ style, grid, variants });
    }
    expect(summary.records.map((r: { id: string }) => r.id).sort()).toEqual(expectedIds.sort());
    installBakedCutLibraries({ 1: BAKED_CUT_LIBRARY_V1, 2: library }, 2);
    let layouts = 0, restoredLayouts = 0;
    let largestSerializedSessionBytes = 0;
    const image = { uri: 'local://complex-cut-review', width: 1200, height: 1200 };
    for (const { style, grid } of bundle) {
      const [rows, columns] = grid.split('x').map(Number), entries = library[style]![grid]!;
      const turnCount = rows === columns ? 4 : 2;
      const seeds = new Map<number, string>();
      for (let i = 0; i < 10_000 && seeds.size < entries.length * turnCount; i++) {
        const source = `complex-review-${style}-${grid}-${i}`;
        seeds.set(hashSeed(canonicalizeBiomorphicSeed(source)) % (entries.length * turnCount), source);
      }
      expect(seeds.size).toBe(entries.length * turnCount);
      for (const [selection, seed] of seeds) {
        const variant = selection % entries.length;
        const turn = (Math.floor(selection / entries.length) * (turnCount === 2 ? 2 : 1)) as 0 | 1 | 2 | 3;
        const layout = await cutters[style].generate(image, { difficulty: grid as PuzzleSizeId, rows, columns, seed, boardMaxWidth: 330 });
        expect(layout.pieces).toHaveLength(rows * columns);
        expect(layout.cutDescriptor?.bakedLibraryVersion).toBe(2);
        const expected = generateBiomorphicPiecesFromTopology(decodeBakedCut(entries[variant], turn), layout.boardSize.width, layout.boardSize.height);
        expect(layout.pieces).toEqual(expected);
        expect(layout.pieces.every(piece => !/NaN|Infinity/.test(piece.path))).toBe(true);
        const engine = new PuzzleEngine(layout);
        const serialized = serializePuzzleSession({ cutterId: cutters[style].meta.id,
          difficulty: grid as PuzzleSizeId, guideMode: 'cuts', engine: engine.getSnapshot() }, 1_000);
        largestSerializedSessionBytes = Math.max(largestSerializedSessionBytes, Buffer.byteLength(serialized));
        const saved = deserializePuzzleSession(serialized);
        expect(saved, `${style}/${grid}: persisted session rejected`).not.toBeNull();
        expect(saved!.engine.layout).toEqual(layout);
        expect(PuzzleEngine.fromSnapshot(saved!.engine).getSnapshot().pieces).toEqual(engine.getSnapshot().pieces);
        const restored = await cutters[style].generate(image, { difficulty: grid as PuzzleSizeId,
          cutDescriptor: saved!.engine.layout.cutDescriptor, boardMaxWidth: 660 });
        const resizedExpected = generateBiomorphicPiecesFromTopology(decodeBakedCut(entries[variant], turn), restored.boardSize.width, restored.boardSize.height);
        expect(restored.cutDescriptor).toEqual(layout.cutDescriptor);
        expect(restored.pieces).toEqual(resizedExpected);
        layouts++; restoredLayouts++;
      }
    }
    const sourceFiles = ['scripts/cuts/verifyComplexBundle.test.ts', 'src/puzzle/cutters/biomorphic/BiomorphicCutter.ts',
      'src/puzzle/cutters/amoeba/AmoebaCutter.ts', 'src/puzzle/cutters/biomorphic/createPhaseFieldCutter.ts',
      'src/puzzle/cutters/biomorphic/bakedCutSource.ts', 'src/puzzle/cutters/biomorphic/bakedCutLibrary.ts',
      'src/puzzle/cutters/resolveBoardSize.ts', 'src/puzzle/persistence/PuzzleSessionPersistence.ts',
      'src/puzzle/engine/PuzzleEngine.ts', 'src/puzzle/engine/shuffle.ts',
      'src/puzzle/cutters/biomorphic/cutStyles.ts', 'src/puzzle/cutters/biomorphic/phaseFieldLabConfig.ts'];
    writeFileSync(`${root}/game-verification.json`, JSON.stringify({ checkedAt: new Date().toISOString(),
      reviewSourceFingerprint: summary.sourceFingerprint,
      verificationSourceFingerprint: sha256(sourceFiles.map(file => `${file}\n${readFileSync(file, 'utf8')}`).join('\n')),
      planPath, planSha256: sha256(planRaw), independentGeometries: expectedIds.length,
      layouts, restoredLayouts, largestSerializedSessionBytes, bundle,
      bakeRecipes: CUT_STYLES.filter(style => plan.styles.includes(style.id)).map(style => ({
        style: style.id, profile: style.profile,
        numerics: { ...BIOMORPHIC_PHASE_FIELD_NUMERICS, samplesPerPiece: style.samplesPerPiece },
        seedPattern: `${style.id}-ROWSxCOLUMNS-VARIANT`,
      })),
      note: 'App cutters, engine creation, full persistence round trips and descriptor resize checks. No native Skia or physical-device claim.' }, null, 2));
  }, 120_000);
});
