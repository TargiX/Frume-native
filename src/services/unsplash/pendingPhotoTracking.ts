import type { AppStateStatus } from 'react-native';

type AppStateSubscription = {
  remove(): void;
};

type PendingPhotoTrackingOptions = {
  initialState: AppStateStatus;
  retry: () => Promise<void>;
  subscribe: (
    listener: (nextState: AppStateStatus) => void,
  ) => AppStateSubscription;
};

/**
 * Starts best-effort retries for durable Unsplash photo-use tracking.
 *
 * A retry runs immediately for launch-time work and whenever the app returns
 * to the foreground. Resume signals received during a drain are coalesced into
 * one trailing retry, so each busy period performs at most two serial drains.
 */
export function startPendingPhotoTrackingRetries({
  initialState,
  retry,
  subscribe,
}: PendingPhotoTrackingOptions): () => void {
  let currentState = initialState;
  let disposed = false;
  let retryBatch: Promise<void> | null = null;
  let trailingRetryRequested = false;

  const runRetry = async () => {
    try {
      await retry();
    } catch {
      // Tracking remains durable in the queue. A later foreground transition
      // will retry it without turning a best-effort lifecycle task into an
      // unhandled rejection.
    }
  };

  const requestRetry = () => {
    if (disposed) {
      return;
    }
    if (retryBatch) {
      trailingRetryRequested = true;
      return;
    }

    retryBatch = (async () => {
      try {
        await runRetry();
        if (!disposed && trailingRetryRequested) {
          trailingRetryRequested = false;
          await runRetry();
        }
      } finally {
        // Signals arriving during the trailing retry are deliberately folded
        // into this bounded batch. A later foreground transition starts a new
        // batch after this promise settles.
        retryBatch = null;
        trailingRetryRequested = false;
      }
    })();
  };

  const subscription = subscribe((nextState) => {
    const returnedToForeground =
      nextState === 'active' && currentState !== 'active';
    currentState = nextState;
    if (returnedToForeground) {
      requestRetry();
    }
  });

  requestRetry();

  return () => {
    disposed = true;
    trailingRetryRequested = false;
    subscription.remove();
  };
}
