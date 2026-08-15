import AsyncStorage from '@react-native-async-storage/async-storage';

export const ANALYTICS_INSTALLATION_ID_STORAGE_KEY =
  '@frume/analytics-installation-id';

const INSTALLATION_ID_PATTERN = /^[0-9a-f]{32}$/;

type InstallationIdStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

/**
 * Builds a random identifier without a crypto dependency.
 *
 * `Math.random` is adequate here and a native random source is not worth a new
 * dependency in the archive-scanned tree: this value labels one installation so
 * events can be joined into a funnel, it is never an authenticator, and the
 * capture endpoint accepts any identifier from anyone regardless. Thirty-two
 * hex characters drawn from several draws make practical collisions
 * irrelevant at any plausible install base.
 */
function randomInstallationId(): string {
  let id = '';
  while (id.length < 32) {
    id += Math.floor(Math.random() * 0x100000000)
      .toString(16)
      .padStart(8, '0');
  }
  return id.slice(0, 32);
}

/**
 * Returns the anonymous per-installation identifier, creating it on first use.
 *
 * This is Frume's own random value. It is deliberately not the advertising
 * identifier, not the vendor identifier, and not derived from any device
 * property, so it cannot be joined with anything outside Frume and disappears
 * when the app is deleted or the player opts out.
 *
 * Returns null when storage is unavailable, which suppresses collection rather
 * than inventing a per-launch identity that would inflate install counts.
 */
export async function loadAnalyticsInstallationId(
  storage: InstallationIdStorage = AsyncStorage,
): Promise<string | null> {
  try {
    const stored = await storage.getItem(ANALYTICS_INSTALLATION_ID_STORAGE_KEY);
    if (stored !== null && INSTALLATION_ID_PATTERN.test(stored)) {
      return stored;
    }
    const created = randomInstallationId();
    await storage.setItem(ANALYTICS_INSTALLATION_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return null;
  }
}

/**
 * Forgets the identifier so re-enabling collection starts a new, unlinkable
 * installation rather than resuming the previous one.
 */
export async function clearAnalyticsInstallationId(
  storage: InstallationIdStorage = AsyncStorage,
): Promise<void> {
  try {
    await storage.removeItem(ANALYTICS_INSTALLATION_ID_STORAGE_KEY);
  } catch {
    // Opt-out still stops collection: the client drops its in-memory
    // identifier regardless, and no further event can carry this one.
  }
}
