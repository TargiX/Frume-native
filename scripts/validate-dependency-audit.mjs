import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { isDirectCli } from './is-direct-cli.mjs';

export const REVIEWED_MOBILE_AUDIT_URLS = new Set([
  'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr',
  'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq',
]);

export const REVIEWED_MOBILE_VULNERABILITY_CHAIN = new Set([
  '@expo/cli',
  '@expo/metro',
  '@expo/metro-config',
  '@react-native/community-cli-plugin',
  'expo',
  'image-size',
  'metro',
  'metro-config',
  'metro-transform-worker',
  'react-native',
]);

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateMobileAuditReport(report) {
  if (!isRecord(report) || !isRecord(report.metadata)) {
    throw new Error('npm audit returned an invalid mobile report.');
  }
  const vulnerabilities = isRecord(report.vulnerabilities)
    ? report.vulnerabilities
    : {};
  const names = Object.keys(vulnerabilities).sort();
  const expectedNames = [...REVIEWED_MOBILE_VULNERABILITY_CHAIN].sort();
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) {
    throw new Error(
      `Mobile dependency audit changed. Reviewed chain: ${expectedNames.join(', ')}. Observed: ${names.join(', ') || 'none'}.`,
    );
  }

  const advisoryUrls = new Set();
  for (const vulnerability of Object.values(vulnerabilities)) {
    if (!isRecord(vulnerability) || !Array.isArray(vulnerability.via)) {
      throw new Error('npm audit returned a malformed vulnerability record.');
    }
    for (const cause of vulnerability.via) {
      if (isRecord(cause) && typeof cause.url === 'string') {
        advisoryUrls.add(cause.url);
      }
    }
  }
  const observedUrls = [...advisoryUrls].sort();
  const expectedUrls = [...REVIEWED_MOBILE_AUDIT_URLS].sort();
  if (JSON.stringify(observedUrls) !== JSON.stringify(expectedUrls)) {
    throw new Error(
      `Mobile dependency advisories changed. Reviewed: ${expectedUrls.join(', ')}. Observed: ${observedUrls.join(', ') || 'none'}.`,
    );
  }

  const counts = isRecord(report.metadata.vulnerabilities)
    ? report.metadata.vulnerabilities
    : {};
  if (
    counts.critical !== 0 ||
    counts.moderate !== 0 ||
    counts.low !== 0 ||
    counts.high !== expectedNames.length ||
    counts.total !== expectedNames.length
  ) {
    throw new Error('Mobile dependency audit severity/count contract changed.');
  }
}

export function validateServerAuditReport(report) {
  const counts = isRecord(report?.metadata?.vulnerabilities)
    ? report.metadata.vulnerabilities
    : null;
  if (!counts || counts.total !== 0) {
    throw new Error('Worker production dependencies must have zero advisories.');
  }
}

function runAudit(args, label) {
  const result = spawnSync('npm', args, {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (!result.stdout) {
    throw new Error(`${label} npm audit did not return JSON: ${result.stderr}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${label} npm audit returned invalid JSON.`);
  }
}

export function main() {
  const mobile = runAudit(['audit', '--omit=dev', '--json'], 'Mobile');
  validateMobileAuditReport(mobile);
  const server = runAudit(
    ['--prefix', 'server', 'audit', '--omit=dev', '--json'],
    'Worker',
  );
  validateServerAuditReport(server);
  console.log(
    'Dependency risk verified: only the two reviewed Metro image-size build-chain advisories remain; Worker production dependencies have zero advisories.',
  );
}

if (isDirectCli(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
