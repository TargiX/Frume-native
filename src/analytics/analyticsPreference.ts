import AsyncStorage from '@react-native-async-storage/async-storage';

export const ANALYTICS_ENABLED_STORAGE_KEY = '@frume/analytics-enabled';

export type AnalyticsPreferenceLoadResult =
  | { status: 'loaded'; enabled: boolean }
  | { status: 'failed'; enabled: false };

export type AnalyticsSettingFeedback = {
  kind: 'loading' | 'on' | 'off' | 'error';
  message: string;
  retryAvailable: boolean;
  retryLabel: 'Retry loading' | 'Retry saving';
};

type AnalyticsPreferenceStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

type AnalyticsSettingFeedbackInput = {
  preferenceLoaded: boolean;
  analyticsEnabled: boolean;
  preferenceLoadFailed: boolean;
  preferenceSaveFailed: boolean;
};

/**
 * Nothing is collected until the stored choice is known, so a player who has
 * opted out is never measured during the window before their preference loads.
 */
export function shouldCollectAnalytics(
  preferenceLoaded: boolean,
  analyticsEnabled: boolean,
): boolean {
  return preferenceLoaded && analyticsEnabled;
}

export function getAnalyticsSettingFeedback({
  preferenceLoaded,
  analyticsEnabled,
  preferenceLoadFailed,
  preferenceSaveFailed,
}: AnalyticsSettingFeedbackInput): AnalyticsSettingFeedback {
  if (preferenceLoadFailed) {
    return {
      kind: 'error',
      message:
        'This setting could not be loaded. Nothing is being measured until you retry.',
      retryAvailable: true,
      retryLabel: 'Retry loading',
    };
  }
  if (preferenceSaveFailed) {
    return {
      kind: 'error',
      message: analyticsEnabled
        ? 'Anonymous usage is on for now, but this setting was not saved.'
        : 'Anonymous usage is off for now, but this setting was not saved.',
      retryAvailable: true,
      retryLabel: 'Retry saving',
    };
  }
  if (!preferenceLoaded) {
    return {
      kind: 'loading',
      message: 'Loading this setting…',
      retryAvailable: false,
      retryLabel: 'Retry loading',
    };
  }
  return analyticsEnabled
    ? {
        kind: 'on',
        message:
          'Which screens and puzzle sizes are used, with no account, no advertising identifier, and no photo data',
        retryAvailable: false,
        retryLabel: 'Retry saving',
      }
    : {
        kind: 'off',
        message: 'Nothing about your use of Frume is measured',
        retryAvailable: false,
        retryLabel: 'Retry saving',
      };
}

/**
 * Defaults to on for an unset preference.
 *
 * That default is only defensible because collection is anonymous, carries no
 * advertising identifier, creates no person profile, and is switchable off in
 * About & Support — and because Frume 1.0 ships outside the EU. **Adding an EU
 * storefront requires making this opt-in or adding a consent step first.**
 *
 * A storage failure fails closed: an unknown choice is treated as no consent.
 */
export async function loadAnalyticsEnabled(
  storage: AnalyticsPreferenceStorage = AsyncStorage,
): Promise<AnalyticsPreferenceLoadResult> {
  try {
    const stored = await storage.getItem(ANALYTICS_ENABLED_STORAGE_KEY);
    return {
      status: 'loaded',
      enabled: stored === null ? true : stored !== 'false',
    };
  } catch {
    return { status: 'failed', enabled: false };
  }
}

export async function saveAnalyticsEnabled(
  enabled: boolean,
  storage: AnalyticsPreferenceStorage = AsyncStorage,
): Promise<boolean> {
  try {
    await storage.setItem(ANALYTICS_ENABLED_STORAGE_KEY, String(enabled));
    return true;
  } catch {
    return false;
  }
}
