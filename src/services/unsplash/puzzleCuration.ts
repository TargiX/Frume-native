export type PuzzleCategory = {
  id: string;
  label: string;
};

/** Themes that work well as photo puzzles — no abstract textures. */
export const PUZZLE_CATEGORIES: readonly PuzzleCategory[] = [
  { id: 'nature', label: 'Nature' },
  { id: 'city', label: 'City' },
  { id: 'animals', label: 'Animals' },
  { id: 'travel', label: 'Travel' },
  { id: 'food', label: 'Food' },
  { id: 'ocean', label: 'Ocean' },
] as const;
