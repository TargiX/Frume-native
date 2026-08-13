import AsyncStorage from '@react-native-async-storage/async-storage';

export const HOW_TO_PLAY_SEEN_STORAGE_KEY = '@frume/how-to-play-seen-v1';

type HowToPlayStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export async function loadHowToPlaySeen(
  storage: HowToPlayStorage = AsyncStorage,
): Promise<boolean> {
  try {
    return (await storage.getItem(HOW_TO_PLAY_SEEN_STORAGE_KEY)) === 'true';
  } catch {
    // Teaching is safer to repeat than to suppress when preferences are lost.
    return false;
  }
}

export async function saveHowToPlaySeen(
  storage: HowToPlayStorage = AsyncStorage,
): Promise<boolean> {
  try {
    await storage.setItem(HOW_TO_PLAY_SEEN_STORAGE_KEY, 'true');
    return true;
  } catch {
    return false;
  }
}
