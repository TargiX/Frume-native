import type {
  PuzzleCutterId,
  PuzzleDifficulty,
  PuzzleImageSource,
} from './types';

/** A single, repeatable sample, never a general premium entitlement. */
export const DISCOVERY_IMAGE: PuzzleImageSource = {
  uri: 'frume://coastal-morning',
  width: 1024,
  height: 1536,
  accessibilityLabel:
    'Coastal morning — a sunlit garden above a turquoise cove',
  contentSource: { kind: 'bundled', id: 'coastal-morning' },
};
export const DISCOVERY_DIFFICULTY: PuzzleDifficulty = '4x4';
export function isDiscoveryPuzzle(
  image: PuzzleImageSource,
  cutter: PuzzleCutterId,
  difficulty: PuzzleDifficulty,
): boolean {
  return (
    image.uri === DISCOVERY_IMAGE.uri &&
    image.width === 1024 &&
    image.height === 1536 &&
    image.contentSource?.kind === 'bundled' &&
    image.contentSource.id === 'coastal-morning' &&
    cutter === 'organic' &&
    difficulty === DISCOVERY_DIFFICULTY
  );
}
