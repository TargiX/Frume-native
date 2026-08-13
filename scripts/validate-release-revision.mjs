#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

import { isDirectCli } from './is-direct-cli.mjs';

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
export const REVIEWED_RELEASE_REMOTE_URL =
  'https://github.com/TargiX/Frume-native.git';
export const REVIEWED_RELEASE_BRANCH = 'main';

export function sanitizedGitEnvironment(source = process.env) {
  const environment = Object.fromEntries(
    Object.entries(source).filter(([name]) => !name.startsWith('GIT_')),
  );
  // Release provenance must not inherit repository selection, injected config,
  // transport rewrites, hooks, or credential prompts from the invoking shell.
  return {
    ...environment,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_TERMINAL_PROMPT: '0',
  };
}

function git(args, { cwd, repoDirectory } = {}) {
  return execFileSync('git', ['-C', repoDirectory, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd,
    env: sanitizedGitEnvironment(),
    timeout: 30_000,
  }).trim();
}

export function validateReleaseRevision({
  head,
  reviewedSha,
  remoteSha,
  isClean,
  unsafeIndexPaths = [],
}) {
  if (!SHA_PATTERN.test(reviewedSha ?? '')) {
    throw new Error(
      'FRUME_REVIEWED_RELEASE_SHA must be the full 40-character approved commit SHA.',
    );
  }
  if (!SHA_PATTERN.test(head ?? '') || !SHA_PATTERN.test(remoteSha ?? '')) {
    throw new Error('Could not resolve the local or remote release revision.');
  }
  if (head !== reviewedSha) {
    throw new Error('HEAD does not equal FRUME_REVIEWED_RELEASE_SHA.');
  }
  if (remoteSha !== reviewedSha) {
    throw new Error('The reviewed release SHA is not the current origin/main tip.');
  }
  if (unsafeIndexPaths.length > 0) {
    throw new Error(
      'Release provenance rejects skip-worktree or assume-unchanged index flags.',
    );
  }
  if (!isClean) {
    throw new Error(
      'Release archives require a clean working tree, including no untracked files.',
    );
  }
  return reviewedSha;
}

export function validateReleaseRevisionFromGit({
  repoDirectory,
  reviewedSha,
  canonicalRemoteUrl = REVIEWED_RELEASE_REMOTE_URL,
  branch = REVIEWED_RELEASE_BRANCH,
}) {
  const resolvedRepoDirectory = realpathSync(repoDirectory);
  const repositoryTopLevel = realpathSync(
    git(['rev-parse', '--show-toplevel'], {
      repoDirectory: resolvedRepoDirectory,
    }),
  );
  if (repositoryTopLevel !== resolvedRepoDirectory) {
    throw new Error('Release provenance resolved a different working tree.');
  }

  const head = git(['rev-parse', 'HEAD'], {
    repoDirectory: resolvedRepoDirectory,
  });
  const status = git(
    [
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.untrackedCache=false',
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
    ],
    { repoDirectory: resolvedRepoDirectory },
  );
  const unsafeIndexPaths = git(['ls-files', '-v'], {
    repoDirectory: resolvedRepoDirectory,
  })
    .split('\n')
    .filter(Boolean)
    .filter((line) => line[0] !== 'H')
    .map((line) => line.slice(2));
  let remoteLine;
  try {
    // Run outside every repository and address the reviewed remote directly.
    // This prevents local remote definitions and url.*.insteadOf rules from
    // changing which repository supplies the release truth.
    remoteLine = execFileSync(
      'git',
      [
        'ls-remote',
        '--exit-code',
        canonicalRemoteUrl,
        `refs/heads/${branch}`,
      ],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: '/',
        env: sanitizedGitEnvironment(),
        timeout: 30_000,
      },
    ).trim();
  } catch {
    throw new Error(
      `Could not verify the canonical ${branch} branch; release provenance requires live remote parity.`,
    );
  }
  const remoteSha = remoteLine.split(/\s+/u)[0] ?? '';
  return validateReleaseRevision({
    head,
    reviewedSha,
    remoteSha,
    isClean: status === '',
    unsafeIndexPaths,
  });
}

export function exportReviewedReleaseSource({
  reviewedSha,
  destination,
  canonicalRemoteUrl = REVIEWED_RELEASE_REMOTE_URL,
  branch = REVIEWED_RELEASE_BRANCH,
}) {
  const resolvedDestination = realpathSync(destination);
  if (readdirSync(resolvedDestination).length !== 0) {
    throw new Error('The reviewed release export destination must be empty.');
  }
  const freshRepository = mkdtempSync(
    join(tmpdir(), 'frume-reviewed-remote-git.'),
  );
  try {
    execFileSync(
      'git',
      ['-c', 'init.templateDir=', 'init', '--bare', '--quiet', freshRepository],
      {
        stdio: 'ignore',
        env: sanitizedGitEnvironment(),
        timeout: 30_000,
      },
    );
    execFileSync(
      'git',
      [
        '-C',
        freshRepository,
        'fetch',
        '--quiet',
        '--depth=1',
        '--no-tags',
        canonicalRemoteUrl,
        `refs/heads/${branch}`,
      ],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
        env: sanitizedGitEnvironment(),
        timeout: 60_000,
      },
    );
    const fetchedSha = execFileSync(
      'git',
      ['-C', freshRepository, 'rev-parse', 'FETCH_HEAD'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: sanitizedGitEnvironment(),
        timeout: 30_000,
      },
    ).trim();
    if (fetchedSha !== reviewedSha) {
      throw new Error(
        'The freshly fetched canonical source does not match the reviewed release SHA.',
      );
    }

    const tree = execFileSync(
      'git',
      ['-C', freshRepository, 'ls-tree', '-r', '-z', '--full-tree', fetchedSha],
      {
        encoding: 'buffer',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: sanitizedGitEnvironment(),
        timeout: 30_000,
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    const entries = tree.toString('utf8').split('\0').filter(Boolean);
    if (entries.length === 0) {
      throw new Error('The reviewed release source tree is empty.');
    }

    const manifest = [];
    for (const entry of entries) {
      const separator = entry.indexOf('\t');
      const metadata = entry.slice(0, separator).split(' ');
      const relativePath = entry.slice(separator + 1);
      const [mode, type, objectId] = metadata;
      if (
        separator < 0 ||
        type !== 'blob' ||
        (mode !== '100644' && mode !== '100755')
      ) {
        throw new Error(
          `Unsupported entry in the reviewed release tree: ${relativePath || '<unknown>'}.`,
        );
      }
      const target = resolve(resolvedDestination, relativePath);
      if (!target.startsWith(`${resolvedDestination}${sep}`) || existsSync(target)) {
        throw new Error('The reviewed release tree contains an unsafe path collision.');
      }
      mkdirSync(dirname(target), { recursive: true });
      const contents = execFileSync(
        'git',
        ['-C', freshRepository, 'cat-file', 'blob', objectId],
        {
          encoding: 'buffer',
          stdio: ['ignore', 'pipe', 'pipe'],
          env: sanitizedGitEnvironment(),
          timeout: 30_000,
          maxBuffer: 64 * 1024 * 1024,
        },
      );
      writeFileSync(target, contents, {
        flag: 'wx',
        mode: mode === '100755' ? 0o755 : 0o644,
      });
      chmodSync(target, mode === '100755' ? 0o755 : 0o644);
      manifest.push(`${mode} ${objectId}\t${relativePath}`);
    }

    manifest.sort((left, right) =>
      Buffer.compare(Buffer.from(left), Buffer.from(right)),
    );
    const manifestDigest = createHash('sha256')
      .update(manifest.join('\n'))
      .digest('hex');
    return {
      destination: resolvedDestination,
      entryCount: entries.length,
      manifestDigest,
    };
  } finally {
    rmSync(freshRepository, { recursive: true, force: true });
  }
}

export function canonicalReleaseManifest({
  reviewedSha,
  canonicalRemoteUrl = REVIEWED_RELEASE_REMOTE_URL,
  branch = REVIEWED_RELEASE_BRANCH,
}) {
  const temporaryExport = mkdtempSync(
    join(tmpdir(), 'frume-reviewed-manifest.'),
  );
  try {
    const exported = exportReviewedReleaseSource({
      reviewedSha,
      destination: temporaryExport,
      canonicalRemoteUrl,
      branch,
    });
    return {
      reviewedSha,
      entryCount: exported.entryCount,
      manifestDigest: exported.manifestDigest,
    };
  } finally {
    rmSync(temporaryExport, { recursive: true, force: true });
  }
}

function run() {
  const repoDirectory = process.env.FRUME_REPO_DIR?.trim() || process.cwd();
  const reviewedSha = process.env.FRUME_REVIEWED_RELEASE_SHA?.trim();
  if (process.env.FRUME_VERIFY_CANONICAL_MANIFEST === '1') {
    if (!SHA_PATTERN.test(reviewedSha ?? '')) {
      throw new Error(
        'FRUME_REVIEWED_RELEASE_SHA must be the full 40-character approved commit SHA.',
      );
    }
    const manifest = canonicalReleaseManifest({ reviewedSha });
    process.stdout.write(`${JSON.stringify(manifest)}\n`);
    return;
  }
  const sha = validateReleaseRevisionFromGit({ repoDirectory, reviewedSha });
  const exportDestination = process.env.FRUME_RELEASE_SOURCE_EXPORT?.trim();
  if (exportDestination) {
    const exported = exportReviewedReleaseSource({
      reviewedSha: sha,
      destination: exportDestination,
    });
    console.log(
      `Reviewed release source exported: ${exported.entryCount} files at ${exported.destination}.`,
    );
    const handoffPath = process.env.FRUME_RELEASE_HANDOFF_PATH?.trim();
    if (handoffPath) {
      const resolvedHandoffPath = resolve(handoffPath);
      if (!resolvedHandoffPath.startsWith(`${exported.destination}${sep}`)) {
        throw new Error('Release handoff must stay inside the reviewed source export.');
      }
      writeFileSync(
        resolvedHandoffPath,
        JSON.stringify({
          reviewedSha: sha,
          sourceDirectory: exported.destination,
          manifestDigest: exported.manifestDigest,
          nonce: randomBytes(32).toString('hex'),
        }),
        { flag: 'wx', mode: 0o600 },
      );
    }
  }
  console.log(`Reviewed release revision verified: ${sha}.`);
}

if (isDirectCli(import.meta.url)) {
  try {
    run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
