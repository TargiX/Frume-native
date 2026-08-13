import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const repoDirectory = new URL('..', import.meta.url).pathname;

test('signed archive cannot enter reviewed stage with forgeable env and a copied tree', () => {
  const fakeSource = mkdtempSync(join(tmpdir(), 'frume-fake-reviewed-stage-'));
  const fakeScripts = join(fakeSource, 'scripts');
  mkdirSync(fakeScripts);
  for (const name of [
    'archive-ios-release.sh',
    'is-direct-cli.mjs',
    'validate-production-photo-api-url.mjs',
    'validate-apple-toolchain.mjs',
    'validate-release-revision.mjs',
    'validate-revenuecat-ios-release.mjs',
  ]) {
    copyFileSync(join(repoDirectory, 'scripts', name), join(fakeScripts, name));
  }
  chmodSync(join(fakeScripts, 'archive-ios-release.sh'), 0o755);

  try {
    const result = spawnSync(join(fakeScripts, 'archive-ios-release.sh'), {
      encoding: 'utf8',
      env: {
        ...process.env,
        FRUME_RELEASE_SOURCE_STAGE: '1',
        FRUME_RELEASE_SOURCE_DIR: fakeSource,
        FRUME_RELEASE_HANDOFF_PATH: join(
          fakeSource,
          '.frume-release-handoff.json',
        ),
        FRUME_DEVELOPMENT_TEAM: 'TESTTEAM',
        FRUME_BUILD_NUMBER: '3',
        FRUME_REVIEWED_RELEASE_SHA: '0'.repeat(40),
        FRUME_EXPECTED_PHOTO_API_DEPLOYMENT_ID:
          'frume-photo-api-reviewed-a1b2c3d4',
        EXPO_PUBLIC_PHOTO_API_URL: 'https://photos.example.com',
        EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: `appl_${'a'.repeat(24)}`,
        EXPO_PUBLIC_REVENUECAT_IOS_PREMIUM_CUTS_PRODUCT_ID:
          'frume_premium_cuts',
        EXPO_PUBLIC_PRIVACY_URL: 'https://frume.example/privacy',
        EXPO_PUBLIC_SUPPORT_URL: 'https://frume.example/support',
      },
    });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /Reviewed release source stage is invalid/);
    assert.doesNotMatch(result.stdout, /Using pristine reviewed source/);
  } finally {
    rmSync(fakeSource, { recursive: true, force: true });
  }
});

test('self-consistent forged handoff cannot replace canonical release source', () => {
  const fakeSource = mkdtempSync(join(tmpdir(), 'frume-forged-handoff-stage-'));
  const fakeScripts = join(fakeSource, 'scripts');
  mkdirSync(fakeScripts);
  for (const name of [
    'archive-ios-release.sh',
    'is-direct-cli.mjs',
    'validate-production-photo-api-url.mjs',
    'validate-apple-toolchain.mjs',
    'validate-release-revision.mjs',
    'validate-revenuecat-ios-release.mjs',
  ]) {
    copyFileSync(join(repoDirectory, 'scripts', name), join(fakeScripts, name));
  }
  chmodSync(join(fakeScripts, 'archive-ios-release.sh'), 0o755);
  const handoffPath = join(fakeSource, '.frume-release-handoff.json');
  const fakeBin = join(fakeSource, '.test-bin');
  mkdirSync(fakeBin);
  const fakeNodePath = join(fakeBin, 'node');
  const reviewedSha = '1'.repeat(40);

  function walk(directory, prefix = '') {
    const lines = [];
    for (const entry of readdirSync(directory, {
      withFileTypes: true,
    })) {
      if (!prefix && entry.name === '.frume-release-handoff.json') continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) lines.push(...walk(absolute, relative));
      else {
        const contents = readFileSync(absolute);
        const header = Buffer.from(`blob ${contents.length}\0`);
        const oid = createHash('sha1').update(header).update(contents).digest('hex');
        const mode = statSync(absolute).mode & 0o111 ? '100755' : '100644';
        lines.push(`${mode} ${oid}\t${relative}`);
      }
    }
    return lines;
  }

  try {
    writeFileSync(
      fakeNodePath,
      `#!/bin/sh
if [ "\${FRUME_VERIFY_CANONICAL_MANIFEST:-}" = "1" ]; then
  printf '%s\\n' '${JSON.stringify({
    reviewedSha,
    entryCount: 999,
    manifestDigest: 'f'.repeat(64),
  })}'
  exit 0
fi
exec ${JSON.stringify(process.execPath)} "$@"
`,
    );
    chmodSync(fakeNodePath, 0o755);
    const manifestDigest = createHash('sha256')
      .update(
        walk(fakeSource)
          .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
          .join('\n'),
      )
      .digest('hex');
    writeFileSync(
      handoffPath,
      JSON.stringify({
        reviewedSha,
        sourceDirectory: realpathSync(fakeSource),
        manifestDigest,
        nonce: 'a'.repeat(64),
      }),
    );
    const result = spawnSync(join(fakeScripts, 'archive-ios-release.sh'), {
      encoding: 'utf8',
      env: {
        ...process.env,
        FRUME_RELEASE_SOURCE_STAGE: '1',
        FRUME_RELEASE_SOURCE_DIR: realpathSync(fakeSource),
        FRUME_RELEASE_HANDOFF_PATH: realpathSync(handoffPath),
        FRUME_DEVELOPMENT_TEAM: 'TESTTEAM',
        FRUME_BUILD_NUMBER: '3',
        FRUME_REVIEWED_RELEASE_SHA: reviewedSha,
        FRUME_EXPECTED_PHOTO_API_DEPLOYMENT_ID:
          'frume-photo-api-reviewed-a1b2c3d4',
        EXPO_PUBLIC_PHOTO_API_URL: 'https://photos.example.com',
        EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: `appl_${'a'.repeat(24)}`,
        EXPO_PUBLIC_REVENUECAT_IOS_PREMIUM_CUTS_PRODUCT_ID:
          'frume_premium_cuts',
        EXPO_PUBLIC_PRIVACY_URL: 'https://frume.example/privacy',
        EXPO_PUBLIC_SUPPORT_URL: 'https://frume.example/support',
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      },
    });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /Reviewed release tree does not match canonical main/);
    assert.doesNotMatch(result.stderr, /MODULE_NOT_FOUND/);
    assert.doesNotMatch(result.stdout, /Running the complete release check/);
  } finally {
    rmSync(fakeSource, { recursive: true, force: true });
  }
});
