import type {
  PuzzleSession,
  StartPuzzleSessionParams,
} from '../../../puzzle/hooks';
import type { PuzzleSessionReplacement } from '../../../puzzle/hooks/usePuzzleSession';
import type { PuzzlePhotoResult } from '../../../services/unsplash';
import type { PuzzleImageContentSource } from '../../../puzzle/types';

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
  | 'commit_failed'
  | 'rollback_failed'
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
 * A new Unsplash use is durably queued before its prepared session can become
 * resumable. A later commit failure can conservatively over-report an attempted
 * use, but the reverse state — resumable play with no durable receipt — is
 * never exposed.
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
    const rolledBack = await rollbackSessionReplacement(replacement).catch(
      () => false,
    );
    return rolledBack ? 'cancelled' : 'rollback_failed';
  }

  try {
    await enqueuePhotoUse();
  } catch {
    const failureBelongsToCurrentRequest = isRequestCurrent();
    const rolledBack = await rollbackSessionReplacement(replacement).catch(
      () => false,
    );
    if (!rolledBack) {
      return 'rollback_failed';
    }
    return failureBelongsToCurrentRequest ? 'tracking_failed' : 'cancelled';
  }

  if (!isRequestCurrent()) {
    const rolledBack = await rollbackSessionReplacement(replacement).catch(
      () => false,
    );
    return rolledBack ? 'cancelled' : 'rollback_failed';
  }
  if (
    !(await commitSessionReplacement(replacement, isRequestCurrent))
  ) {
    const failureBelongsToCurrentRequest = isRequestCurrent();
    const rolledBack = await rollbackSessionReplacement(replacement).catch(
      () => false,
    );
    if (!rolledBack) {
      return 'rollback_failed';
    }
    return failureBelongsToCurrentRequest ? 'commit_failed' : 'cancelled';
  }
  return 'started';
}

/**
 * A category label is meaningful only beside the category identifier that the
 * next request can actually repeat. Surprise results deliberately remain a
 * generic Unsplash intent even though the returned photo has a display theme.
 */
export function createUnsplashContentSource(
  categoryId?: string,
  categoryLabel?: string,
): PuzzleImageContentSource {
  return {
    kind: 'unsplash',
    ...(categoryId
      ? {
          categoryId,
          ...(categoryLabel ? { categoryLabel } : {}),
        }
      : {}),
  };
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
      contentSource:
        current.layout.image.contentSource?.kind === 'unsplash'
          ? createUnsplashContentSource(
              current.layout.image.contentSource.categoryId,
              current.layout.image.contentSource.categoryLabel,
            )
          : createUnsplashContentSource(),
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
