import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  exportReviewedReleaseSource,
  validateReleaseRevisionFromGit,
} from './validate-release-revision.mjs';

function git(cwd, ...args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
    ),
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function createRepository(root, name, content) {
  const repository = join(root, name);
  const bare = join(root, `${name}.git`);
  mkdirSync(repository);
  git(repository, 'init', '--initial-branch=main');
  git(repository, 'config', 'user.name', 'Frume Release Test');
  git(repository, 'config', 'user.email', 'release-test@example.invalid');
  writeFileSync(join(repository, 'tracked.txt'), content);
  writeFileSync(join(repository, 'App.tsx'), 'export default null;\n');
  writeFileSync(join(repository, 'app.config.js'), 'module.exports = {};\n');
  git(repository, 'add', 'tracked.txt');
  git(repository, 'add', 'App.tsx', 'app.config.js');
  git(repository, 'commit', '-m', `Create ${name}`);
  const sha = git(repository, 'rev-parse', 'HEAD');
  git(root, 'clone', '--bare', repository, bare);
  return {
    repository,
    bare,
    remoteUrl: `file://${bare}`,
    sha,
  };
}

function withGitOverrides(overrides, callback) {
  const previous = new Map();
  for (const [name, value] of Object.entries(overrides)) {
    previous.set(name, process.env[name]);
    process.env[name] = value;
  }
  try {
    return callback();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test('release provenance ignores inherited repository and config redirection', () => {
  const root = mkdtempSync(join(tmpdir(), 'frume-release-provenance-'));
  try {
    const reviewed = createRepository(root, 'reviewed', 'reviewed source\n');
    const fake = createRepository(root, 'fake', 'different source\n');

    assert.equal(
      withGitOverrides(
        {
          GIT_DIR: join(fake.repository, '.git'),
          GIT_WORK_TREE: fake.repository,
          GIT_CONFIG_COUNT: '1',
          GIT_CONFIG_KEY_0: `url.${fake.remoteUrl}.insteadOf`,
          GIT_CONFIG_VALUE_0: reviewed.remoteUrl,
        },
        () =>
          validateReleaseRevisionFromGit({
            repoDirectory: reviewed.repository,
            reviewedSha: reviewed.sha,
            canonicalRemoteUrl: reviewed.remoteUrl,
          }),
      ),
      reviewed.sha,
    );

    // A repository-local rewrite is also irrelevant because remote truth is
    // queried outside the checkout with global/system config disabled.
    git(
      reviewed.repository,
      'config',
      `url.${fake.remoteUrl}.insteadOf`,
      reviewed.remoteUrl,
    );
    assert.equal(
      validateReleaseRevisionFromGit({
        repoDirectory: reviewed.repository,
        reviewedSha: reviewed.sha,
        canonicalRemoteUrl: reviewed.remoteUrl,
      }),
      reviewed.sha,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('release provenance rejects hidden tracked-file changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'frume-release-index-flags-'));
  try {
    const reviewed = createRepository(root, 'reviewed', 'reviewed source\n');
    const trackedPath = join(reviewed.repository, 'tracked.txt');

    git(reviewed.repository, 'update-index', '--skip-worktree', 'tracked.txt');
    writeFileSync(trackedPath, 'hidden skip-worktree change\n');
    assert.equal(git(reviewed.repository, 'status', '--porcelain'), '');
    assert.throws(
      () =>
        validateReleaseRevisionFromGit({
          repoDirectory: reviewed.repository,
          reviewedSha: reviewed.sha,
          canonicalRemoteUrl: reviewed.remoteUrl,
        }),
      /skip-worktree or assume-unchanged/,
    );

    git(reviewed.repository, 'update-index', '--no-skip-worktree', 'tracked.txt');
    writeFileSync(trackedPath, 'reviewed source\n');
    git(reviewed.repository, 'update-index', '--assume-unchanged', 'tracked.txt');
    writeFileSync(trackedPath, 'hidden assume-unchanged change\n');
    assert.equal(git(reviewed.repository, 'status', '--porcelain'), '');
    assert.throws(
      () =>
        validateReleaseRevisionFromGit({
          repoDirectory: reviewed.repository,
          reviewedSha: reviewed.sha,
          canonicalRemoteUrl: reviewed.remoteUrl,
        }),
      /skip-worktree or assume-unchanged/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('release source export excludes ignored platform overrides and clean-filtered bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'frume-release-export-'));
  try {
    const reviewed = createRepository(root, 'reviewed', 'reviewed source\n');
    const exportDirectory = join(root, 'export');
    mkdirSync(exportDirectory);

    writeFileSync(
      join(reviewed.repository, '.git', 'info', 'exclude'),
      'App.ios.tsx\n',
    );
    writeFileSync(
      join(reviewed.repository, 'App.ios.tsx'),
      'globalThis.unreviewedPlatformOverride = true;\n',
    );
    writeFileSync(
      join(reviewed.repository, '.git', 'info', 'attributes'),
      'tracked.txt filter=hide\n',
    );
    const cleanFilter = join(root, 'clean-filter.sh');
    writeFileSync(cleanFilter, '#!/bin/sh\nprintf "reviewed source\\n"\n');
    chmodSync(cleanFilter, 0o755);
    // The filter command is deliberately repository-local and would fool a
    // status/index-based build from the mutable checkout.
    git(reviewed.repository, 'config', 'filter.hide.clean', cleanFilter);
    writeFileSync(
      join(reviewed.repository, 'tracked.txt'),
      'unreviewed physical bytes\n',
    );
    git(reviewed.repository, 'add', 'tracked.txt');
    assert.equal(git(reviewed.repository, 'status', '--porcelain'), '');

    const result = exportReviewedReleaseSource({
      reviewedSha: reviewed.sha,
      destination: exportDirectory,
      canonicalRemoteUrl: reviewed.remoteUrl,
    });

    assert.equal(result.entryCount, 3);
    assert.equal(
      readFileSync(join(exportDirectory, 'tracked.txt'), 'utf8'),
      'reviewed source\n',
    );
    assert.equal(existsSync(join(exportDirectory, 'App.ios.tsx')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
