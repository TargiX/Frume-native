import { describe, expect, it, vi } from 'vitest';

import type { AnalyticsConfiguration } from './analyticsApi';
import { AnalyticsClient } from './analyticsClient';
import type { AnalyticsEvent } from './analyticsEvents';
import type { AnalyticsQueueStorage } from './analyticsQueue';

const configuration: AnalyticsConfiguration = {
  captureUrl: 'https://eu.i.posthog.com/batch/',
  apiKey: 'phc_test',
};

class MemoryStorage implements AnalyticsQueueStorage {
  value: string | null = null;

  async getItem(): Promise<string | null> {
    return this.value;
  }

  async setItem(_key: string, value: string): Promise<void> {
    this.value = value;
  }

  async removeItem(): Promise<void> {
    this.value = null;
  }
}

function harness(
  overrides: Partial<{
    enabled: boolean;
    readConfiguration: () => AnalyticsConfiguration | null;
    installationId: string | null;
  }> = {},
) {
  const storage = new MemoryStorage();
  const sent: AnalyticsEvent[] = [];
  const distinctIds: string[] = [];
  const clearInstallationId = vi.fn(async () => undefined);
  const saveEnabled = vi.fn(async () => true);
  let nextTime = 1_760_000_000_000;

  const client = new AnalyticsClient({
    storage,
    readConfiguration: overrides.readConfiguration ?? (() => configuration),
    loadEnabled: async () => ({ enabled: overrides.enabled ?? true }),
    saveEnabled,
    loadInstallationId: async () =>
      overrides.installationId === undefined
        ? 'a'.repeat(32)
        : overrides.installationId,
    clearInstallationId,
    send: async (events, distinctId) => {
      distinctIds.push(distinctId);
      sent.push(...events);
    },
    now: () => (nextTime += 1),
  });

  return { client, storage, sent, distinctIds, clearInstallationId, saveEnabled };
}

describe('analytics client', () => {
  it('releases events recorded before the preference is known', async () => {
    const { client, sent } = harness();

    client.track('app_opened', { cold_start: true });
    client.track('photo_source_chosen', { source: 'own_photo' });

    await client.initialize();
    await client.flush();

    expect(sent.map((item) => item.name)).toEqual([
      'app_opened',
      'photo_source_chosen',
    ]);
  });

  it('sends nothing when the build has no analytics configuration', async () => {
    const { client, sent, storage } = harness({
      readConfiguration: () => null,
    });

    client.track('app_opened', { cold_start: true });
    await client.initialize();
    client.track('restore_completed', {});
    await client.flush();

    expect(sent).toEqual([]);
    expect(storage.value).toBeNull();
  });

  it('treats a malformed configuration as unconfigured rather than failing launch', async () => {
    const { client, sent } = harness({
      readConfiguration: () => {
        throw new Error('bad host');
      },
    });

    client.track('app_opened', { cold_start: true });
    await expect(client.initialize()).resolves.toBeUndefined();
    await client.flush();

    expect(sent).toEqual([]);
  });

  it('collects nothing and forgets the installation when opted out', async () => {
    const { client, sent, storage, clearInstallationId } = harness({
      enabled: false,
    });
    storage.value = 'left over from a previous install';

    client.track('app_opened', { cold_start: true });
    await client.initialize();
    client.track('puzzle_started', {
      cut_id: 'classic',
      piece_count: 9,
      source: 'theme',
    });
    await client.flush();

    expect(sent).toEqual([]);
    expect(storage.value).toBeNull();
    expect(clearInstallationId).toHaveBeenCalledTimes(1);
  });

  it('suppresses collection when no identifier can be stored', async () => {
    const { client, sent } = harness({ installationId: null });

    await client.initialize();
    client.track('restore_completed', {});
    await client.flush();

    expect(sent).toEqual([]);
  });

  it('stops immediately and drops pending events when switched off', async () => {
    const { client, sent, storage, clearInstallationId, saveEnabled } =
      harness();
    await client.initialize();

    client.track('paywall_shown', { trigger_cut_id: 'amoeba' });
    await Promise.resolve();

    expect(await client.setCollectionEnabled(false)).toBe(true);
    expect(saveEnabled).toHaveBeenCalledWith(false);

    client.track('restore_completed', {});
    await client.flush();

    expect(sent).toEqual([]);
    expect(storage.value).toBeNull();
    expect(clearInstallationId).toHaveBeenCalledTimes(1);
  });

  it('resumes with a fresh installation when switched back on', async () => {
    const { client, sent, distinctIds } = harness();
    await client.initialize();
    await client.setCollectionEnabled(false);

    await client.setCollectionEnabled(true);
    client.track('purchase_completed', {
      product_id: 'com.targix.frumenative.premium_cut_styles',
    });
    await Promise.resolve();
    await client.flush();

    expect(sent.map((item) => item.name)).toEqual(['purchase_completed']);
    expect(distinctIds).toEqual(['a'.repeat(32)]);
  });

  it('reports a preference that could not be saved', async () => {
    const storage = new MemoryStorage();
    const client = new AnalyticsClient({
      storage,
      readConfiguration: () => configuration,
      loadEnabled: async () => ({ enabled: true }),
      saveEnabled: async () => false,
      loadInstallationId: async () => 'a'.repeat(32),
      clearInstallationId: async () => undefined,
      send: async () => undefined,
      now: () => 1_760_000_000_000,
    });

    expect(await client.setCollectionEnabled(false)).toBe(false);
  });

  it('bounds what it buffers before initialization', async () => {
    const { client, sent } = harness();

    for (let index = 0; index < 40; index += 1) {
      client.track('app_opened', { cold_start: false });
    }
    await client.initialize();
    await client.flush();

    expect(sent).toHaveLength(20);
  });

  it('never throws out of track when the queue cannot be written', async () => {
    const storage = new MemoryStorage();
    storage.setItem = async () => {
      throw new Error('disk full');
    };
    const client = new AnalyticsClient({
      storage,
      readConfiguration: () => configuration,
      loadEnabled: async () => ({ enabled: true }),
      saveEnabled: async () => true,
      loadInstallationId: async () => 'a'.repeat(32),
      clearInstallationId: async () => undefined,
      send: async () => undefined,
      now: () => 1_760_000_000_000,
    });

    await client.initialize();
    expect(() => client.track('restore_completed', {})).not.toThrow();
    await expect(client.flush()).resolves.toBeUndefined();
  });
});
