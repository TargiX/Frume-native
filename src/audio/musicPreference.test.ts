import { describe, expect, it } from 'vitest';

import {
  getMusicSettingFeedback,
  loadMusicEnabled,
  MUSIC_ENABLED_STORAGE_KEY,
  saveMusicEnabled,
} from './musicPreference';

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

describe('music preference', () => {
  it('keeps music off until the player explicitly enables it', async () => {
    await expect(loadMusicEnabled(memoryStorage())).resolves.toBe(false);
    await expect(loadMusicEnabled(memoryStorage('invalid'))).resolves.toBe(false);
    await expect(
      loadMusicEnabled({
        getItem: async () => {
          throw new Error('storage unavailable');
        },
        setItem: async () => undefined,
      }),
    ).resolves.toBe(false);
  });

  it('persists the explicit music choice', async () => {
    const storage = memoryStorage();
    await expect(saveMusicEnabled(true, storage)).resolves.toBe(true);
    expect(storage.read()).toBe('true');
    expect(MUSIC_ENABLED_STORAGE_KEY).toBe('@frume/music-enabled');
  });

  it('reports a failed write without changing the in-memory choice contract', async () => {
    const storage = {
      getItem: async () => null,
      setItem: async () => {
        throw new Error('storage unavailable');
      },
    };

    await expect(saveMusicEnabled(true, storage)).resolves.toBe(false);
    expect(
      getMusicSettingFeedback({
        preferenceLoaded: true,
        musicEnabled: true,
        shouldPlay: true,
        isLoaded: true,
        isPlaying: true,
        playbackError: null,
        preferenceSaveFailed: true,
      }),
    ).toEqual({
      kind: 'error',
      message: 'Music is on for now, but this setting was not saved.',
      retryAvailable: true,
      retryLabel: 'Retry saving',
    });
  });

  it('does not present failed playback as silently enabled', () => {
    expect(
      getMusicSettingFeedback({
        preferenceLoaded: true,
        musicEnabled: true,
        shouldPlay: true,
        isLoaded: false,
        isPlaying: false,
        playbackError: 'Music could not be loaded. Try again.',
        preferenceSaveFailed: false,
      }),
    ).toEqual({
      kind: 'error',
      message: 'Music could not be loaded. Try again.',
      retryAvailable: true,
      retryLabel: 'Retry music',
    });
  });

  it('distinguishes off, paused, starting, and playing states', () => {
    const base = {
      preferenceLoaded: true,
      musicEnabled: true,
      shouldPlay: true,
      isLoaded: true,
      isPlaying: true,
      playbackError: null,
      preferenceSaveFailed: false,
    };

    expect(
      getMusicSettingFeedback({ ...base, musicEnabled: false }),
    ).toMatchObject({ kind: 'off', retryAvailable: false });
    expect(
      getMusicSettingFeedback({ ...base, shouldPlay: false }),
    ).toMatchObject({ kind: 'paused', retryAvailable: false });
    expect(
      getMusicSettingFeedback({ ...base, isLoaded: false, isPlaying: false }),
    ).toMatchObject({ kind: 'starting', retryAvailable: false });
    expect(getMusicSettingFeedback(base)).toMatchObject({
      kind: 'playing',
      retryAvailable: false,
    });
  });
});
