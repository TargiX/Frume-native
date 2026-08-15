import type { AppStateStatus } from 'react-native';
import { describe, expect, it } from 'vitest';

import { startAnalyticsFlushRetries } from './pendingAnalytics';

/**
 * A flush batch settles over several microtasks, so a single `await` can leave
 * it open and turn the next transition into a coalesced trailing run instead of
 * a new one. Tests that mean to observe independent flushes drain first.
 */
async function settle(): Promise<void> {
  for (let tick = 0; tick < 8; tick += 1) {
    await Promise.resolve();
  }
}

function harness(flush: () => Promise<void>) {
  let listener: ((next: AppStateStatus) => void) | null = null;
  let removed = false;
  const stop = startAnalyticsFlushRetries({
    initialState: 'active',
    flush,
    subscribe: (next) => {
      listener = next;
      return {
        remove: () => {
          removed = true;
        },
      };
    },
  });
  return {
    stop,
    emit: (state: AppStateStatus) => listener?.(state),
    wasRemoved: () => removed,
  };
}

describe('analytics flush lifecycle', () => {
  it('flushes at launch', async () => {
    let flushes = 0;
    const { stop } = harness(async () => {
      flushes += 1;
    });
    await settle();

    expect(flushes).toBe(1);
    stop();
  });

  it('flushes when leaving the foreground and when returning to it', async () => {
    let flushes = 0;
    const { stop, emit } = harness(async () => {
      flushes += 1;
    });
    await settle();
    expect(flushes).toBe(1);

    emit('background');
    await settle();
    expect(flushes).toBe(2);

    emit('active');
    await settle();
    expect(flushes).toBe(3);

    stop();
  });

  it('ignores transitions that do not cross the foreground boundary', async () => {
    let flushes = 0;
    const { stop, emit } = harness(async () => {
      flushes += 1;
    });
    await settle();

    emit('active');
    emit('active');
    await settle();

    expect(flushes).toBe(1);
    stop();
  });

  it('coalesces signals arriving during a flush into one trailing run', async () => {
    let flushes = 0;
    // Held on an object so assigning inside the executor is not narrowed away.
    const held: { release: (() => void) | null } = { release: null };
    const { stop, emit } = harness(
      () =>
        new Promise<void>((resolve) => {
          flushes += 1;
          held.release = resolve;
        }),
    );

    expect(flushes).toBe(1);
    emit('background');
    emit('active');
    emit('background');
    expect(flushes).toBe(1);

    held.release?.();
    await settle();
    expect(flushes).toBe(2);

    stop();
  });

  it('swallows a failing flush and keeps listening', async () => {
    let flushes = 0;
    const { stop, emit } = harness(async () => {
      flushes += 1;
      throw new Error('offline');
    });
    await settle();

    emit('background');
    await settle();

    expect(flushes).toBe(2);
    stop();
  });

  it('stops flushing after disposal', async () => {
    let flushes = 0;
    const { stop, emit, wasRemoved } = harness(async () => {
      flushes += 1;
    });
    await settle();

    stop();
    emit('background');
    await settle();

    expect(flushes).toBe(1);
    expect(wasRemoved()).toBe(true);
  });
});
