import type { PuzzleSession } from '../../../puzzle/hooks';
import type { LibraryPuzzle } from '../../../puzzle/persistence/PuzzleLibrary';

export type LibraryOpenResult =
  | { kind: 'viewed' }
  | { kind: 'opened'; session: PuzzleSession }
  | { kind: 'blocked' }
  | { kind: 'cancelled' }
  | { kind: 'failed' };

/** One navigation boundary for saved pictures and resumable games. */
export async function openLibraryEntry(
  entry: LibraryPuzzle,
  actions: {
    hasAccess: () => boolean | Promise<boolean>;
    openSession: (id: string) => Promise<PuzzleSession | null>;
    viewCompleted: (entry: LibraryPuzzle) => void;
    isCurrent: () => boolean;
  },
): Promise<LibraryOpenResult> {
  if (!actions.isCurrent()) return { kind: 'cancelled' };
  if (entry.snapshot.engine.status === 'completed') {
    actions.viewCompleted(entry);
    return { kind: 'viewed' };
  }
  if (!(await actions.hasAccess())) return { kind: 'blocked' };
  if (!actions.isCurrent()) return { kind: 'cancelled' };
  const session = await actions.openSession(entry.id);
  if (!actions.isCurrent()) return { kind: 'cancelled' };
  return session ? { kind: 'opened', session } : { kind: 'failed' };
}
