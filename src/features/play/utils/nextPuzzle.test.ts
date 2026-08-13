import { describe, expect, it, vi } from 'vitest';

import type { PuzzleSession } from '../../../puzzle/hooks';
import type { PuzzlePhotoResult } from '../../../services/unsplash';
import {
  beginNextPuzzleRequest,
  buildNextPuzzleSessionParams,
  cancelNextPuzzleRequest,
  createUnsplashContentSource,
  createNextPuzzleRequestState,
  isNextPuzzleRequestCurrent,
  startTrackedNextPuzzle,
} from './nextPuzzle';

describe('next puzzle session', () => {
  it('keeps the current play settings while replacing the photograph', () => {
    const current = {
      cutterId: 'organic',
      difficulty: '5x5',
      guideMode: 'grid',
      layout: {
        image: {
          contentSource: {
            kind: 'unsplash',
            categoryId: 'nature',
            categoryLabel: 'Nature',
          },
        },
      },
    } as PuzzleSession;
    const result = {
      photo: {
        id: 'next-photo',
        width: 1600,
        height: 900,
        alt_description: 'A calm mountain lake',
        urls: { regular: 'https://images.unsplash.com/next-photo' },
        user: {
          name: 'Ada',
          links: {
            html: 'https://unsplash.com/@ada?utm_source=frume&utm_medium=referral',
          },
        },
        links: {
          download_location:
            'https://api.unsplash.com/photos/next-photo/download',
        },
      },
      category: { id: 'nature', label: 'Nature' },
      tracking_token: '11111111-1111-4111-8111-111111111111',
    } as PuzzlePhotoResult;

    const params = buildNextPuzzleSessionParams(current, result, {
      boardMaxWidth: 700,
      boardMaxHeight: 420,
      trayPlacement: 'right',
    });

    expect(params.cutterId).toBe('organic');
    expect(params.difficulty).toBe('5x5');
    expect(params.guideMode).toBe('grid');
    expect(params.image.uri).toBe(result.photo.urls.regular);
    expect(params.image.contentSource).toEqual({
      kind: 'unsplash',
      categoryId: 'nature',
      categoryLabel: 'Nature',
    });
    expect(params.image.attribution?.photographerName).toBe('Ada');
  });

  it('keeps Surprise as a random intent instead of inventing a fixed category', () => {
    expect(createUnsplashContentSource(undefined, 'Nature')).toEqual({
      kind: 'unsplash',
    });

    const current = {
      cutterId: 'classic',
      difficulty: '3x3',
      layout: {
        image: {
          contentSource: { kind: 'unsplash', categoryLabel: 'Nature' },
        },
      },
    } as PuzzleSession;
    const result = {
      photo: {
        id: 'surprise-photo',
        width: 1600,
        height: 900,
        alt_description: null,
        urls: { regular: 'https://images.unsplash.com/surprise-photo' },
        user: {
          name: 'Ada',
          links: { html: 'https://unsplash.com/@ada' },
        },
        links: {
          download_location:
            'https://api.unsplash.com/photos/surprise-photo/download',
        },
      },
      category: { id: 'nature', label: 'Nature' },
      tracking_token: '11111111-1111-4111-8111-111111111111',
    } as PuzzlePhotoResult;

    expect(
      buildNextPuzzleSessionParams(current, result, {
        boardMaxWidth: 700,
        boardMaxHeight: 420,
        trayPlacement: 'right',
      }).image.contentSource,
    ).toEqual({ kind: 'unsplash' });
  });

  it('persists required photo use after preparation and before durable commit', async () => {
    const order: string[] = [];
    const replacement = { id: 'replacement' } as never;
    const params = {} as Parameters<typeof startTrackedNextPuzzle>[0];
    const result = await startTrackedNextPuzzle(params, {
      beginSessionReplacement: vi.fn(async () => {
        order.push('start');
        return replacement;
      }),
      enqueuePhotoUse: vi.fn(async () => {
        order.push('track');
      }),
      commitSessionReplacement: vi.fn(async () => {
        order.push('commit');
        return true;
      }),
      rollbackSessionReplacement: vi.fn(async () => true),
    });

    expect(result).toBe('started');
    expect(order).toEqual(['start', 'track', 'commit']);
  });

  it('does not track when session preparation fails', async () => {
    const enqueuePhotoUse = vi.fn().mockResolvedValue(undefined);
    const rollbackSessionReplacement = vi.fn();

    const result = await startTrackedNextPuzzle(
      {} as Parameters<typeof startTrackedNextPuzzle>[0],
      {
        beginSessionReplacement: vi.fn().mockResolvedValue(null),
        enqueuePhotoUse,
        commitSessionReplacement: vi.fn(),
        rollbackSessionReplacement,
      },
    );

    expect(result).toBe('start_failed');
    expect(enqueuePhotoUse).not.toHaveBeenCalled();
    expect(rollbackSessionReplacement).not.toHaveBeenCalled();
  });

  it('restores the exact prior session when tracking cannot be persisted', async () => {
    const previousSession = { engine: { id: 'completed-engine' } };
    const replacement = {
      previousSession,
      nextSession: { engine: { id: 'next-engine' } },
    } as never;
    const order: string[] = [];
    const rollbackSessionReplacement = vi.fn(async (received) => {
      order.push('rollback');
      expect(received).toBe(replacement);
      expect((received as { previousSession: unknown }).previousSession).toBe(
        previousSession,
      );
      return true;
    });

    const result = await startTrackedNextPuzzle(
      {} as Parameters<typeof startTrackedNextPuzzle>[0],
      {
        beginSessionReplacement: vi.fn(async () => {
          order.push('start');
          return replacement;
        }),
        enqueuePhotoUse: vi.fn(async () => {
          order.push('track');
          throw new Error('storage full');
        }),
        commitSessionReplacement: vi.fn(),
        rollbackSessionReplacement,
      },
    );

    expect(result).toBe('tracking_failed');
    expect(order).toEqual(['start', 'track', 'rollback']);
    expect(rollbackSessionReplacement).toHaveBeenCalledTimes(1);
  });

  it('rolls back instead of committing when cancellation arrives during tracking', async () => {
    let current = true;
    const replacement = { id: 'replacement' } as never;
    const commitSessionReplacement = vi.fn();
    const rollbackSessionReplacement = vi.fn(async () => true);

    const result = await startTrackedNextPuzzle(
      {} as Parameters<typeof startTrackedNextPuzzle>[0],
      {
        beginSessionReplacement: vi.fn().mockResolvedValue(replacement),
        enqueuePhotoUse: vi.fn(async () => {
          current = false;
        }),
        commitSessionReplacement,
        rollbackSessionReplacement,
      },
      () => current,
    );

    expect(result).toBe('cancelled');
    expect(commitSessionReplacement).not.toHaveBeenCalled();
    expect(rollbackSessionReplacement).toHaveBeenCalledWith(replacement);
  });

  it('marks an old request stale before aborting it when a replacement begins', () => {
    const state = createNextPuzzleRequestState();
    const events: string[] = [];
    const firstController = new AbortController();
    const first = beginNextPuzzleRequest(state, firstController);
    firstController.signal.addEventListener('abort', () => {
      events.push(
        isNextPuzzleRequestCurrent(state, first) ? 'still-current' : 'stale',
      );
    });

    const second = beginNextPuzzleRequest(state, new AbortController());

    expect(events).toEqual(['stale']);
    expect(first.controller.signal.aborted).toBe(true);
    expect(isNextPuzzleRequestCurrent(state, first)).toBe(false);
    expect(isNextPuzzleRequestCurrent(state, second)).toBe(true);

    cancelNextPuzzleRequest(state);
    expect(second.controller.signal.aborted).toBe(true);
  });
});
