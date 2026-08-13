import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parsePublicHttpsUrl,
  validatePublicReleasePage,
} from './validate-public-release-pages.mjs';
import {
  REQUIRED_PHOTO_API_HEALTH_CHECKS,
  validatePhotoApiHealthPayload,
  validateProductionPhotoApiHealth,
} from './validate-production-photo-api-health.mjs';
import {
  PREMIUM_CUTS_ENTITLEMENT_ID,
  validateIosPremiumProductId,
  validateIosRevenueCatKey,
  validateRevenueCatBundle,
  validateRevenueCatBundleFile,
} from './validate-revenuecat-ios-release.mjs';
import {
  npmVersionFromUserAgent,
  validateToolchain,
} from './validate-toolchain.mjs';
import {
  parseXcodeVersion,
  validateAppleToolchain,
} from './validate-apple-toolchain.mjs';
import { validateReleaseRevision } from './validate-release-revision.mjs';

const iosKey = `appl_${'a'.repeat(24)}`;
const premiumProductId = 'frume_premium_cuts';
const reviewedRevenueCatStrings = [
  iosKey,
  premiumProductId,
  PREMIUM_CUTS_ENTITLEMENT_ID,
];
const repoDirectory = fileURLToPath(new URL('..', import.meta.url));

function response(status, { body = '', contentType = 'text/html', location } = {}) {
  return {
    status,
    headers: new Headers({
      ...(contentType ? { 'content-type': contentType } : {}),
      ...(location ? { location } : {}),
    }),
    text: async () => body,
  };
}

test('toolchain contract accepts only the pinned Node and npm versions', () => {
  assert.equal(
    npmVersionFromUserAgent('npm/11.13.0 node/v24.16.0 darwin arm64'),
    '11.13.0',
  );
  assert.doesNotThrow(() =>
    validateToolchain({
      actualNodeVersion: '24.16.0',
      actualNpmVersion: '11.13.0',
      expectedNodeVersion: '24.16.0',
      expectedNpmVersion: '11.13.0',
    }),
  );
  assert.throws(
    () =>
      validateToolchain({
        actualNodeVersion: '24.15.0',
        actualNpmVersion: '11.13.0',
        expectedNodeVersion: '24.16.0',
        expectedNpmVersion: '11.13.0',
      }),
    /requires Node 24\.16\.0/,
  );
  assert.throws(
    () =>
      validateToolchain({
        actualNodeVersion: '24.16.0',
        actualNpmVersion: '11.12.0',
        expectedNodeVersion: '24.16.0',
        expectedNpmVersion: '11.13.0',
      }),
    /requires npm 11\.13\.0/,
  );
});

test('release CLIs execute through the macOS /tmp physical-path alias', () => {
  const fixtureDirectory = mkdtempSync('/tmp/frume-cli-realpath-');
  const scriptPath = join(
    fixtureDirectory,
    'validate-production-photo-api-health.mjs',
  );

  try {
    copyFileSync(
      join(repoDirectory, 'scripts', 'validate-production-photo-api-health.mjs'),
      scriptPath,
    );
    copyFileSync(
      join(repoDirectory, 'scripts', 'is-direct-cli.mjs'),
      join(fixtureDirectory, 'is-direct-cli.mjs'),
    );
    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        EXPO_PUBLIC_PHOTO_API_URL: '',
        FRUME_EXPECTED_PHOTO_API_DEPLOYMENT_ID: '',
      },
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /EXPO_PUBLIC_PHOTO_API_URL must be set/);
    assert.notEqual(result.stderr, '');
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test('Apple release toolchain accepts only the reviewed Xcode build', () => {
  const reviewed = parseXcodeVersion('Xcode 26.6\nBuild version 17F113\n');
  assert.deepEqual(reviewed, { version: '26.6', build: '17F113' });
  assert.doesNotThrow(() => validateAppleToolchain(reviewed));
  assert.throws(
    () => validateAppleToolchain({ version: '26.6', build: '17F114' }),
    /require Xcode 26\.6 \(17F113\)/,
  );
  assert.throws(
    () => parseXcodeVersion('Xcode 26.6 beta\nBuild version 17F113\nextra'),
    /Could not parse/,
  );
});

test('release provenance requires exact HEAD and live origin/main parity', () => {
  const sha = 'a'.repeat(40);
  assert.equal(
    validateReleaseRevision({
      head: sha,
      reviewedSha: sha,
      remoteSha: sha,
      isClean: true,
    }),
    sha,
  );
  assert.throws(
    () =>
      validateReleaseRevision({
        head: 'b'.repeat(40),
        reviewedSha: sha,
        remoteSha: sha,
        isClean: true,
      }),
    /HEAD does not equal/,
  );
  assert.throws(
    () =>
      validateReleaseRevision({
        head: sha,
        reviewedSha: sha,
        remoteSha: 'b'.repeat(40),
        isClean: true,
      }),
    /not the current origin\/main tip/,
  );
  assert.throws(
    () =>
      validateReleaseRevision({
        head: sha,
        reviewedSha: 'short',
        remoteSha: sha,
        isClean: true,
      }),
    /full 40-character/,
  );
  assert.throws(
    () =>
      validateReleaseRevision({
        head: sha,
        reviewedSha: sha,
        remoteSha: sha,
        isClean: true,
        unsafeIndexPaths: ['App.tsx'],
      }),
    /skip-worktree or assume-unchanged/,
  );
  assert.throws(
    () =>
      validateReleaseRevision({
        head: sha,
        reviewedSha: sha,
        remoteSha: sha,
        isClean: false,
      }),
    /clean working tree/,
  );
});

test('RevenueCat guard rejects absent, test, and other-platform keys', () => {
  assert.throws(() => validateIosRevenueCatKey(undefined), /must be set/);
  assert.throws(() => validateIosRevenueCatKey('test_1234567890'), /appl_/);
  assert.throws(() => validateIosRevenueCatKey('goog_1234567890'), /appl_/);
  assert.equal(validateIosRevenueCatKey(iosKey), iosKey);
  assert.throws(() => validateIosPremiumProductId(undefined), /must be set/);
  assert.throws(
    () => validateIosPremiumProductId('invalid product id'),
    /valid reviewed App Store product identifier/,
  );
  assert.equal(
    validateIosPremiumProductId(premiumProductId),
    premiumProductId,
  );
});

test('RevenueCat logical-string guard requires every reviewed premium identifier and no stale keys', () => {
  assert.doesNotThrow(() =>
    validateRevenueCatBundle(
      reviewedRevenueCatStrings,
      iosKey,
      premiumProductId,
    ),
  );
  assert.throws(
    () =>
      validateRevenueCatBundle(
        [iosKey, PREMIUM_CUTS_ENTITLEMENT_ID],
        iosKey,
        premiumProductId,
      ),
    /does not contain the reviewed iOS Premium Cuts product ID/,
  );
  assert.throws(
    () =>
      validateRevenueCatBundle(
        reviewedRevenueCatStrings,
        iosKey,
        'totally_wrong_but_valid',
      ),
    /does not contain the reviewed iOS Premium Cuts product ID/,
  );
  assert.throws(
    () =>
      validateRevenueCatBundle(
        [iosKey, premiumProductId],
        iosKey,
        premiumProductId,
      ),
    /does not contain the reviewed Premium Cuts entitlement ID/,
  );
  assert.throws(
    () =>
      validateRevenueCatBundle(
        [...reviewedRevenueCatStrings, `test_${'b'.repeat(24)}`],
        iosKey,
        premiumProductId,
      ),
    /unreviewed RevenueCat/,
  );
  assert.throws(
    () =>
      validateRevenueCatBundle(
        [...reviewedRevenueCatStrings, `goog_${'c'.repeat(24)}`],
        iosKey,
        premiumProductId,
      ),
    /unreviewed RevenueCat/,
  );
  assert.throws(
    () =>
      validateRevenueCatBundle(
        [...reviewedRevenueCatStrings, `mac_${'e'.repeat(24)}`],
        iosKey,
        premiumProductId,
      ),
    /unreviewed RevenueCat/,
  );
  assert.throws(
    () =>
      validateRevenueCatBundle(
        [...reviewedRevenueCatStrings, `sk_${'f'.repeat(24)}`],
        iosKey,
        premiumProductId,
      ),
    /unreviewed RevenueCat/,
  );
  assert.throws(
    () =>
      validateRevenueCatBundle(
        [...reviewedRevenueCatStrings, iosKey],
        iosKey,
        premiumProductId,
      ),
    /more than once/,
  );
});

test('RevenueCat logical-string guard ignores SDK identifiers', () => {
  const bundleStrings = [
    ...reviewedRevenueCatStrings,
    'mac_app_store',
    'test_store',
    'test_store_operation_session_',
    'selector.test_id',
  ];

  assert.doesNotThrow(() =>
    validateRevenueCatBundle(bundleStrings, iosKey, premiumProductId),
  );
});

test('RevenueCat Hermes bundle guard fails closed and validates logical strings', () => {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), 'frume-rc-guard-'));
  const bundlePath = join(fixtureDirectory, 'main.jsbundle');
  const fakeHermescPath = join(fixtureDirectory, 'hermesc');
  writeFileSync(bundlePath, 'Hermes bytecode fixture');

  try {
    writeFileSync(
      fakeHermescPath,
      `#!/bin/sh
cat <<'EOF'
Bytecode File Information:
Global String Table:
s1[ASCII, 0..12]: mac_app_store
s2[ASCII, 13..28]: selector.test_id
s3[ASCII, 29..57]: ${iosKey}
s4[ASCII, 58..76]: ${premiumProductId}
s5[ASCII, 77..95]: ${PREMIUM_CUTS_ENTITLEMENT_ID}
Array Buffer:
EOF
`,
    );
    chmodSync(fakeHermescPath, 0o755);

    assert.doesNotThrow(() =>
      validateRevenueCatBundleFile(bundlePath, iosKey, premiumProductId, {
        hermescPath: fakeHermescPath,
      }),
    );

    writeFileSync(fakeHermescPath, '#!/bin/sh\necho not-bytecode\n');
    assert.throws(
      () =>
        validateRevenueCatBundleFile(bundlePath, iosKey, premiumProductId, {
          hermescPath: fakeHermescPath,
        }),
      /could not be inspected as Hermes bytecode/,
    );

    writeFileSync(fakeHermescPath, '#!/bin/sh\nexit 9\n');
    assert.throws(
      () =>
        validateRevenueCatBundleFile(bundlePath, iosKey, premiumProductId, {
          hermescPath: fakeHermescPath,
        }),
      /Hermes bytecode inspection failed/,
    );
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test('RevenueCat guard validates a real vendored-Hermes bytecode fixture', () => {
  const platformDirectory =
    process.platform === 'darwin'
      ? 'osx-bin'
      : process.platform === 'linux'
        ? 'linux64-bin'
        : process.platform === 'win32'
          ? 'win64-bin'
          : undefined;
  assert.ok(platformDirectory, `Unsupported test platform: ${process.platform}`);

  const hermescPath = join(
    repoDirectory,
    'node_modules',
    'react-native',
    'sdks',
    'hermesc',
    platformDirectory,
    process.platform === 'win32' ? 'hermesc.exe' : 'hermesc',
  );
  const fixtureDirectory = mkdtempSync(join(tmpdir(), 'frume-rc-hbc-'));
  const sourcePath = join(fixtureDirectory, 'fixture.js');
  const bundlePath = join(fixtureDirectory, 'main.jsbundle');

  try {
    writeFileSync(
      sourcePath,
      `globalThis.keys = [${JSON.stringify(iosKey)}, ${JSON.stringify(premiumProductId)}, ${JSON.stringify(PREMIUM_CUTS_ENTITLEMENT_ID)}, "mac_app_store", "test_store_operation_session_", "selector.test_id"];`,
    );
    const compileResult = spawnSync(
      hermescPath,
      ['-O', '-emit-binary', '-out', bundlePath, sourcePath],
      { encoding: 'utf8' },
    );
    assert.equal(compileResult.status, 0, compileResult.stderr);
    assert.doesNotThrow(() =>
      validateRevenueCatBundleFile(bundlePath, iosKey, premiumProductId, {
        hermescPath,
      }),
    );
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test('archive preflight is wired to reject a RevenueCat test key', () => {
  const result = spawnSync('./scripts/archive-ios-release.sh', {
    cwd: repoDirectory,
    encoding: 'utf8',
    env: {
      ...process.env,
      FRUME_DEVELOPMENT_TEAM: 'TESTTEAM',
      FRUME_BUILD_NUMBER: '3',
      EXPO_PUBLIC_PHOTO_API_URL: 'https://photos.example.com',
      EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: `test_${'d'.repeat(24)}`,
      EXPO_PUBLIC_REVENUECAT_IOS_PREMIUM_CUTS_PRODUCT_ID: 'frume_premium_cuts',
      EXPO_PUBLIC_PRIVACY_URL: 'https://frume.example/privacy',
      EXPO_PUBLIC_SUPPORT_URL: 'https://frume.example/support',
    },
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /must be an iOS production public key/);
  assert.doesNotMatch(result.stdout + result.stderr, /clean working tree/);
});

test('archive fails closed without reviewed source and Worker deployment identities', () => {
  const result = spawnSync('./scripts/archive-ios-release.sh', {
    cwd: repoDirectory,
    encoding: 'utf8',
    env: {
      ...process.env,
      FRUME_DEVELOPMENT_TEAM: 'TESTTEAM',
      FRUME_BUILD_NUMBER: '3',
      EXPO_PUBLIC_PHOTO_API_URL: 'https://photos.example.com',
      EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: iosKey,
      EXPO_PUBLIC_REVENUECAT_IOS_PREMIUM_CUTS_PRODUCT_ID: premiumProductId,
      EXPO_PUBLIC_PRIVACY_URL: 'https://frume.example/privacy',
      EXPO_PUBLIC_SUPPORT_URL: 'https://frume.example/support',
      FRUME_REVIEWED_RELEASE_SHA: '',
      FRUME_EXPECTED_PHOTO_API_DEPLOYMENT_ID: '',
    },
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /FRUME_REVIEWED_RELEASE_SHA/);
  assert.doesNotMatch(result.stdout + result.stderr, /clean working tree/);
});

test('release entrypoints reject Node preload injection', () => {
  for (const script of [
    './scripts/archive-ios-release.sh',
    './scripts/build-ios-release-simulator.sh',
  ]) {
    const result = spawnSync(script, {
      cwd: repoDirectory,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_OPTIONS: '--require=/tmp/frume-release-preload-bypass.cjs',
      },
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Unset NODE_OPTIONS and NODE_PATH/);
  }
});

test('archive path always enforces live legal pages and dependency risk', () => {
  const archiveScript = readFileSync(
    new URL('./archive-ios-release.sh', import.meta.url),
    'utf8',
  );

  assert.match(
    archiveScript,
    /FRUME_VERIFY_PUBLIC_RELEASE_PAGES=1 node "\$public_pages_validator"/,
  );
  assert.match(archiveScript, /node "\$photo_api_health_validator"/);
  assert.match(archiveScript, /node "\$apple_toolchain_validator"/);
  assert.match(archiveScript, /node "\$release_revision_validator"/);
  assert.match(archiveScript, /FRUME_RELEASE_SOURCE_EXPORT="\$release_source_dir"/);
  assert.match(archiveScript, /FRUME_RELEASE_SOURCE_STAGE=1/);
  assert.match(
    archiveScript,
    /"\$release_source_dir\/scripts\/archive-ios-release\.sh"/,
  );
  assert.match(archiveScript, /npm run security:dependencies/);
  const rootCleanInstall = archiveScript.indexOf(
    'npm ci --ignore-scripts=false',
  );
  const workerCleanInstall = archiveScript.indexOf(
    'npm --prefix server ci --ignore-scripts=false',
  );
  const completeCheck = archiveScript.indexOf('npm run check');
  assert.ok(rootCleanInstall >= 0);
  assert.ok(workerCleanInstall > rootCleanInstall);
  assert.ok(completeCheck > workerCleanInstall);
});

test('remote EAS builds fail before installation until they reproduce archive guards', () => {
  const packageManifest = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );
  assert.equal(
    packageManifest.scripts['eas-build-pre-install'],
    'node ./scripts/guard-eas-build.mjs',
  );

  const result = spawnSync(process.execPath, ['./scripts/guard-eas-build.mjs'], {
    cwd: repoDirectory,
    encoding: 'utf8',
    env: { ...process.env, EAS_BUILD: 'true', EAS_BUILD_PLATFORM: 'ios' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Remote EAS builds are intentionally blocked/);
  assert.match(result.stderr, /npm run ios:archive/);
});

test('first Worker deployment keeps the public photo API disabled', () => {
  const workerConfiguration = readFileSync(
    new URL('../server/wrangler.jsonc', import.meta.url),
    'utf8',
  );

  assert.match(workerConfiguration, /"PHOTO_API_DISABLED": "1"/);
  assert.match(
    workerConfiguration,
    /"WORKERS_PAID_PLAN_CONFIRMED": "0"/,
  );
  assert.match(workerConfiguration, /"version_metadata"/);
  assert.match(workerConfiguration, /"binding": "CF_VERSION_METADATA"/);
  assert.doesNotMatch(workerConfiguration, /PHOTO_API_DEPLOYMENT_ID/);
});

test('Release simulator builds cannot import a developer dotenv implicitly', () => {
  const simulatorScript = readFileSync(
    new URL('./build-ios-release-simulator.sh', import.meta.url),
    'utf8',
  );

  assert.match(simulatorScript, /export EXPO_NO_DOTENV=1/);
  assert.match(
    simulatorScript,
    /npx expo prebuild --platform ios --clean/,
  );
  assert.match(
    simulatorScript,
    /node "\$revenuecat_validator" --bundle "\$built_js_bundle"/,
  );
  assert.match(simulatorScript, /Archive identity verified|Release identity verified/);
  assert.doesNotMatch(simulatorScript, /photo_api_health_validator/);
  assert.match(simulatorScript, /node "\$apple_toolchain_validator"/);
});

test('production photo API health guard requires the exact ready contract', async () => {
  const checks = Object.fromEntries(
    REQUIRED_PHOTO_API_HEALTH_CHECKS.map((check) => [check, true]),
  );
  assert.doesNotThrow(() =>
    validatePhotoApiHealthPayload(
      {
        status: 'ok',
        deploymentId: 'frume-photo-api-reviewed-a1b2c3d4',
        checks,
      },
      'frume-photo-api-reviewed-a1b2c3d4',
    ),
  );

  const requested = [];
  const healthUrl = await validateProductionPhotoApiHealth({
    baseUrl: new URL('https://photos.example.com/'),
    expectedDeploymentId: 'frume-photo-api-reviewed-a1b2c3d4',
    fetchImpl: async (url, init) => {
      requested.push({ url: url.href, redirect: init.redirect });
      return new Response(JSON.stringify({
        status: 'ok',
        deploymentId: 'frume-photo-api-reviewed-a1b2c3d4',
        checks,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    },
  });
  assert.equal(healthUrl.href, 'https://photos.example.com/health');
  assert.deepEqual(requested, [
    { url: 'https://photos.example.com/health', redirect: 'manual' },
  ]);

  assert.throws(
    () =>
      validatePhotoApiHealthPayload({
        status: 'ok',
        checks: { ...checks, trackingTokenSecret: false },
      }),
    /trackingTokenSecret is not ready/,
  );
  assert.throws(
    () =>
      validatePhotoApiHealthPayload({
        status: 'ok',
        checks: { ...checks, unexpectedCheck: true },
      }),
    /does not match the reviewed readiness contract/,
  );
});

test('production photo API health guard rejects redirects and non-ready responses', async () => {
  await assert.rejects(
    validateProductionPhotoApiHealth({
      baseUrl: new URL('https://photos.example.com/'),
      fetchImpl: async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://other.example/health' },
        }),
    }),
    /must not redirect/,
  );
  await assert.rejects(
    validateProductionPhotoApiHealth({
      baseUrl: new URL('https://photos.example.com/'),
      fetchImpl: async () =>
        new Response('<h1>Login</h1>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    }),
    /did not return JSON/,
  );
  await assert.rejects(
    validateProductionPhotoApiHealth({
      baseUrl: new URL('https://photos.example.com/'),
      fetchImpl: async () =>
        new Response(JSON.stringify({ status: 'not_ready', checks: {} }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        }),
    }),
    /HTTP 503/,
  );
});

test('signed iOS archives cannot import a developer dotenv implicitly', () => {
  const archiveScript = readFileSync(
    new URL('./archive-ios-release.sh', import.meta.url),
    'utf8',
  );

  assert.match(archiveScript, /export EXPO_NO_DOTENV=1/);
  assert.match(
    archiveScript,
    /Unset EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY for an iOS release archive/,
  );
});

test('app configuration defaults the next release artifact to iOS build 3', () => {
  const environment = { ...process.env };
  delete environment.FRUME_BUILD_NUMBER;
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      'process.stdout.write(require("./app.config.js").expo.ios.buildNumber)',
    ],
    {
      cwd: repoDirectory,
      encoding: 'utf8',
      env: environment,
    },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '3');
});

test('CI reproduces the pinned clean-install verification contract', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/ci.yml', import.meta.url),
    'utf8',
  );

  assert.match(workflow, /node-version: 24\.16\.0/);
  assert.match(workflow, /npm install --global npm@11\.13\.0/);
  assert.match(workflow, /run: npm ci --ignore-scripts=false/);
  assert.match(workflow, /run: npm --prefix server ci --ignore-scripts=false/);
  assert.match(workflow, /run: npm run check/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /persist-credentials: false/);
});

test('public page URL guard rejects local and decorated URLs', () => {
  assert.equal(
    parsePublicHttpsUrl('URL', 'https://frume.example/privacy').href,
    'https://frume.example/privacy',
  );
  assert.throws(
    () => parsePublicHttpsUrl('URL', 'https://localhost/privacy'),
    /public HTTPS URL/,
  );
  assert.throws(
    () => parsePublicHttpsUrl('URL', 'https://[::1]/privacy'),
    /public HTTPS URL/,
  );
  assert.throws(
    () => parsePublicHttpsUrl('URL', 'https://frume.example/privacy?preview=1'),
    /public HTTPS URL/,
  );
});

test('public page CLI stays offline unless live verification is explicitly enabled', () => {
  const environment = {
    ...process.env,
    EXPO_PUBLIC_PRIVACY_URL: 'https://unreachable.invalid/privacy',
    EXPO_PUBLIC_SUPPORT_URL: 'https://unreachable.invalid/support',
  };
  delete environment.FRUME_VERIFY_PUBLIC_RELEASE_PAGES;

  const result = spawnSync(
    process.execPath,
    ['./scripts/validate-public-release-pages.mjs'],
    {
      cwd: repoDirectory,
      encoding: 'utf8',
      env: environment,
    },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /live reachability check not requested/);
});

test('public page live guard accepts reviewed HTML through same-origin redirects', async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url.href);
    if (url.pathname === '/privacy') {
      return response(308, { location: '/privacy/' });
    }
    return response(200, { body: '<h1>Frume Privacy Policy</h1>' });
  };

  const finalUrl = await validatePublicReleasePage({
    label: 'Privacy',
    initialUrl: new URL('https://frume.example/privacy'),
    requiredMarkers: ['Frume', 'Privacy'],
    fetchImpl,
  });

  assert.equal(finalUrl.href, 'https://frume.example/privacy/');
  assert.deepEqual(requests, [
    'https://frume.example/privacy',
    'https://frume.example/privacy/',
  ]);
});

test('public page live guard rejects auth and cross-origin redirects', async () => {
  await assert.rejects(
    validatePublicReleasePage({
      label: 'Support',
      initialUrl: new URL('https://frume.example/support'),
      requiredMarkers: ['Frume', 'Support'],
      fetchImpl: async () => response(302, { location: '/sso/login' }),
    }),
    /authentication route/,
  );
  await assert.rejects(
    validatePublicReleasePage({
      label: 'Support',
      initialUrl: new URL('https://frume.example/support'),
      requiredMarkers: ['Frume', 'Support'],
      fetchImpl: async () =>
        response(302, { location: 'https://vercel.com/sso-api' }),
    }),
    /redirected away/,
  );
});

test('public page live guard rejects non-HTML and content mismatch', async () => {
  await assert.rejects(
    validatePublicReleasePage({
      label: 'Privacy',
      initialUrl: new URL('https://frume.example/privacy'),
      requiredMarkers: ['Frume', 'Privacy'],
      fetchImpl: async () =>
        response(200, { body: '{}', contentType: 'application/json' }),
    }),
    /did not return HTML/,
  );
  await assert.rejects(
    validatePublicReleasePage({
      label: 'Privacy',
      initialUrl: new URL('https://frume.example/privacy'),
      requiredMarkers: ['Frume', 'Privacy'],
      fetchImpl: async () => response(200, { body: '<h1>Vercel Login</h1>' }),
    }),
    /does not include/,
  );
});
