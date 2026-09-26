import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'vitest';
import { auditCut } from '../../src/puzzle/cutters/biomorphic/auditCut';
import { decodeBakedCut, encodeBakedCut } from '../../src/puzzle/cutters/biomorphic/bakedCut';
import { resolveCutRecipe, type CutRecipeId } from '../../src/puzzle/cutters/biomorphic/cutRecipes';
import { createBiomorphicPhaseFieldTopology } from '../../src/puzzle/cutters/biomorphic/generateBiomorphicPhaseField';
import { generateBiomorphicPiecesFromTopology } from '../../src/puzzle/cutters/biomorphic/generateBiomorphic';
import { assertBakedCutAccepted, prepareBakedCut } from '../../src/puzzle/cutters/biomorphic/prepareBakedCut';
import { renderCut } from './renderCut';

type Case = { recipe: CutRecipeId; grid: number; seed: string; samplesPerPiece?: number };
const output = process.env.FRUME_CUT_STUDY_OUT;
const cases: Case[] = process.env.FRUME_CUT_STUDY_CASES ? JSON.parse(process.env.FRUME_CUT_STUDY_CASES) :
  (['organic-v1', 'rounded-v1'] as const).flatMap(recipe => [5, 7, 10].flatMap(grid =>
    Array.from({ length: 12 }, (_, i) => ({ recipe, grid, seed: `cut-study-${String(i).padStart(2, '0')}` }))));

/** Explicitly opt in; ordinary test runs never perform a bake or write assets. */
describe.skipIf(!output)('offline cut study (acceptance is recorded in receipts)', () => {
  for (const item of cases) it(`${item.recipe}/${item.grid}/${item.seed}/${item.samplesPerPiece ?? 48}`, () => {
    const settings = resolveCutRecipe(item.recipe, item.grid, item.grid, item.seed, item.samplesPerPiece);
    const sourceFiles = ['auditCut.ts', 'cutGeometry.ts', 'prepareBakedCut.ts', 'bakedCut.ts', 'cutRecipes.ts',
      'generateBiomorphic.ts', 'generateBiomorphicPhaseField.ts', 'phaseFieldLabConfig.ts'];
    const sourceHash = createHash('sha256');
    for (const file of sourceFiles) sourceHash.update(file).update(readFileSync(`src/puzzle/cutters/biomorphic/${file}`, 'utf8'));
    for (const file of ['scripts/cuts/benchmark.test.ts', 'scripts/cuts/renderCut.ts']) sourceHash.update(file).update(readFileSync(file, 'utf8'));
    const sourceFingerprint = sourceHash.digest('hex');
    const id = `${item.recipe}-${item.grid}x${item.grid}-${item.seed}-${settings.numerics.samplesPerPiece}`;
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Unsafe study case name');
    const directory = resolve(output!), receiptPath = `${directory}/${id}.receipt.json`;
    mkdirSync(directory, { recursive: true });
    if (existsSync(receiptPath)) {
      const prior = JSON.parse(readFileSync(receiptPath, 'utf8'));
      if (JSON.stringify(prior.settings) === JSON.stringify(settings) && prior.sourceFingerprint === sourceFingerprint) {
        if (prior.status === 'accepted') assertBakedCutAccepted(JSON.parse(readFileSync(`${directory}/accepted/${id}.json`, 'utf8')));
        return;
      }
      throw new Error(`Existing receipt has different inputs: ${receiptPath}; choose a new study directory`);
    }
    const extractionAttempts: { smoothingPasses: number; safe: boolean; error?: string }[] = [];
    const receipt: Record<string, unknown> = { id, settings, sourceFingerprint,
      revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      node: process.version, startedAt: new Date().toISOString(), extractionAttempts };
    const started = performance.now();
    try {
      const raw = createBiomorphicPhaseFieldTopology(item.grid, item.grid, item.seed, settings.style,
        settings.profile, settings.numerics, attempt => extractionAttempts.push(attempt));
      receipt.generationMs = performance.now() - started;
      const rawBaked = encodeBakedCut(raw), decoded = decodeBakedCut(rawBaked);
      writeFileSync(`${directory}/${id}.before.json`, JSON.stringify(rawBaked));
      const prepared = prepareBakedCut(raw);
      receipt.status = prepared.accepted ? 'accepted' : 'rejected';
      receipt.before = prepared.before; receipt.after = prepared.audit; receipt.repair = prepared.repair;
      if (prepared.baked) {
        const pieces = generateBiomorphicPiecesFromTopology(prepared.topology, 330, 330);
        if (pieces.length !== item.grid * item.grid) throw new Error('Game geometry lost a piece');
        receipt.gamePieceCount = pieces.length;
        mkdirSync(`${directory}/accepted`, { recursive: true });
        writeFileSync(`${directory}/accepted/${id}.json`, JSON.stringify(prepared.baked));
      }
      const photo = `data:image/jpeg;base64,${readFileSync('assets/categories/nature.jpg').toString('base64')}`;
      writeFileSync(`${directory}/${id}.svg`, renderCut(prepared.topology, decoded, prepared.audit,
        auditCut(decoded), `${item.recipe} · ${item.grid * item.grid} pieces · ${item.seed}`, photo));
    } catch (error) {
      receipt.status = 'failed'; receipt.error = error instanceof Error ? error.stack : String(error);
    }
    receipt.totalMs = performance.now() - started;
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
    console.log(`${id}: ${receipt.status} (${(Number(receipt.totalMs) / 1000).toFixed(1)}s)`);
  }, 3_600_000);
});
