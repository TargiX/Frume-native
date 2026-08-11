import {
  parsePhaseFieldLabSettings,
  type BiomorphicPhaseFieldLabSettings,
} from '../../puzzle/cutters/biomorphic/phaseFieldLabConfig';

export const PHASE_FIELD_LAB_PRESETS_KEY = 'frume.phase-field-lab.presets.v1';

export type PhaseFieldLabPreset = {
  id: string;
  savedAt: string;
  settings: BiomorphicPhaseFieldLabSettings;
};

export type PhaseFieldLabStorage = Pick<Storage, 'getItem' | 'setItem'>;

function parsePreset(value: unknown): PhaseFieldLabPreset {
  if (!value || typeof value !== 'object') {
    throw new Error('Saved preset must be an object');
  }
  const candidate = value as Partial<PhaseFieldLabPreset>;
  if (typeof candidate.id !== 'string' || !candidate.id) {
    throw new Error('Saved preset id is missing');
  }
  if (
    typeof candidate.savedAt !== 'string' ||
    Number.isNaN(Date.parse(candidate.savedAt))
  ) {
    throw new Error('Saved preset timestamp is invalid');
  }
  return {
    id: candidate.id,
    savedAt: candidate.savedAt,
    settings: parsePhaseFieldLabSettings(candidate.settings),
  };
}

export function loadPhaseFieldLabPresets(
  storage: PhaseFieldLabStorage,
): PhaseFieldLabPreset[] {
  const raw = storage.getItem(PHASE_FIELD_LAB_PRESETS_KEY);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Saved phase-field presets must be an array');
  }
  return parsed.map(parsePreset).sort((first, second) =>
    second.savedAt.localeCompare(first.savedAt),
  );
}

export function savePhaseFieldLabPreset(
  storage: PhaseFieldLabStorage,
  settingsInput: BiomorphicPhaseFieldLabSettings,
  now = new Date(),
): PhaseFieldLabPreset[] {
  const settings = parsePhaseFieldLabSettings(settingsInput);
  const id = settings.name.trim().toLocaleLowerCase();
  const next: PhaseFieldLabPreset = {
    id,
    savedAt: now.toISOString(),
    settings,
  };
  const presets = loadPhaseFieldLabPresets(storage).filter(
    (preset) => preset.id !== id,
  );
  const result = [next, ...presets];
  storage.setItem(PHASE_FIELD_LAB_PRESETS_KEY, JSON.stringify(result));
  return result;
}

export function deletePhaseFieldLabPreset(
  storage: PhaseFieldLabStorage,
  id: string,
): PhaseFieldLabPreset[] {
  const result = loadPhaseFieldLabPresets(storage).filter(
    (preset) => preset.id !== id,
  );
  storage.setItem(PHASE_FIELD_LAB_PRESETS_KEY, JSON.stringify(result));
  return result;
}
