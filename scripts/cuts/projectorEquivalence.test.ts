import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { encodeBakedCut } from '../../src/puzzle/cutters/biomorphic/bakedCut';
import { getCutStyle, CUT_STYLES, type CutStyleId } from '../../src/puzzle/cutters/biomorphic/cutStyles';
import { createBiomorphicPhaseFieldTopology } from '../../src/puzzle/cutters/biomorphic/generateBiomorphicPhaseField';
import { BIOMORPHIC_PHASE_FIELD_NUMERICS } from '../../src/puzzle/cutters/biomorphic/phaseFieldLabConfig';

const out = process.env.FRUME_PROJECTOR_COMPARE_OUT;
const baselinePath = process.env.FRUME_PROJECTOR_BASELINE;
type Case = { style: CutStyleId; grid: number; seed: string; samplesPerPiece: number; baselineCut?: string };
const cases: Case[] = out ? JSON.parse(process.env.FRUME_PROJECTOR_COMPARE_CASES ?? JSON.stringify(CUT_STYLES.map(style => ({
  style: style.id, grid: 3, seed: `projector-cache-${style.id}`, samplesPerPiece: 96,
})))) : [];
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Compare exact serialized geometry against a frozen solver or a recorded bake. */
describe.skipIf(!out)('cached projector ownership preserves generation', () => {
  const records: Record<string, unknown>[] = [];
  for (const settings of cases) it(`${settings.style}-${settings.grid}-${settings.seed}`, async () => {
    const directory = resolve(out!); mkdirSync(directory, { recursive: true });
    const style = getCutStyle(settings.style);
    const numerics = { ...BIOMORPHIC_PHASE_FIELD_NUMERICS, samplesPerPiece: settings.samplesPerPiece };
    let original: string, baselineMs: number | undefined;
    if (settings.baselineCut) original = JSON.stringify(JSON.parse(readFileSync(settings.baselineCut, 'utf8')));
    else {
      if (!baselinePath) throw new Error('A frozen baseline source or baselineCut is required');
      const baseline = await import(pathToFileURL(resolve(baselinePath)).href);
      const started = performance.now();
      original = JSON.stringify(encodeBakedCut(baseline.createBiomorphicPhaseFieldTopology(settings.grid, settings.grid,
        settings.seed, 'dendrite', style.profile, numerics)));
      baselineMs = performance.now() - started;
    }
    const started = performance.now();
    const candidate = JSON.stringify(encodeBakedCut(createBiomorphicPhaseFieldTopology(settings.grid, settings.grid,
      settings.seed, 'dendrite', style.profile, numerics)));
    const candidateMs = performance.now() - started;
    const record = { settings, baselineMs, candidateMs, baselineSha256: sha256(original), candidateSha256: sha256(candidate),
      identical: candidate === original,
      candidateSourceSha256: sha256(readFileSync('src/puzzle/cutters/biomorphic/generateBiomorphicPhaseField.ts', 'utf8')),
      baselineSourceSha256: baselinePath ? sha256(readFileSync(baselinePath, 'utf8')) : undefined };
    records.push(record);
    writeFileSync(`${directory}/${settings.style}-${settings.grid}-${sha256(settings.seed).slice(0, 8)}.json`, JSON.stringify(record, null, 2));
    expect(candidate, JSON.stringify(record)).toBe(original);
  }, 3_600_000);
  afterAll(() => { if (out) writeFileSync(`${resolve(out)}/summary.json`, JSON.stringify({ records }, null, 2)); });
});
