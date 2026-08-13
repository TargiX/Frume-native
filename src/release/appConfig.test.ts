import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { patchAppDelegateBackupPolicy } = require(
  '../../plugins/withIosOwnPhotoBackupPolicy',
) as {
  patchAppDelegateBackupPolicy: (contents: string) => string;
};

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
    expect(result.stdout).toBe('3');
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

describe('iOS local-photo backup policy', () => {
  const generatedAppDelegate = `import Expo
import React

public class AppDelegate: ExpoAppDelegate {
  public override func application() -> Bool {
    bindReactNativeFactory(factory)
    return true
  }
}

class ReactNativeDelegate {}
`;

  it('durably configures the versioned AppDelegate plugin', () => {
    const config = require('../../app.config.js');

    expect(config.expo.plugins).toContain(
      './plugins/withIosOwnPhotoBackupPolicy',
    );
  });

  it('marks the own-photo directory as excluded from iCloud backup at launch', () => {
    const appDelegate = patchAppDelegateBackupPolicy(generatedAppDelegate);

    expect(appDelegate).toContain('frume-own-photos');
    expect(appDelegate).toContain('isExcludedFromBackup = true');
    expect(appDelegate).toContain('prepareNonBackupPhotoDirectories()');
    expect(appDelegate).toContain('import Foundation');
  });

  it('is idempotent and fails loudly if the Expo launch anchor changes', () => {
    const patched = patchAppDelegateBackupPolicy(generatedAppDelegate);

    expect(patchAppDelegateBackupPolicy(patched)).toBe(patched);
    expect(() =>
      patchAppDelegateBackupPolicy(
        generatedAppDelegate.replace(
          'bindReactNativeFactory(factory)',
          'unknownLaunchTemplate()',
        ),
      ),
    ).toThrow(/launch anchor/);
  });
});
