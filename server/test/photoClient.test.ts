import { afterEach, describe, expect, it, vi } from 'vitest';

const asyncStorageState = vi.hoisted(() => ({
  values: new Map<string, string>(),
  setError: null as Error | null,
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    async getItem(key: string) {
      return asyncStorageState.values.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      if (asyncStorageState.setError) {
        throw asyncStorageState.setError;
      }
      asyncStorageState.values.set(key, value);
    },
    async removeItem(key: string) {
      asyncStorageState.values.delete(key);
    },
  },
}));

import {
  enqueuePhotoUse,
  fetchPuzzlePhoto,
  PhotoApiError,
  resolvePuzzlePhotoTargetAspect,
  retryPendingPhotoUses,
  trackPhotoUse,
} from '../../src/services/unsplash';
import { PHOTO_API_REQUEST_TIMEOUT_MS } from '../../src/services/unsplash/photoApi';

const PHOTO_RESPONSE = {
  photo: {
    id: 'photo_123',
    width: 1600,
    height: 1000,
    alt_description: 'A mountain lake below a cloudy sky',
    urls: {
      regular: 'https://images.unsplash.com/photo-123?ixid=hotlink-token',
    },
    user: {
      name: 'Ada Photographer',
      links: {
        html:
          'https://unsplash.com/@ada?utm_source=frume&utm_medium=referral',
      },
    },
    links: {
      download_location:
        'https://api.unsplash.com/photos/photo_123/download?ixid=tracking-token',
    },
  },
  category: { id: 'nature', label: 'Nature' },
  tracking_token: '123e4567-e89b-42d3-a456-426614174000',
};

afterEach(() => {
  vi.useRealTimers();
  asyncStorageState.values.clear();
  asyncStorageState.setError = null;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('fetchPuzzlePhoto', () => {
  it('bounds safe-area viewport aspects to playable portrait and landscape ratios', () => {
    expect(resolvePuzzlePhotoTargetAspect(390, 751)).toBe(9 / 16);
    expect(resolvePuzzlePhotoTargetAspect(785, 297)).toBe(16 / 9);
    expect(resolvePuzzlePhotoTargetAspect(768, 1_024)).toBe(0.75);
    expect(resolvePuzzlePhotoTargetAspect(0, 844)).toBeNull();
    expect(resolvePuzzlePhotoTargetAspect(Number.NaN, 844)).toBeNull();
  });

  it('ends a hung photo request after the client deadline', async () => {
    vi.useFakeTimers();
    vi.stubEnv('EXPO_PUBLIC_PHOTO_API_URL', 'https://photos.example.test');
    let requestSignal: AbortSignal | null = null;
    const networkFetch = vi.fn((_url: string, init?: RequestInit) => {
      requestSignal = init?.signal ?? null;
      return new Promise<Response>(() => {
        // Model a native request that never resolves, even after cancellation.
      });
    });
    vi.stubGlobal('fetch', networkFetch);

    let rejection: unknown;
    void fetchPuzzlePhoto('nature').catch((error: unknown) => {
      rejection = error;
    });

    await vi.advanceTimersByTimeAsync(PHOTO_API_REQUEST_TIMEOUT_MS);

    expect(rejection).toMatchObject({
      name: 'PhotoApiError',
      code: 'request_timeout',
    });
    expect((requestSignal as AbortSignal | null)?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses one deadline across the bounded Worker warm-up retry', async () => {
    vi.useFakeTimers();
    vi.stubEnv('EXPO_PUBLIC_PHOTO_API_URL', 'https://photos.example.test');
    const networkFetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { error: 'Photo pool is warming' },
          { status: 503, headers: { 'Retry-After': '5' } },
        ),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>(() => {
            // The second attempt also hangs.
          }),
      );
    vi.stubGlobal('fetch', networkFetch);

    let rejection: unknown;
    void fetchPuzzlePhoto('nature').catch((error: unknown) => {
      rejection = error;
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(networkFetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(networkFetch).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(
      PHOTO_API_REQUEST_TIMEOUT_MS - 5_001,
    );
    expect(rejection).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    expect(rejection).toMatchObject({
      name: 'PhotoApiError',
      code: 'request_timeout',
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves caller cancellation and removes its deadline resources', async () => {
    vi.useFakeTimers();
    vi.stubEnv('EXPO_PUBLIC_PHOTO_API_URL', 'https://photos.example.test');
    let requestSignal: AbortSignal | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        requestSignal = init?.signal ?? null;
        return new Promise<Response>(() => {
          // Model a native request that ignores abort.
        });
      }),
    );
    const controller = new AbortController();
    const removeAbortListener = vi.spyOn(
      controller.signal,
      'removeEventListener',
    );
    const cancellation = new Error('Newer category selected');
    const request = fetchPuzzlePhoto('nature', controller.signal);
    const rejection = expect(request).rejects.toBe(cancellation);

    await vi.advanceTimersByTimeAsync(0);
    controller.abort(cancellation);

    await rejection;
    expect((requestSignal as AbortSignal | null)?.aborted).toBe(true);
    expect(removeAbortListener).toHaveBeenCalledWith(
      'abort',
      expect.any(Function),
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows a newer category request after cancelling a stale one', async () => {
    vi.useFakeTimers();
    vi.stubEnv('EXPO_PUBLIC_PHOTO_API_URL', 'https://photos.example.test');
    const cityResponse = {
      ...PHOTO_RESPONSE,
      category: { id: 'city', label: 'City' },
    };
    const networkFetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>(() => {
            // The stale request never settles.
          }),
      )
      .mockResolvedValueOnce(Response.json(cityResponse));
    vi.stubGlobal('fetch', networkFetch);
    const staleController = new AbortController();
    const staleRequest = fetchPuzzlePhoto('nature', staleController.signal);
    const staleCancellation = new Error('Replaced by City');
    const staleRejection = expect(staleRequest).rejects.toBe(staleCancellation);

    await vi.advanceTimersByTimeAsync(0);
    staleController.abort(staleCancellation);
    const currentRequest = fetchPuzzlePhoto('city');

    await staleRejection;
    await expect(currentRequest).resolves.toEqual(cityResponse);
    expect(networkFetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fails closed when the proxy URL is missing', async () => {
    vi.stubEnv('EXPO_PUBLIC_PHOTO_API_URL', '');
    const networkFetch = vi.fn();
    vi.stubGlobal('fetch', networkFetch);

    await expect(fetchPuzzlePhoto('nature')).rejects.toMatchObject({
      name: 'PhotoApiError',
      code: 'not_configured',
    });
    expect(networkFetch).not.toHaveBeenCalled();
  });

  it('uses the configured proxy, including a base path and category', async () => {
    vi.stubEnv(
      'EXPO_PUBLIC_PHOTO_API_URL',
      'https://photos.example.test/mobile-api',
    );
    const networkFetch = vi.fn().mockResolvedValue(Response.json(PHOTO_RESPONSE));
    vi.stubGlobal('fetch', networkFetch);
    const controller = new AbortController();

    const result = await fetchPuzzlePhoto('nature', controller.signal);

    expect(result).toEqual(PHOTO_RESPONSE);
    expect(networkFetch).toHaveBeenCalledTimes(1);
    const [url, init] = networkFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://photos.example.test/mobile-api/photo?category=nature',
    );
    expect(init).toMatchObject({
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    expect(init.signal).not.toBe(controller.signal);
    expect(init.signal?.aborted).toBe(false);
  });

  it('requests and enforces the current screen orientation', async () => {
    vi.stubEnv('EXPO_PUBLIC_PHOTO_API_URL', 'https://photos.example.test');
    const networkFetch = vi.fn().mockResolvedValue(
      Response.json({
        ...PHOTO_RESPONSE,
        photo: {
          ...PHOTO_RESPONSE.photo,
          width: 1000,
          height: 1600,
        },
      }),
    );
    vi.stubGlobal('fetch', networkFetch);

    await expect(
      fetchPuzzlePhoto('nature', undefined, 'portrait'),
    ).resolves.toMatchObject({
      photo: { width: 1000, height: 1600 },
    });
    expect(networkFetch.mock.calls[0]?.[0]).toBe(
      'https://photos.example.test/photo?category=nature&orientation=portrait',
    );

    networkFetch.mockResolvedValueOnce(Response.json(PHOTO_RESPONSE));
    await expect(
      fetchPuzzlePhoto('nature', undefined, 'portrait'),
    ).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('requests and enforces a bounded safe-viewport aspect target', async () => {
    vi.stubEnv('EXPO_PUBLIC_PHOTO_API_URL', 'https://photos.example.test');
    const portraitResponse = {
      ...PHOTO_RESPONSE,
      photo: {
        ...PHOTO_RESPONSE.photo,
        width: 1000,
        height: 1600,
      },
    };
    const networkFetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(portraitResponse));
    vi.stubGlobal('fetch', networkFetch);

    await expect(
      fetchPuzzlePhoto('nature', undefined, 'portrait', 0.6),
    ).resolves.toMatchObject({ photo: { width: 1000, height: 1600 } });
    expect(networkFetch.mock.calls[0]?.[0]).toBe(
      'https://photos.example.test/photo?category=nature&orientation=portrait&aspect=0.6',
    );

    networkFetch.mockResolvedValueOnce(
      Response.json({
        ...PHOTO_RESPONSE,
        photo: {
          ...PHOTO_RESPONSE.photo,
          width: 950,
          height: 1000,
        },
      }),
    );
    await expect(
      fetchPuzzlePhoto('nature', undefined, 'portrait', 0.6),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it.each([
    ['below the supported bound', 'portrait' as const, 0.5],
    ['above the supported bound', 'landscape' as const, 2],
    ['non-finite', 'landscape' as const, Number.POSITIVE_INFINITY],
    ['orientation mismatch', 'portrait' as const, 1.4],
  ])(
    'rejects a %s aspect target before network I/O',
    async (_label, orientation, aspect) => {
      vi.stubEnv('EXPO_PUBLIC_PHOTO_API_URL', 'https://photos.example.test');
      const networkFetch = vi.fn();
      vi.stubGlobal('fetch', networkFetch);

      await expect(
        fetchPuzzlePhoto('nature', undefined, orientation, aspect),
      ).rejects.toMatchObject({ code: 'invalid_request' });
      expect(networkFetch).not.toHaveBeenCalled();
    },
  );

  it('rejects malformed attribution instead of trusting an arbitrary response', async () => {
    vi.stubEnv('EXPO_PUBLIC_PHOTO_API_URL', 'https://photos.example.test');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          ...PHOTO_RESPONSE,
          photo: {
            ...PHOTO_RESPONSE.photo,
            user: {
              ...PHOTO_RESPONSE.photo.user,
              links: { html: 'https://example.test/not-unsplash' },
            },
          },
        }),
      ),
    );

    await expect(fetchPuzzlePhoto('nature')).rejects.toMatchObject({
      name: 'PhotoApiError',
      code: 'invalid_response',
    });
  });

  it.each([
    ['missing', undefined],
    ['malformed', 'not-a-canonical-uuidv4'],
  ])('rejects a %s server tracking token', async (_label, trackingToken) => {
    vi.stubEnv('EXPO_PUBLIC_PHOTO_API_URL', 'https://photos.example.test');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          ...PHOTO_RESPONSE,
          tracking_token: trackingToken,
        }),
      ),
    );

    await expect(fetchPuzzlePhoto('nature')).rejects.toMatchObject({
      name: 'PhotoApiError',
      code: 'invalid_response',
    });
  });

  it('rejects extreme photo ratios that make puzzle pieces unusably small', async () => {
    vi.stubEnv('EXPO_PUBLIC_PHOTO_API_URL', 'https://photos.example.test');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          ...PHOTO_RESPONSE,
          photo: {
            ...PHOTO_RESPONSE.photo,
            width: 4000,
            height: 800,
          },
        }),
      ),
    );

    await expect(fetchPuzzlePhoto('nature')).rejects.toMatchObject({
      name: 'PhotoApiError',
      code: 'invalid_response',
    });
  });

  it('surfaces proxy errors with their HTTP status', async () => {
    vi.stubEnv('EXPO_PUBLIC_PHOTO_API_URL', 'https://photos.example.test');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          { error: 'No photos available' },
          { status: 503 },
        ),
      ),
    );

    await expect(fetchPuzzlePhoto('nature')).rejects.toMatchObject({
      name: 'PhotoApiError',
      code: 'request_failed',
      status: 503,
      message: 'No photos available',
    });
  });

  it('retries one bounded Worker pool warm-up response', async () => {
    vi.stubEnv('EXPO_PUBLIC_PHOTO_API_URL', 'https://photos.example.test');
    const networkFetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { error: 'Photo pool is warming' },
          { status: 503, headers: { 'Retry-After': '0' } },
        ),
      )
      .mockResolvedValueOnce(Response.json(PHOTO_RESPONSE));
    vi.stubGlobal('fetch', networkFetch);

    await expect(fetchPuzzlePhoto('nature')).resolves.toEqual(PHOTO_RESPONSE);
    expect(networkFetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry an unbounded Retry-After response', async () => {
    vi.stubEnv('EXPO_PUBLIC_PHOTO_API_URL', 'https://photos.example.test');
    const networkFetch = vi.fn().mockResolvedValue(
      Response.json(
        { error: 'Photo service unavailable' },
        { status: 503, headers: { 'Retry-After': '60' } },
      ),
    );
    vi.stubGlobal('fetch', networkFetch);

    await expect(fetchPuzzlePhoto('nature')).rejects.toMatchObject({
      name: 'PhotoApiError',
      code: 'request_failed',
      status: 503,
    });
    expect(networkFetch).toHaveBeenCalledTimes(1);
  });

  it('rejects cleartext non-local proxy URLs', async () => {
    vi.stubEnv(
      'EXPO_PUBLIC_PHOTO_API_URL',
      'http://photos.example.test',
    );

    await expect(fetchPuzzlePhoto('nature')).rejects.toBeInstanceOf(
      PhotoApiError,
    );
    await expect(fetchPuzzlePhoto('nature')).rejects.toMatchObject({
      code: 'invalid_configuration',
    });
  });
});

describe('trackPhotoUse', () => {
  it('posts the download location and server token only to the configured proxy', async () => {
    vi.stubEnv('EXPO_PUBLIC_PHOTO_API_URL', 'https://photos.example.test/');
    const networkFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', networkFetch);

    await trackPhotoUse(
      PHOTO_RESPONSE.photo,
      PHOTO_RESPONSE.tracking_token,
    );

    expect(networkFetch).toHaveBeenCalledTimes(1);
    const [url, init] = networkFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://photos.example.test/track');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Content-Type')).toBe(
      'application/json',
    );
    expect(JSON.parse(String(init.body))).toEqual({
      downloadLocation:
        'https://api.unsplash.com/photos/photo_123/download?ixid=tracking-token',
      trackingToken: PHOTO_RESPONSE.tracking_token,
    });
  });

  it('rejects when the proxy cannot register the download', async () => {
    vi.stubEnv('EXPO_PUBLIC_PHOTO_API_URL', 'https://photos.example.test');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          { error: 'Unsplash returned an error', upstreamStatus: 429 },
          { status: 502 },
        ),
      ),
    );

    await expect(
      trackPhotoUse(PHOTO_RESPONSE.photo, PHOTO_RESPONSE.tracking_token),
    ).rejects.toMatchObject({
      name: 'PhotoApiError',
      code: 'request_failed',
      status: 502,
      message: 'Unsplash returned an error',
    });
    expect(asyncStorageState.values.size).toBe(1);
  });

  it('does nothing for a non-Unsplash photo without tracking metadata', async () => {
    const networkFetch = vi.fn();
    vi.stubGlobal('fetch', networkFetch);

    await trackPhotoUse({});

    expect(networkFetch).not.toHaveBeenCalled();
  });

  it('rejects an unsafe download location before storage or network use', async () => {
    const networkFetch = vi.fn();
    vi.stubGlobal('fetch', networkFetch);

    await expect(
      trackPhotoUse(
        {
          links: {
            download_location:
              'https://api.unsplash.com.evil.test/photos/photo_123/download',
          },
        },
        PHOTO_RESPONSE.tracking_token,
      ),
    ).rejects.toMatchObject({
      name: 'PhotoApiError',
      code: 'invalid_response',
    });

    expect(asyncStorageState.values.size).toBe(0);
    expect(networkFetch).not.toHaveBeenCalled();
  });

  it('rejects when the event cannot be persisted locally', async () => {
    const networkFetch = vi.fn();
    vi.stubGlobal('fetch', networkFetch);
    asyncStorageState.setError = new Error('device storage unavailable');

    await expect(
      enqueuePhotoUse(PHOTO_RESPONSE.photo, PHOTO_RESPONSE.tracking_token),
    ).rejects.toThrow('device storage unavailable');

    expect(asyncStorageState.values.size).toBe(0);
    expect(networkFetch).not.toHaveBeenCalled();
  });

  it('rejects an invalid token before storage or network use', async () => {
    const networkFetch = vi.fn();
    vi.stubGlobal('fetch', networkFetch);

    await expect(
      trackPhotoUse(PHOTO_RESPONSE.photo, '123e4567-e89b-12d3-a456-426614174000'),
    ).rejects.toMatchObject({
      name: 'PhotoApiError',
      code: 'invalid_response',
    });

    expect(asyncStorageState.values.size).toBe(0);
    expect(networkFetch).not.toHaveBeenCalled();
  });

  it('can await only the local enqueue while the network send continues', async () => {
    vi.stubEnv('EXPO_PUBLIC_PHOTO_API_URL', 'https://photos.example.test');
    let finishRequest!: (response: Response) => void;
    const pendingRequest = new Promise<Response>((resolve) => {
      finishRequest = resolve;
    });
    const networkFetch = vi.fn().mockReturnValue(pendingRequest);
    vi.stubGlobal('fetch', networkFetch);

    await expect(
      enqueuePhotoUse(PHOTO_RESPONSE.photo, PHOTO_RESPONSE.tracking_token),
    ).resolves.toBeUndefined();

    expect(asyncStorageState.values.size).toBe(1);
    expect(networkFetch).toHaveBeenCalledTimes(1);

    finishRequest(new Response(null, { status: 204 }));
    await retryPendingPhotoUses();

    expect(asyncStorageState.values.size).toBe(0);
    expect(networkFetch).toHaveBeenCalledTimes(1);
  });
});
