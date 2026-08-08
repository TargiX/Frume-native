import type { PuzzleDifficulty } from '../puzzle/types';

export type PlayStackParamList = {
  PlayHome: undefined;
  AboutSupport: undefined;
  Gallery: undefined;
  Difficulty: {
    imageUri: string;
    imageWidth: number;
    imageHeight: number;
    photographerName?: string;
    photographerUrl?: string;
    photoDescription?: string;
    /** The theme the player asked for; absent means "Surprise me". */
    categoryId?: string;
    categoryLabel?: string;
    /** Unsplash endpoint pinged when the photo is actually played. */
    downloadLocation: string;
    /** Opaque proxy-issued token for this distinct photo use. */
    trackingToken: string;
  };
  Game: {
    difficulty: PuzzleDifficulty;
  };
};
