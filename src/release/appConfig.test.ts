import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

function readBuildNumber(value?: string) {
  const env = { ...process.env };
  delete env.FRUME_BUILD_NUMBER;
  if (value !== undefined) {
    env.FRUME_BUILD_NUMBER = value;
  }

  return spawnSync(
    process.execPath,
    [
      '-e',
      'process.stdout.write(require("./app.config.js").expo.ios.buildNumber)',
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env,
    },
  );
}

describe('iOS release build number', () => {
  it('defaults to the reviewed source build number', () => {
    const result = readBuildNumber();

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('2');
  });

  it('allows the release operator to select an explicit positive integer', () => {
    const result = readBuildNumber('7');

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('7');
  });

  it.each(['', '0', '-1', '2.5', 'build-3'])(
    'rejects invalid build number %j',
    (value) => {
      const result = readBuildNumber(value);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'FRUME_BUILD_NUMBER must be a positive integer',
      );
    },
  );
});
