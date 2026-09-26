import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const [installedPath, largePath, outputPath] = process.argv.slice(2);
if (!installedPath || !largePath || !outputPath) throw new Error('Usage: node exportComplexCandidates.mjs <installed-review> <large-review> <output>');
const output = resolve(outputPath);
if (!relative(resolve('assets/cuts'), output).startsWith('..')) throw new Error('Candidate export must stay outside the installed cut library');
if (existsSync(output)) throw new Error('Choose a fresh candidate export directory');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const installed = JSON.parse(readFileSync(`${installedPath}/summary.json`, 'utf8'));
const large = JSON.parse(readFileSync(`${largePath}/summary.json`, 'utf8'));
const game = JSON.parse(readFileSync(`${largePath}/game-verification.json`, 'utf8'));
const planRaw = readFileSync(game.planPath, 'utf8'), plan = JSON.parse(planRaw);
if (sha256(planRaw) !== game.planSha256 || !game.bakeRecipes?.length) throw new Error('Changed generation plan or missing recipe provenance');
if (game.reviewSourceFingerprint !== large.sourceFingerprint || game.independentGeometries !== large.records.length ||
    large.records.some(record => !record.accepted)) throw new Error('Large batch is incomplete, rejected or not verified through the app cutters');
const sources = [{ directory: installedPath, records: installed.records.filter(record => record.changed), kind: 'local-correction' },
  { directory: largePath, records: large.records, kind: 'new-size' }];
const entries = [];
// Verify every payload before starting the export.
for (const source of sources) for (const record of source.records) {
  if (!record.accepted) throw new Error(`Rejected candidate: ${record.id}`);
  const raw = readFileSync(`${source.directory}/${record.outputFile}`, 'utf8');
  if (sha256(raw) !== record.outputSha256 || sha256(readFileSync(record.path, 'utf8')) !== record.inputSha256) throw new Error(`Changed geometry: ${record.id}`);
  entries.push({ record, raw, kind: source.kind, file: `${record.style}/${record.grid}/${record.variant}.json` });
}
if (new Set(entries.map(entry => entry.file)).size !== entries.length) throw new Error('Duplicate export path');
mkdirSync(output, { recursive: true });
for (const entry of entries) {
  const target = `${output}/${entry.file}`; mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, entry.raw);
}
const manifest = {
  purpose: 'Reviewed complex cut payloads for an immutable versioned catalog.',
  generatedAt: new Date().toISOString(),
  installedReviewSourceFingerprint: installed.sourceFingerprint,
  largeReviewSourceFingerprint: large.sourceFingerprint,
  gameVerificationSourceFingerprint: game.verificationSourceFingerprint,
  generationPlan: { sourceFingerprint: plan.sourceFingerprint, generatorSha256: plan.generatorSha256,
    styles: plan.styles, grids: plan.grids, seedOffset: plan.seedOffset ?? 0 },
  bakeRecipes: game.bakeRecipes,
  independentNewGeometries: game.independentGeometries,
  correctedExistingGeometries: entries.filter(entry => entry.kind === 'local-correction').length,
  appLayoutsChecked: game.layouts, restoredLayoutsChecked: game.restoredLayouts,
  options: JSON.parse(readFileSync(`${largePath}/manifest.json`, 'utf8')).options,
  entries: entries.map(({ record, raw, kind, file }) => ({ id: record.id, kind, style: record.style,
    grid: record.grid, variant: record.variant, file, bytes: Buffer.byteLength(raw),
    inputSha256: record.inputSha256, outputSha256: record.outputSha256,
    before: { affectedPieces: record.before.pinches.length, contacts: record.before.crossings.length },
    after: { affectedPieces: record.after.pinches.length, contacts: record.after.crossings.length,
      pointedJunctions: record.after.junctionTips.length, topologyErrors: record.after.topologyErrors },
    shapeChange: record.shapeChange })),
};
writeFileSync(`${output}/manifest.json`, JSON.stringify(manifest, null, 2));
writeFileSync(`${output}/README.md`, `# Reviewed complex cuts\n\nThis export retains ${manifest.independentNewGeometries} independently generated large cuts and ${manifest.correctedExistingGeometries} locally corrected existing cuts. All six original styles keep their profiles and 96 samples per piece.\n\nThe JSON payloads passed decoded-geometry and rotation checks. The large batch also passed ${game.layouts} app-cutter layouts and ${game.restoredLayouts} descriptor restores at a different board size. Physical-device interaction remains separate.\n\nAn immutable catalog under \`assets/cut-catalogs\` selects these payloads for new games. Saved descriptors pin their catalog; versionless historical descriptors retain catalog 1. The original 168 geometries remain available in \`assets/cuts\`.\n\nSee \`manifest.json\` for input/output hashes, local shape changes and verification fingerprints. See \`scripts/cuts/README.md\` for the generation and review workflow. Variant indices in filenames start at zero; the visual reviewer numbers them from one.\n`);
console.log(`${entries.length} candidate files (${entries.reduce((sum, entry) => sum + Buffer.byteLength(entry.raw), 0)} bytes): ${output}`);
