import { describe, expect, it } from 'vitest';

import {
  createPlayHomeActionGuard,
  resolvePremiumResume,
} from './playHomeActionGuard';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });

  return { promise, resolve };
}

describe('PlayHome action guard', () => {
  it('ignores a verification result after navigation removes Home focus', async () => {
    const access = deferred<boolean>();
    const guard = createPlayHomeActionGuard(true);
    const requestId = guard.beginAction();
    const resolution = resolvePremiumResume(
      requestId,
      guard,
      () => access.promise,
    );

    guard.setFocused(false);
    guard.setFocused(true);
    access.resolve(true);

    await expect(resolution).resolves.toBe('stale');
  });

  it('ignores a verification result after a newer Home action starts', async () => {
    const access = deferred<boolean>();
    const guard = createPlayHomeActionGuard(true);
    const requestId = guard.beginAction();
    const resolution = resolvePremiumResume(
      requestId,
      guard,
      () => access.promise,
    );

    guard.beginAction();
    access.resolve(false);

    await expect(resolution).resolves.toBe('stale');
  });

  it('routes a current denied verification to the premium sheet', async () => {
    const guard = createPlayHomeActionGuard(true);
    const requestId = guard.beginAction();

    await expect(
      resolvePremiumResume(requestId, guard, async () => false),
    ).resolves.toBe('premium');
  });

  it('fails closed when verification unexpectedly rejects', async () => {
    const guard = createPlayHomeActionGuard(true);
    const requestId = guard.beginAction();

    await expect(
      resolvePremiumResume(requestId, guard, async () => {
        throw new Error('Store unavailable');
      }),
    ).resolves.toBe('premium');
  });

  it('routes a current successful verification to the saved puzzle', async () => {
    const guard = createPlayHomeActionGuard(true);
    const requestId = guard.beginAction();

    await expect(
      resolvePremiumResume(requestId, guard, async () => true),
    ).resolves.toBe('game');
  });
});
