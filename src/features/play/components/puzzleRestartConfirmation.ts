export type PuzzleRestartConfirmation = {
  title: string;
  message: string;
  confirmLabel: string;
};

export function puzzleRestartConfirmation(
  placedCount: number,
  totalCount: number,
): PuzzleRestartConfirmation {
  const progress = Math.max(0, Math.min(placedCount, totalCount));
  return {
    title: 'Restart puzzle?',
    message:
      progress > 0
        ? `All ${progress} placed ${progress === 1 ? 'piece' : 'pieces'} will return to the tray, and the timer will reset.`
        : 'Every piece will return to the tray, and the timer will reset.',
    confirmLabel: 'Restart',
  };
}
