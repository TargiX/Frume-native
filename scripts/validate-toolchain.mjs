#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { isDirectCli } from './is-direct-cli.mjs';

const packageJsonPath = fileURLToPath(new URL('../package.json', import.meta.url));

export function npmVersionFromUserAgent(userAgent) {
  const match = /(?:^|\s)npm\/([^\s]+)/.exec(userAgent ?? '');
  return match?.[1] ?? null;
}

export function validateToolchain({
  actualNodeVersion,
  actualNpmVersion,
  expectedNodeVersion,
  expectedNpmVersion,
}) {
  if (actualNodeVersion !== expectedNodeVersion) {
    throw new Error(
      `Frume requires Node ${expectedNodeVersion}; found ${actualNodeVersion || 'unknown'}.`,
    );
  }

  if (actualNpmVersion !== expectedNpmVersion) {
    throw new Error(
      `Frume requires npm ${expectedNpmVersion}; found ${actualNpmVersion || 'unknown'}.`,
    );
  }
}

function run() {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const expectedNodeVersion = packageJson.engines?.node;
  const expectedNpmVersion = packageJson.engines?.npm;

  if (!expectedNodeVersion || !expectedNpmVersion) {
    throw new Error('package.json must pin exact Node and npm versions.');
  }

  validateToolchain({
    actualNodeVersion: process.versions.node,
    actualNpmVersion: npmVersionFromUserAgent(process.env.npm_config_user_agent),
    expectedNodeVersion,
    expectedNpmVersion,
  });

  console.log(`Toolchain verified: Node ${expectedNodeVersion}, npm ${expectedNpmVersion}.`);
}

if (isDirectCli(import.meta.url)) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
