import { describe, expect, it } from 'vitest';

import {
  HOW_TO_PLAY_SEEN_STORAGE_KEY,
  loadHowToPlaySeen,
  saveHowToPlaySeen,
} from './howToPlayPreference';

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

describe('How to Play preference', () => {
  it('shows teaching until the player explicitly dismisses it', async () => {
    const storage = memoryStorage();

    await expect(loadHowToPlaySeen(storage)).resolves.toBe(false);
    await expect(saveHowToPlaySeen(storage)).resolves.toBe(true);
    await expect(loadHowToPlaySeen(storage)).resolves.toBe(true);
    expect(storage.read()).toBe('true');
    expect(HOW_TO_PLAY_SEEN_STORAGE_KEY).toBe('@frume/how-to-play-seen-v1');
  });

  it('fails open to teaching when storage cannot be read or written', async () => {
    const storage = {
      getItem: async () => {
        throw new Error('storage unavailable');
      },
      setItem: async () => {
        throw new Error('storage unavailable');
      },
    };

    await expect(loadHowToPlaySeen(storage)).resolves.toBe(false);
    await expect(saveHowToPlaySeen(storage)).resolves.toBe(false);
  });
});
