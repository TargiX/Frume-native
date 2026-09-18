export type PuzzleTableAppearance = 'felt' | 'photo-glass' | 'linen';

export const DEFAULT_PUZZLE_TABLE_APPEARANCE: PuzzleTableAppearance =
  'photo-glass';

export function parsePuzzleTableAppearance(
  value: unknown,
): PuzzleTableAppearance {
  return value === 'felt' || value === 'photo-glass' || value === 'linen'
    ? value
    : DEFAULT_PUZZLE_TABLE_APPEARANCE;
}
