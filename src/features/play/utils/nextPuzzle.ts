import type {
  PuzzleSession,
  StartPuzzleSessionParams,
} from '../../../puzzle/hooks';
import type { PuzzleSessionReplacement } from '../../../puzzle/hooks/usePuzzleSession';
import type { PuzzlePhotoResult } from '../../../services/unsplash';

type NextPuzzleLayout = Pick<
  StartPuzzleSessionParams,
  | 'boardMaxWidth'
  | 'boardMaxHeight'
  | 'traySurfaceExtent'
  | 'trayPlacement'
>;

export type NextPuzzleStartResult =
  | 'started'
  | 'start_failed'
  | 'tracking_failed'
  | 'cancelled';

type NextPuzzleStartDependencies = {
  beginSessionReplacement: (
    params: StartPuzzleSessionParams,
    isRequestCurrent: () => boolean,
  ) => Promise<PuzzleSessionReplacement | null>;
  enqueuePhotoUse: () => Promise<void>;
  commitSessionReplacement: (
    replacement: PuzzleSessionReplacement,
    isRequestCurrent: () => boolean,
  ) => Promise<boolean>;
  rollbackSessionReplacement: (
    replacement: PuzzleSessionReplacement,
  ) => Promise<boolean>;
};

export type NextPuzzleRequest = {
  readonly id: number;
  readonly controller: AbortController;
};

export type NextPuzzleRequestState = {
  generation: number;
  current: NextPuzzleRequest | null;
};

export function createNextPuzzleRequestState(): NextPuzzleRequestState {
  return { generation: 0, current: null };
}

export function cancelNextPuzzleRequest(
  state: NextPuzzleRequestState,
): boolean {
  const previous = state.current;
  state.current = null;
  state.generation += 1;
  previous?.controller.abort();
  return previous !== null;
}

export function beginNextPuzzleRequest(
  state: NextPuzzleRequestState,
  controller = new AbortController(),
): NextPuzzleRequest {
  // Replacement always makes the previous signal stale before it is aborted.
  cancelNextPuzzleRequest(state);
  const request = { id: ++state.generation, controller };
  state.current = request;
  return request;
}

export function isNextPuzzleRequestCurrent(
  state: NextPuzzleRequestState,
  request: NextPuzzleRequest,
): boolean {
  return state.current === request && !request.controller.signal.aborted;
}

export function finishNextPuzzleRequest(
  state: NextPuzzleRequestState,
  request: NextPuzzleRequest,
): boolean {
  if (!isNextPuzzleRequestCurrent(state, request)) {
    return false;
  }
  state.current = null;
  return true;
}

/**
 * A new Unsplash use belongs to a session that actually started. Once it has
 * started, failure to durably enqueue that required use rolls the session back
 * instead of leaving untracked resumable play behind.
 */
export async function startTrackedNextPuzzle(
  params: StartPuzzleSessionParams,
  {
    beginSessionReplacement,
    enqueuePhotoUse,
    commitSessionReplacement,
    rollbackSessionReplacement,
  }: NextPuzzleStartDependencies,
  isRequestCurrent = () => true,
): Promise<NextPuzzleStartResult> {
  if (!isRequestCurrent()) {
    return 'cancelled';
  }

  const replacement = await beginSessionReplacement(params, isRequestCurrent);
  if (!replacement) {
    return isRequestCurrent() ? 'start_failed' : 'cancelled';
  }
  if (!isRequestCurrent()) {
    await rollbackSessionReplacement(replacement).catch(() => false);
    return 'cancelled';
  }

  try {
    await enqueuePhotoUse();
  } catch {
    const failureBelongsToCurrentRequest = isRequestCurrent();
    await rollbackSessionReplacement(replacement).catch(() => false);
    return failureBelongsToCurrentRequest ? 'tracking_failed' : 'cancelled';
  }

  if (!isRequestCurrent()) {
    await rollbackSessionReplacement(replacement).catch(() => false);
    return 'cancelled';
  }
  if (
    !(await commitSessionReplacement(replacement, isRequestCurrent))
  ) {
    await rollbackSessionReplacement(replacement).catch(() => false);
    return 'cancelled';
  }
  return 'started';
}

export function buildNextPuzzleSessionParams(
  current: PuzzleSession,
  result: PuzzlePhotoResult,
  layout: NextPuzzleLayout,
): StartPuzzleSessionParams {
  const { photo, category } = result;
  return {
    image: {
      uri: photo.urls.regular,
      width: photo.width,
      height: photo.height,
      accessibilityLabel:
        photo.alt_description ?? `${category.label} puzzle photograph`,
      attribution: {
        photographerName: photo.user.name,
        photographerUrl: photo.user.links.html,
        sourceName: 'Unsplash',
        sourceUrl:
          'https://unsplash.com/?utm_source=frume&utm_medium=referral',
      },
    },
    cutterId: current.cutterId,
    difficulty: current.difficulty,
    guideMode: current.guideMode,
    ...layout,
  };
}
