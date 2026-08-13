import AsyncStorage from '@react-native-async-storage/async-storage';

export const HAPTICS_ENABLED_STORAGE_KEY = '@frume/haptics-enabled';

export type HapticsPreferenceLoadResult =
  | { status: 'loaded'; enabled: boolean }
  | { status: 'failed'; enabled: false };

export type HapticsSettingFeedback = {
  kind: 'loading' | 'on' | 'off' | 'error';
  message: string;
  retryAvailable: boolean;
  retryLabel: 'Retry loading' | 'Retry saving';
};

type HapticsPreferenceStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

type HapticsSettingFeedbackInput = {
  preferenceLoaded: boolean;
  hapticsEnabled: boolean;
  preferenceLoadFailed: boolean;
  preferenceSaveFailed: boolean;
};

export function shouldPlayHapticFeedback(
  preferenceLoaded: boolean,
  hapticsEnabled: boolean,
): boolean {
  return preferenceLoaded && hapticsEnabled;
}

export function getHapticsSettingFeedback({
  preferenceLoaded,
  hapticsEnabled,
  preferenceLoadFailed,
  preferenceSaveFailed,
}: HapticsSettingFeedbackInput): HapticsSettingFeedback {
  if (preferenceLoadFailed) {
    return {
      kind: 'error',
      message:
        'Haptics setting could not be loaded. Vibration feedback stays off until you retry.',
      retryAvailable: true,
      retryLabel: 'Retry loading',
    };
  }
  if (preferenceSaveFailed) {
    return {
      kind: 'error',
      message: hapticsEnabled
        ? 'Haptics are on for now, but this setting was not saved.'
        : 'Haptics are off for now, but this setting was not saved.',
      retryAvailable: true,
      retryLabel: 'Retry saving',
    };
  }
  if (!preferenceLoaded) {
    return {
      kind: 'loading',
      message: 'Loading haptics setting…',
      retryAvailable: false,
      retryLabel: 'Retry loading',
    };
  }
  return hapticsEnabled
    ? {
        kind: 'on',
        message: 'Vibration feedback for placed pieces and completion',
        retryAvailable: false,
        retryLabel: 'Retry saving',
      }
    : {
        kind: 'off',
        message: 'No vibration feedback',
        retryAvailable: false,
        retryLabel: 'Retry saving',
      };
}

export async function loadHapticsEnabled(
  storage: HapticsPreferenceStorage = AsyncStorage,
): Promise<HapticsPreferenceLoadResult> {
  try {
    const stored = await storage.getItem(HAPTICS_ENABLED_STORAGE_KEY);
    return {
      status: 'loaded',
      // Preserve the existing tactile default until a player turns it off.
      enabled: stored === null ? true : stored !== 'false',
    };
  } catch {
    // Do not vibrate before the choice is known, and make the failure visible.
    return { status: 'failed', enabled: false };
  }
}

export async function saveHapticsEnabled(
  enabled: boolean,
  storage: HapticsPreferenceStorage = AsyncStorage,
): Promise<boolean> {
  try {
    await storage.setItem(HAPTICS_ENABLED_STORAGE_KEY, String(enabled));
    return true;
  } catch {
    return false;
  }
}
