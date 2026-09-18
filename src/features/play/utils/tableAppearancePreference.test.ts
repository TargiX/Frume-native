import { describe, expect, it } from 'vitest';

import {
  loadTableAppearance,
  saveTableAppearance,
  TABLE_APPEARANCE_STORAGE_KEY,
} from './tableAppearancePreference';

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

describe('table appearance preference', () => {
  it('defaults new installs and invalid values to photo glass', async () => {
    await expect(loadTableAppearance(memoryStorage())).resolves.toBe(
      'photo-glass',
    );
    await expect(
      loadTableAppearance(memoryStorage('unsupported')),
    ).resolves.toBe('photo-glass');
  });

  it('persists an explicit felt choice', async () => {
    const storage = memoryStorage();
    await expect(saveTableAppearance('felt', storage)).resolves.toBe(true);
    expect(storage.read()).toBe('felt');
    expect(TABLE_APPEARANCE_STORAGE_KEY).toBe('@frume/table-appearance');
  });

  it('round-trips the light linen choice instead of falling back', async () => {
    const storage = memoryStorage();
    await expect(saveTableAppearance('linen', storage)).resolves.toBe(true);
    await expect(loadTableAppearance(storage)).resolves.toBe('linen');
  });
});
