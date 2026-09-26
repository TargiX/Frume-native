import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'vitest';
import { decodeBakedCut } from '../../src/puzzle/cutters/biomorphic/bakedCut';
import { prepareBakedCut } from '../../src/puzzle/cutters/biomorphic/prepareBakedCut';
import { generateBiomorphicPiecesFromTopology } from '../../src/puzzle/cutters/biomorphic/generateBiomorphic';
import { renderCut } from './renderCut';

const from = process.env.FRUME_CUT_REVALIDATE_FROM;
const to = process.env.FRUME_CUT_REVALIDATE_TO;
const files = from && to ? readdirSync(from).filter(f => f.endsWith('.receipt.json')) : [];

/** Reuse recorded simulation output; preserve its provenance and every refusal. */
describe.skipIf(!from || !to)('revalidate recorded cut geometry', () => {
  for (const file of files) it(file, () => {
    if (resolve(from!) === resolve(to!)) throw new Error('Revalidation needs a separate output directory');
    const original = JSON.parse(readFileSync(`${from}/${file}`, 'utf8'));
    const hash = createHash('sha256');
    for (const name of ['auditCut.ts', 'cutGeometry.ts', 'prepareBakedCut.ts', 'bakedCut.ts', 'generateBiomorphic.ts', 'generateBiomorphicPhaseField.ts']) {
      hash.update(name).update(readFileSync(`src/puzzle/cutters/biomorphic/${name}`, 'utf8'));
    }
    for (const name of ['scripts/cuts/revalidate.test.ts', 'scripts/cuts/renderCut.ts']) hash.update(name).update(readFileSync(name, 'utf8'));
    const sourceFingerprint = hash.digest('hex');
    const directory = resolve(to!);
    mkdirSync(directory, { recursive: true });
    const target = `${directory}/${file}`;
    if (existsSync(target)) throw new Error(`Refusing to overwrite a revalidation receipt: ${target}`);
    const receipt = { ...original, initialStatus: original.status,
      originalReceipt: resolve(from!, file), simulationSourceFingerprint: original.simulationSourceFingerprint ?? original.sourceFingerprint,
      sourceFingerprint, stage: 'revalidation', revalidatedAt: new Date().toISOString() };
    if (original.status === 'failed') { writeFileSync(target, JSON.stringify(receipt, null, 2)); return; }
    const raw = readFileSync(`${from}/${original.id}.before.json`, 'utf8');
    receipt.inputGeometrySha256 = createHash('sha256').update(raw).digest('hex');
    writeFileSync(`${directory}/${original.id}.before.json`, raw);
    const before = decodeBakedCut(JSON.parse(raw));
    const started = performance.now();
    const prepared = prepareBakedCut(before);
    receipt.validationMs = performance.now() - started;
    receipt.totalMs = original.generationMs + receipt.validationMs;
    receipt.status = prepared.accepted ? 'accepted' : 'rejected';
    receipt.before = prepared.before; receipt.after = prepared.audit; receipt.repair = prepared.repair;
    if (prepared.baked) {
      const pieces = generateBiomorphicPiecesFromTopology(prepared.topology, 330, 330);
      if (pieces.length !== original.settings.rows * original.settings.columns) throw new Error('Game geometry lost a piece');
      receipt.gamePieceCount = pieces.length;
      mkdirSync(`${directory}/accepted`, { recursive: true });
      writeFileSync(`${directory}/accepted/${original.id}.json`, JSON.stringify(prepared.baked));
    }
    const photo = `data:image/jpeg;base64,${readFileSync('assets/categories/nature.jpg').toString('base64')}`;
    writeFileSync(`${directory}/${original.id}.svg`, renderCut(prepared.topology, before, prepared.audit, prepared.before,
      `${original.settings.name} · ${original.settings.rows * original.settings.columns} pieces · ${original.settings.seed}`, photo));
    writeFileSync(target, JSON.stringify(receipt, null, 2));
  }, 120_000);
});
