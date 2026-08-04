import { describe, expect, it } from 'vitest';

import { createPhaseFieldLabSettings } from '../../puzzle/cutters/biomorphic/phaseFieldLabConfig';
import {
  deletePhaseFieldLabPreset,
  loadPhaseFieldLabPresets,
  savePhaseFieldLabPreset,
  type PhaseFieldLabStorage,
} from './phaseFieldLabPersistence';

function createStorage(): PhaseFieldLabStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe('phaseFieldLabPersistence', () => {
  it('saves named presets, replaces matching names, and deletes explicitly', () => {
    const storage = createStorage();
    const settings = createPhaseFieldLabSettings();
    settings.name = 'Coral A';
    settings.profile.alpha = 0.72;
    savePhaseFieldLabPreset(storage, settings, new Date('2026-08-01T01:00:00Z'));

    settings.profile.alpha = 0.93;
    savePhaseFieldLabPreset(storage, settings, new Date('2026-08-01T02:00:00Z'));

    const loaded = loadPhaseFieldLabPresets(storage);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].settings.profile.alpha).toBe(0.93);
    expect(deletePhaseFieldLabPreset(storage, loaded[0].id)).toEqual([]);
  });

  it('rejects corrupt saved data instead of silently resetting it', () => {
    const storage = createStorage();
    storage.setItem('frume.phase-field-lab.presets.v1', '{"wrong":true}');
    expect(() => loadPhaseFieldLabPresets(storage)).toThrow(
      'Saved phase-field presets must be an array',
    );
  });
});
