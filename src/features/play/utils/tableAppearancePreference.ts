import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_PUZZLE_TABLE_APPEARANCE,
  parsePuzzleTableAppearance,
  type PuzzleTableAppearance,
} from '../../../puzzle/types';

export const TABLE_APPEARANCE_STORAGE_KEY = '@frume/table-appearance';

type TableAppearanceStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export async function loadTableAppearance(
  storage: TableAppearanceStorage = AsyncStorage,
): Promise<PuzzleTableAppearance> {
  try {
    return parsePuzzleTableAppearance(
      await storage.getItem(TABLE_APPEARANCE_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_PUZZLE_TABLE_APPEARANCE;
  }
}

export async function saveTableAppearance(
  appearance: PuzzleTableAppearance,
  storage: TableAppearanceStorage = AsyncStorage,
): Promise<boolean> {
  try {
    await storage.setItem(TABLE_APPEARANCE_STORAGE_KEY, appearance);
    return true;
  } catch {
    return false;
  }
}
