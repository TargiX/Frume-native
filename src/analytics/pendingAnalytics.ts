import type { AppStateStatus } from 'react-native';

type AppStateSubscription = {
  remove(): void;
};

type PendingAnalyticsOptions = {
  initialState: AppStateStatus;
  flush: () => Promise<void>;
  subscribe: (
    listener: (nextState: AppStateStatus) => void,
  ) => AppStateSubscription;
};

/**
 * Drives best-effort delivery of pending analytics from the app lifecycle.
 *
 * A flush runs at launch, when the app returns to the foreground, and — unlike
 * the photo-use retries — also when it leaves the foreground. Leaving is the
 * more valuable of the two: a session's events are complete at that moment, and
 * the system may suspend the process before the next launch. Signals arriving
 * during a flush are coalesced into one trailing run, so each busy period costs
 * at most two serial drains.
 */
export function startAnalyticsFlushRetries({
  initialState,
  flush,
  subscribe,
}: PendingAnalyticsOptions): () => void {
  let currentState = initialState;
  let disposed = false;
  let flushBatch: Promise<void> | null = null;
  let trailingFlushRequested = false;

  const runFlush = async () => {
    try {
      await flush();
    } catch {
      // Events stay durable in the queue for a later transition.
    }
  };

  const requestFlush = () => {
    if (disposed) {
      return;
    }
    if (flushBatch) {
      trailingFlushRequested = true;
      return;
    }

    flushBatch = (async () => {
      try {
        await runFlush();
        if (!disposed && trailingFlushRequested) {
          trailingFlushRequested = false;
          await runFlush();
        }
      } finally {
        flushBatch = null;
        trailingFlushRequested = false;
      }
    })();
  };

  const subscription = subscribe((nextState) => {
    const wasActive = currentState === 'active';
    const isActive = nextState === 'active';
    currentState = nextState;
    if (wasActive !== isActive) {
      requestFlush();
    }
  });

  requestFlush();

  return () => {
    disposed = true;
    trailingFlushRequested = false;
    subscription.remove();
  };
}
