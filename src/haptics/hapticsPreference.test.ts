import { describe, expect, it } from 'vitest';

import {
  getHapticsSettingFeedback,
  HAPTICS_ENABLED_STORAGE_KEY,
  loadHapticsEnabled,
  saveHapticsEnabled,
  shouldPlayHapticFeedback,
} from './hapticsPreference';

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: async () => value,
    setItem: async (_key: string, next: string) => {
      value = next;
    },
    read: () => value,
  };
}

describe('haptics preference', () => {
  it('never plays feedback before the preference has loaded or after opt-out', () => {
    expect(shouldPlayHapticFeedback(false, true)).toBe(false);
    expect(shouldPlayHapticFeedback(true, false)).toBe(false);
    expect(shouldPlayHapticFeedback(true, true)).toBe(true);
  });

  it('preserves the tactile default and persists an explicit opt-out', async () => {
    await expect(loadHapticsEnabled(memoryStorage())).resolves.toEqual({
      status: 'loaded',
      enabled: true,
    });
    const storage = memoryStorage();
    await expect(saveHapticsEnabled(false, storage)).resolves.toBe(true);
    await expect(loadHapticsEnabled(storage)).resolves.toEqual({
      status: 'loaded',
      enabled: false,
    });
    expect(storage.read()).toBe('false');
    expect(HAPTICS_ENABLED_STORAGE_KEY).toBe('@frume/haptics-enabled');
  });

  it('fails closed and exposes load and save failures', async () => {
    const unavailable = {
      getItem: async () => {
        throw new Error('private storage failure');
      },
      setItem: async () => {
        throw new Error('private storage failure');
      },
    };
    await expect(loadHapticsEnabled(unavailable)).resolves.toEqual({
      status: 'failed',
      enabled: false,
    });
    await expect(saveHapticsEnabled(true, unavailable)).resolves.toBe(false);
    expect(
      getHapticsSettingFeedback({
        preferenceLoaded: false,
        hapticsEnabled: false,
        preferenceLoadFailed: true,
        preferenceSaveFailed: false,
      }),
    ).toMatchObject({
      kind: 'error',
      retryAvailable: true,
      retryLabel: 'Retry loading',
    });
    expect(
      getHapticsSettingFeedback({
        preferenceLoaded: true,
        hapticsEnabled: true,
        preferenceLoadFailed: false,
        preferenceSaveFailed: true,
      }),
    ).toMatchObject({
      kind: 'error',
      retryAvailable: true,
      retryLabel: 'Retry saving',
    });
  });
});
