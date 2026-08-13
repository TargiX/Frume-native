#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

import { isDirectCli } from './is-direct-cli.mjs';

export const REVIEWED_XCODE_VERSION = '26.6';
export const REVIEWED_XCODE_BUILD = '17F113';

export function parseXcodeVersion(output) {
  const match = /^Xcode ([^\r\n]+)\r?\nBuild version ([^\r\n]+)\s*$/u.exec(
    output.trim(),
  );
  if (!match) {
    throw new Error('Could not parse xcodebuild -version output.');
  }
  return { version: match[1], build: match[2] };
}

export function validateAppleToolchain(
  actual,
  expected = {
    version: REVIEWED_XCODE_VERSION,
    build: REVIEWED_XCODE_BUILD,
  },
) {
  if (actual.version !== expected.version || actual.build !== expected.build) {
    throw new Error(
      `Frume release builds require Xcode ${expected.version} (${expected.build}); ` +
        `found ${actual.version} (${actual.build}).`,
    );
  }
  return actual;
}

function run() {
  if (process.platform !== 'darwin') {
    throw new Error('Frume iOS release builds require macOS.');
  }
  const output = execFileSync('xcodebuild', ['-version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const selected = validateAppleToolchain(parseXcodeVersion(output));
  console.log(
    `Apple toolchain verified: Xcode ${selected.version} (${selected.build}).`,
  );
}

if (isDirectCli(import.meta.url)) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
