// Uploads the remote boards of a catalog to the frume-cuts R2 bucket.
//
//   node scripts/cuts/uploadRemoteCuts.mjs <catalog-version>
//
// A catalog marks boards of 100+ pieces remote; the app fetches them from the
// photo API at /cuts/<key>, where <key> is the payload's path under assets/.
// Keys never change content (catalogs are immutable), so re-running is safe.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const REMOTE_MIN_PIECES = 100;
const version = Number(process.argv[2]);
if (!Number.isSafeInteger(version) || version < 1) {
  throw new Error('Usage: node scripts/cuts/uploadRemoteCuts.mjs <catalog-version>');
}
const catalog = JSON.parse(readFileSync(`assets/cut-catalogs/${version}.json`, 'utf8'));
let uploaded = 0;
for (const [key, files] of Object.entries(catalog.entries)) {
  const [rows, columns] = key.split('/')[1].split('x').map(Number);
  if (rows * columns < REMOTE_MIN_PIECES) continue;
  for (const file of files) {
    const raw = readFileSync(file.file, 'utf8');
    if (createHash('sha256').update(raw).digest('hex') !== file.sha256) {
      throw new Error(`${file.file} does not match catalog ${version}`);
    }
    const objectKey = relative(resolve('assets'), resolve(file.file));
    execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `frume-cuts/${objectKey}`,
      '--file', resolve(file.file), '--content-type', 'application/json', '--remote'],
      { cwd: 'server', stdio: 'ignore' });
    uploaded += 1;
  }
}
console.log(`Uploaded ${uploaded} remote boards for catalog ${version}`);
