import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  readAnalyticsConfiguration,
  sendAnalyticsBatch,
  type AnalyticsConfiguration,
} from './analyticsApi';
import {
  normalizeAnalyticsEvent,
  type AnalyticsEvent,
  type AnalyticsEventName,
  type AnalyticsEventProperties,
} from './analyticsEvents';
import {
  clearAnalyticsInstallationId,
  loadAnalyticsInstallationId,
} from './analyticsInstallation';
import {
  loadAnalyticsEnabled,
  saveAnalyticsEnabled,
} from './analyticsPreference';
import {
  AnalyticsQueue,
  ANALYTICS_BATCH_SIZE,
  type AnalyticsQueueStorage,
} from './analyticsQueue';

/**
 * The single seam through which measurement leaves Frume.
 *
 * Screens call `track` and nothing else. They never see the transport, the
 * queue, the identifier, or the preference, which is what keeps the privacy
 * surface reviewable: everything that can be sent is the union of this file and
 * the contract in `analyticsEvents.ts`.
 *
 * `track` is synchronous, never throws, and never awaits. Measurement must not
 * be able to slow down or break a puzzle.
 */

/** Events recorded before the stored preference is known are held here. */
const MAX_BUFFERED_EVENTS = 20;

type AnalyticsClientDependencies = {
  storage?: AnalyticsQueueStorage;
  readConfiguration?: () => AnalyticsConfiguration | null;
  loadEnabled?: () => Promise<{ enabled: boolean }>;
  saveEnabled?: (enabled: boolean) => Promise<boolean>;
  loadInstallationId?: () => Promise<string | null>;
  clearInstallationId?: () => Promise<void>;
  send?: (
    events: readonly AnalyticsEvent[],
    distinctId: string,
    configuration: AnalyticsConfiguration,
  ) => Promise<void>;
  now?: () => number;
};

type ClientStatus = 'idle' | 'ready' | 'disabled';

export class AnalyticsClient {
  private status: ClientStatus = 'idle';
  private buffered: AnalyticsEvent[] = [];
  private queue: AnalyticsQueue | null = null;
  private initialization: Promise<void> | null = null;
  private enqueuedSinceFlush = 0;
  private readonly deps: Required<AnalyticsClientDependencies>;

  constructor(dependencies: AnalyticsClientDependencies = {}) {
    this.deps = {
      storage: dependencies.storage ?? AsyncStorage,
      readConfiguration:
        dependencies.readConfiguration ?? readAnalyticsConfiguration,
      loadEnabled: dependencies.loadEnabled ?? loadAnalyticsEnabled,
      saveEnabled: dependencies.saveEnabled ?? saveAnalyticsEnabled,
      loadInstallationId:
        dependencies.loadInstallationId ?? loadAnalyticsInstallationId,
      clearInstallationId:
        dependencies.clearInstallationId ?? clearAnalyticsInstallationId,
      send: dependencies.send ?? sendAnalyticsBatch,
      now: dependencies.now ?? Date.now,
    };
  }

  /**
   * Resolves the build configuration, the stored preference, and the anonymous
   * identifier, then releases anything recorded while that was in flight.
   *
   * Safe to call more than once; concurrent callers share one run.
   */
  initialize(): Promise<void> {
    this.initialization ??= this.runInitialize().catch(() => {
      // Measurement must never be able to fail a launch.
      this.disable();
    });
    return this.initialization;
  }

  private async runInitialize(): Promise<void> {
    let configuration: AnalyticsConfiguration | null = null;
    try {
      configuration = this.deps.readConfiguration();
    } catch (error) {
      // A malformed host or key is a build mistake. Collection stays off rather
      // than failing a launch over measurement — but silence is how a build
      // reaches TestFlight measuring nothing and nobody notices, so say so
      // where a developer will see it. `typeof` guards the Node test runner,
      // where the React Native global does not exist.
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn(
          `Frume analytics is disabled: ${
            error instanceof Error ? error.message : 'invalid configuration'
          }`,
        );
      }
      configuration = null;
    }
    if (!configuration) {
      this.disable();
      return;
    }

    const { enabled } = await this.deps.loadEnabled();
    if (!enabled) {
      this.disable();
      // No queue exists yet on this path; anything on disk is from a build or
      // a session that ran before the player opted out.
      await this.forget(null);
      return;
    }

    const installationId = await this.deps.loadInstallationId();
    if (!installationId) {
      this.disable();
      return;
    }

    // The configuration and identifier live only in this closure, so a
    // disabled client has no way to reach either of them.
    this.queue = new AnalyticsQueue(this.deps.storage, (events) =>
      this.deps.send(events, installationId, configuration),
    );
    this.status = 'ready';

    const released = this.buffered;
    this.buffered = [];
    for (const event of released) {
      try {
        await this.queue.enqueue(event);
      } catch {
        // A storage failure here loses buffered measurements, but must not
        // reject the launch-time initialization that released them.
      }
    }
    this.requestFlush();
  }

  /**
   * Records one event. Unknown names and undeclared properties are dropped by
   * the contract in `analyticsEvents.ts` before anything is stored.
   */
  track<Name extends AnalyticsEventName>(
    name: Name,
    properties: AnalyticsEventProperties[Name],
  ): void {
    if (this.status === 'disabled') {
      return;
    }

    const event = normalizeAnalyticsEvent({
      name,
      properties,
      occurredAt: this.deps.now(),
    });
    if (!event) {
      return;
    }

    if (this.status === 'idle') {
      // Bounded so a build with no configuration cannot accumulate events for
      // the whole session before initialization discards them.
      this.buffered.push(event);
      if (this.buffered.length > MAX_BUFFERED_EVENTS) {
        this.buffered.shift();
      }
      return;
    }

    const queue = this.queue;
    if (!queue) {
      return;
    }
    void queue
      .enqueue(event)
      .then((accepted) => {
        if (!accepted) {
          return;
        }
        this.enqueuedSinceFlush += 1;
        if (this.enqueuedSinceFlush >= ANALYTICS_BATCH_SIZE) {
          this.requestFlush();
        }
      })
      .catch(() => {
        // Storage can fail on a full device. Losing a measurement is the
        // correct outcome; an unhandled rejection out of gameplay is not.
      });
  }

  /**
   * Sends whatever is pending. Failures are swallowed: the queue is durable, so
   * a later foreground or launch retries without turning a best-effort task
   * into an unhandled rejection.
   */
  async flush(): Promise<void> {
    const queue = this.queue;
    if (this.status !== 'ready' || !queue) {
      return;
    }
    this.enqueuedSinceFlush = 0;
    try {
      await queue.flush();
    } catch {
      // Retried on the next lifecycle transition.
    }
  }

  private requestFlush(): void {
    void this.flush();
  }

  /**
   * Applies a player's choice and persists it. Returns false when the choice
   * could not be saved, which the settings row surfaces as a retry.
   *
   * Turning collection off takes effect immediately and destructively: pending
   * events are dropped and the identifier is forgotten, so turning it back on
   * starts an installation that cannot be linked to the previous one.
   */
  async setCollectionEnabled(enabled: boolean): Promise<boolean> {
    let saved = false;
    try {
      saved = await this.deps.saveEnabled(enabled);
    } catch {
      saved = false;
    }

    if (!enabled) {
      // Captured before `disable` drops it, so the clear below is ordered
      // behind any enqueue already in flight on this queue's storage chain.
      const liveQueue = this.queue;
      this.disable();
      await this.forget(liveQueue);
      return saved;
    }

    this.status = 'idle';
    this.buffered = [];
    this.queue = null;
    this.enqueuedSinceFlush = 0;
    this.initialization = null;
    await this.initialize();
    return saved;
  }

  private disable(): void {
    this.status = 'disabled';
    this.buffered = [];
    this.queue = null;
    this.enqueuedSinceFlush = 0;
  }

  /**
   * Removes everything about this installation from the device.
   *
   * Best-effort by necessity: opt-out has already stopped collection in memory,
   * so a storage failure here must not reject and leave the settings row
   * looking as though the choice did not apply.
   */
  private async forget(liveQueue: AnalyticsQueue | null): Promise<void> {
    try {
      // Reusing the queue that accepted events keeps this clear serialized
      // behind them. A fresh instance has its own storage chain, so an event
      // still being written would land back on the device after the clear.
      const queue =
        liveQueue ??
        new AnalyticsQueue(this.deps.storage, async () => undefined);
      await queue.clear();
    } catch {
      // Nothing further can be sent regardless: the client has dropped its
      // queue, its configuration, and its identifier.
    }
    try {
      await this.deps.clearInstallationId();
    } catch {
      // Same reasoning.
    }
  }
}

export const analyticsClient = new AnalyticsClient();

export function track<Name extends AnalyticsEventName>(
  name: Name,
  properties: AnalyticsEventProperties[Name],
): void {
  analyticsClient.track(name, properties);
}

export function initializeAnalytics(): Promise<void> {
  return analyticsClient.initialize();
}

export function flushAnalytics(): Promise<void> {
  return analyticsClient.flush();
}

export function setAnalyticsCollectionEnabled(
  enabled: boolean,
): Promise<boolean> {
  return analyticsClient.setCollectionEnabled(enabled);
}
