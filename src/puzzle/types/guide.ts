import type { PuzzleGuideMode } from './layout';

export const PUZZLE_GUIDE_OPTIONS: readonly {
  id: PuzzleGuideMode;
  label: string;
  detail: string;
}[] = [
  {
    id: 'none',
    label: 'Clean board',
    detail: 'No placement hints',
  },
  {
    id: 'grid',
    label: 'Grid',
    detail: 'Simple dashed cells',
  },
  {
    id: 'cuts',
    label: 'Cut shapes',
    detail: 'Exact piece outlines',
  },
  {
    id: 'image',
    label: 'Photo',
    detail: 'Faint picture overlay',
  },
] as const;

export function nextPuzzleGuideMode(
  current: PuzzleGuideMode,
): PuzzleGuideMode {
  const index = PUZZLE_GUIDE_OPTIONS.findIndex(
    (option) => option.id === current,
  );
  return PUZZLE_GUIDE_OPTIONS[
    (Math.max(0, index) + 1) % PUZZLE_GUIDE_OPTIONS.length
  ].id;
}

export function puzzleGuideLabel(mode: PuzzleGuideMode): string {
  return (
    PUZZLE_GUIDE_OPTIONS.find((option) => option.id === mode)?.label ??
    'Cut shapes'
  );
}
