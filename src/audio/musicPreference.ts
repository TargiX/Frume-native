import AsyncStorage from '@react-native-async-storage/async-storage';

export const MUSIC_ENABLED_STORAGE_KEY = '@frume/music-enabled';

export type MusicSettingFeedbackKind =
  | 'off'
  | 'starting'
  | 'playing'
  | 'paused'
  | 'error';

export type MusicSettingFeedback = {
  kind: MusicSettingFeedbackKind;
  message: string;
  retryAvailable: boolean;
  retryLabel: 'Retry music' | 'Retry saving';
};

type MusicSettingFeedbackInput = {
  preferenceLoaded: boolean;
  musicEnabled: boolean;
  shouldPlay: boolean;
  isLoaded: boolean;
  isPlaying: boolean;
  playbackError: string | null;
  preferenceSaveFailed: boolean;
};

type MusicPreferenceStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

/**
 * Keeps the user's choice separate from the actual player state. A failed
 * player may still have an enabled preference, but the UI must say that music
 * is unavailable instead of presenting a silent, unexplained "On" switch.
 */
export function getMusicSettingFeedback({
  preferenceLoaded,
  musicEnabled,
  shouldPlay,
  isLoaded,
  isPlaying,
  playbackError,
  preferenceSaveFailed,
}: MusicSettingFeedbackInput): MusicSettingFeedback {
  if (playbackError) {
    return {
      kind: 'error',
      message: playbackError,
      retryAvailable: true,
      retryLabel: 'Retry music',
    };
  }

  if (preferenceSaveFailed) {
    return {
      kind: 'error',
      message: musicEnabled
        ? 'Music is on for now, but this setting was not saved.'
        : 'Music is off for now, but this setting was not saved.',
      retryAvailable: true,
      retryLabel: 'Retry saving',
    };
  }

  if (!preferenceLoaded) {
    return {
      kind: 'starting',
      message: 'Loading music setting…',
      retryAvailable: false,
      retryLabel: 'Retry music',
    };
  }

  if (!musicEnabled) {
    return {
      kind: 'off',
      message: 'Calm background playlist',
      retryAvailable: false,
      retryLabel: 'Retry music',
    };
  }

  if (!shouldPlay) {
    return {
      kind: 'paused',
      message: 'Paused until you return to the puzzle',
      retryAvailable: false,
      retryLabel: 'Retry music',
    };
  }

  if (!isLoaded || !isPlaying) {
    return {
      kind: 'starting',
      message: 'Starting calm background music…',
      retryAvailable: false,
      retryLabel: 'Retry music',
    };
  }

  return {
    kind: 'playing',
    message: 'Playing calm background music',
    retryAvailable: false,
    retryLabel: 'Retry music',
  };
}

export async function loadMusicEnabled(
  storage: MusicPreferenceStorage = AsyncStorage,
): Promise<boolean> {
  try {
    return (await storage.getItem(MUSIC_ENABLED_STORAGE_KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function saveMusicEnabled(
  enabled: boolean,
  storage: MusicPreferenceStorage = AsyncStorage,
): Promise<boolean> {
  try {
    await storage.setItem(MUSIC_ENABLED_STORAGE_KEY, String(enabled));
    return true;
  } catch {
    return false;
  }
}
