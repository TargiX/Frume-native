import { describe, expect, it, vi } from 'vitest';
import { openLibraryEntry } from './openLibraryEntry';
import type { LibraryPuzzle } from '../../../puzzle/persistence/PuzzleLibrary';
import type { PuzzleSession } from '../../../puzzle/hooks';
const entry = (completed: boolean) =>
  ({
    id: 'saved',
    snapshot: { engine: { status: completed ? 'completed' : 'paused' } },
  }) as LibraryPuzzle;
function actions() {
  return {
    hasAccess: vi.fn().mockResolvedValue(true),
    openSession: vi.fn().mockResolvedValue({} as PuzzleSession),
    viewCompleted: vi.fn(),
    isCurrent: () => true,
  };
}
describe('opening saved pictures', () => {
  it('views a completed picture even when replacing the active game would fail on a full shelf', async () => {
    const deps = actions();
    deps.openSession.mockResolvedValue(null);
    const saved = entry(true);
    expect(await openLibraryEntry(saved, deps)).toEqual({ kind: 'viewed' });
    expect(deps.viewCompleted).toHaveBeenCalledWith(saved);
    expect(deps.openSession).not.toHaveBeenCalled();
    expect(deps.hasAccess).not.toHaveBeenCalled();
  });
  it('still verifies access before resuming an unfinished premium game', async () => {
    const deps = actions();
    deps.hasAccess.mockResolvedValue(false);
    expect(await openLibraryEntry(entry(false), deps)).toEqual({
      kind: 'blocked',
    });
    expect(deps.openSession).not.toHaveBeenCalled();
  });
  it('does not open a game if the screen loses ownership during access verification', async () => {
    const deps = actions();
    let current = true;
    deps.isCurrent = () => current;
    deps.hasAccess.mockImplementation(async () => {
      current = false;
      return true;
    });
    expect(await openLibraryEntry(entry(false), deps)).toEqual({
      kind: 'cancelled',
    });
    expect(deps.openSession).not.toHaveBeenCalled();
  });
});
