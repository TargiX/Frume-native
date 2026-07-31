import { describe, expect, it, vi } from 'vitest';

import { startPendingPhotoTrackingRetries } from './pendingPhotoTracking';

type State = 'active' | 'background' | 'inactive' | 'unknown' | 'extension';

function createAppState(initialState: State) {
  let listener: ((nextState: State) => void) | null = null;
  const remove = vi.fn(() => {
    listener = null;
  });

  return {
    initialState,
    emit(nextState: State) {
      listener?.(nextState);
    },
    remove,
    subscribe(nextListener: (nextState: State) => void) {
      listener = nextListener;
      return { remove };
    },
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function settleRetries() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('startPendingPhotoTrackingRetries', () => {
  it('retries at launch and on each transition back to active', async () => {
    const appState = createAppState('active');
    const retry = vi.fn().mockResolvedValue(undefined);
    const stop = startPendingPhotoTrackingRetries({
      initialState: appState.initialState,
      retry,
      subscribe: appState.subscribe,
    });

    await settleRetries();
    expect(retry).toHaveBeenCalledTimes(1);

    appState.emit('active');
    await settleRetries();
    expect(retry).toHaveBeenCalledTimes(1);

    appState.emit('background');
    appState.emit('active');
    await settleRetries();
    expect(retry).toHaveBeenCalledTimes(2);

    appState.emit('inactive');
    appState.emit('active');
    await settleRetries();
    expect(retry).toHaveBeenCalledTimes(3);

    stop();
  });

  it('coalesces a burst into one bounded trailing retry without concurrency', async () => {
    const appState = createAppState('active');
    const first = deferred();
    const second = deferred();
    let concurrent = 0;
    let maxConcurrent = 0;
    const retry = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await first.promise;
        concurrent -= 1;
      })
      .mockImplementationOnce(async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await second.promise;
        concurrent -= 1;
      })
      .mockResolvedValue(undefined);

    const stop = startPendingPhotoTrackingRetries({
      initialState: appState.initialState,
      retry,
      subscribe: appState.subscribe,
    });
    expect(retry).toHaveBeenCalledTimes(1);

    appState.emit('background');
    appState.emit('active');
    appState.emit('background');
    appState.emit('active');
    expect(retry).toHaveBeenCalledTimes(1);

    first.resolve();
    await settleRetries();
    expect(retry).toHaveBeenCalledTimes(2);
    expect(maxConcurrent).toBe(1);

    appState.emit('background');
    appState.emit('active');
    second.resolve();
    await settleRetries();
    expect(retry).toHaveBeenCalledTimes(2);

    appState.emit('background');
    appState.emit('active');
    await settleRetries();
    expect(retry).toHaveBeenCalledTimes(3);

    stop();
  });

  it('removes the listener and suppresses queued work after cleanup', async () => {
    const appState = createAppState('background');
    const first = deferred();
    const retry = vi.fn().mockReturnValue(first.promise);
    const stop = startPendingPhotoTrackingRetries({
      initialState: appState.initialState,
      retry,
      subscribe: appState.subscribe,
    });

    appState.emit('active');
    expect(retry).toHaveBeenCalledTimes(1);

    stop();
    expect(appState.remove).toHaveBeenCalledTimes(1);

    first.resolve();
    await settleRetries();
    appState.emit('background');
    appState.emit('active');
    await settleRetries();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('allows a later foreground transition to retry after a failure', async () => {
    const appState = createAppState('active');
    const retry = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const stop = startPendingPhotoTrackingRetries({
      initialState: appState.initialState,
      retry,
      subscribe: appState.subscribe,
    });

    await settleRetries();
    appState.emit('background');
    appState.emit('active');
    await settleRetries();

    expect(retry).toHaveBeenCalledTimes(2);
    stop();
  });
});
