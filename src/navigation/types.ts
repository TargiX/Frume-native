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
    /** Managed file staged by the picker; released if setup is abandoned. */
    ownPhotoCandidateUri?: string;
    /** The theme the player asked for; absent means "Surprise me". */
    categoryId?: string;
    categoryLabel?: string;
  } & (
    | {
        /** Unsplash endpoint pinged when the photo is actually played. */
        downloadLocation: string;
        /** Opaque proxy-issued token for this distinct photo use. */
        trackingToken: string;
      }
    // A photograph the player brought themselves: nothing to report to a
    // provider, so the pair is absent rather than empty. Keeping it a pair
    // makes a half-filled provider photo unrepresentable.
    | { downloadLocation?: undefined; trackingToken?: undefined }
  );
  Game: {
    difficulty: PuzzleDifficulty;
  };
};
