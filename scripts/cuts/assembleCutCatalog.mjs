import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const [versionText, baseText, assetPath] = process.argv.slice(2);
const version = Number(versionText), baseVersion = Number(baseText);
if (!assetPath || !Number.isSafeInteger(version) || !Number.isSafeInteger(baseVersion) || baseVersion < 1 || version <= baseVersion) {
  throw new Error('Usage: node assembleCutCatalog.mjs <new-version> <base-version> <reviewed-asset-root>');
}
const REMOTE_MIN_PIECES = 100;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const directory = 'src/puzzle/cutters/biomorphic';
const root = resolve(assetPath), assetManifestRaw = readFileSync(`${root}/manifest.json`, 'utf8');
if (relative(resolve('.'), root).startsWith('..')) throw new Error('Catalog assets must be inside this checkout');
const reviewed = JSON.parse(assetManifestRaw);
const base = JSON.parse(readFileSync(`assets/cut-catalogs/${baseVersion}.json`, 'utf8'));
if (base.version !== baseVersion || !reviewed.largeReviewSourceFingerprint || !reviewed.gameVerificationSourceFingerprint) throw new Error('Missing reviewed catalog provenance');
const entries = structuredClone(base.entries);
for (const candidate of [...reviewed.entries].sort((a,b) => a.file.localeCompare(b.file,undefined,{numeric:true}))) {
  if (!/^[a-z]+(?:-[a-z]+)*$/.test(candidate.style) || !/^\d+x\d+$/.test(candidate.grid) || !Number.isSafeInteger(candidate.variant) || candidate.variant < 0) throw new Error('Invalid candidate identity');
  if (!['local-correction', 'new-size'].includes(candidate.kind)) throw new Error('Unknown reviewed change kind');
  const key = `${candidate.style}/${candidate.grid}`, index = candidate.variant;
  const path = resolve(root, candidate.file);
  if (relative(root, path).startsWith('..')) throw new Error('Candidate escapes asset directory');
  const raw = readFileSync(path, 'utf8'), baked = JSON.parse(raw);
  if (sha256(raw) !== candidate.outputSha256 || candidate.grid !== `${baked.rows}x${baked.columns}`) throw new Error(`Invalid payload: ${candidate.id}`);
  const old = entries[key]?.[index];
  if (candidate.kind === 'local-correction') {
    if (!old || old.sha256 !== candidate.inputSha256) throw new Error(`Correction does not match base catalog: ${candidate.id}`);
  } else if (old || index !== (entries[key]?.length ?? 0)) throw new Error(`Duplicate or non-contiguous variant: ${candidate.id}`);
  entries[key] ??= [];
  entries[key][index] = { file: relative(resolve('.'), path), sha256: candidate.outputSha256 };
}
// A frozen catalog references every payload by a content hash, including the
// unchanged files inherited from its predecessor.
for (const files of Object.values(entries)) for (const file of files) {
  if (sha256(readFileSync(file.file, 'utf8')) !== file.sha256) throw new Error(`Changed catalog asset: ${file.file}`);
}
const sorted = Object.fromEntries(Object.keys(entries).sort().map(key => [key, entries[key]]));
const catalog = { version, predecessor: baseVersion, assetManifest: relative(resolve('.'), `${root}/manifest.json`),
  assetManifestSha256: sha256(assetManifestRaw), entries: sorted };
const byStyle = new Map();
for (const [key, files] of Object.entries(sorted)) {
  const [style, grid] = key.split('/'); const grids = byStyle.get(style) ?? [];
  // Boards of REMOTE_MIN_PIECES and up are served by the photo API from R2
  // (key = path under assets/) and fetched the first time they are played;
  // the smaller ones ship in the app so a first puzzle never needs a network.
  const [rows, columns] = grid.split('x').map(Number);
  const required = files.map(file => rows * columns >= REMOTE_MIN_PIECES
    ? `{ remote: { key: ${JSON.stringify(relative(resolve('assets'), resolve(file.file)))}, sha256: ${JSON.stringify(file.sha256)} } }`
    : `require(${JSON.stringify(relative(resolve(directory), resolve(file.file)))}) as BakedCut`);
  grids.push(`    ${JSON.stringify(grid)}: [${required.join(', ')}],`); byStyle.set(style, grids);
}
const module = `// Frozen catalog ${version}. Add a new version to change pools or geometry.\nimport type { BakedCut } from './bakedCut';\nimport type { BakedCutLibrary } from './bakedCutLibrary';\n\nexport const BAKED_CUT_LIBRARY_V${version}: BakedCutLibrary = {\n${[...byStyle].map(([style,grids]) => `  ${JSON.stringify(style)}: {\n${grids.join('\n')}\n  },`).join('\n')}\n};\n`;
function immutableWrite(file, content) {
  if (existsSync(file) && readFileSync(file, 'utf8') !== content) throw new Error(`Refusing to rewrite frozen catalog: ${file}`);
  if (!existsSync(file)) writeFileSync(file, content);
}
immutableWrite(`assets/cut-catalogs/${version}.json`, JSON.stringify(catalog, null, 2) + '\n');
immutableWrite(`${directory}/bakedLibrary.v${version}.ts`, module);
const versions = readdirSync('assets/cut-catalogs').filter(file => /^\d+\.json$/.test(file)).map(file => Number(file.slice(0,-5))).sort((a,b)=>a-b);
if (versions.some(v => !existsSync(`${directory}/bakedLibrary.v${v}.ts`))) throw new Error('Historical catalog module missing');
const facade = `// Current catalog selection. Historical catalogs remain immutable.\n${versions.map(v => `import { BAKED_CUT_LIBRARY_V${v} } from './bakedLibrary.v${v}';`).join('\n')}\n\nexport const BAKED_CUT_LIBRARY_VERSION = ${version};\nexport const BAKED_CUT_LIBRARY = BAKED_CUT_LIBRARY_V${version};\nexport const BAKED_CUT_LIBRARIES = { ${versions.map(v => `${v}: BAKED_CUT_LIBRARY_V${v}`).join(', ')} } as const;\n`;
writeFileSync(`${directory}/bakedLibrary.generated.ts`, facade);
console.log(`Catalog ${version}: ${Object.values(sorted).reduce((sum,files)=>sum+files.length,0)} cuts; historical versions ${versions.join(', ')}`);
