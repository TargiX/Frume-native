export function formatPuzzleElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function puzzleStatusLabel(
  placedCount: number,
  totalCount: number,
  elapsedMs: number,
): string {
  return `${placedCount} / ${totalCount} · ${formatPuzzleElapsed(elapsedMs)}`;
}
