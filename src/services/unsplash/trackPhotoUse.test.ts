import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));

import { PHOTO_API_REQUEST_TIMEOUT_MS } from './photoApi';
import { sendPhotoUse } from './trackPhotoUse';

const originalPhotoApiUrl = process.env.EXPO_PUBLIC_PHOTO_API_URL;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (originalPhotoApiUrl === undefined) {
    delete process.env.EXPO_PUBLIC_PHOTO_API_URL;
  } else {
    process.env.EXPO_PUBLIC_PHOTO_API_URL = originalPhotoApiUrl;
  }
});

describe('sendPhotoUse', () => {
  it('aborts and rejects a hung /track request at the shared photo deadline', async () => {
    vi.useFakeTimers();
    process.env.EXPO_PUBLIC_PHOTO_API_URL = 'https://photos.example.com/';
    let requestSignal: AbortSignal | null = null;
    const fetchMock = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) => {
        requestSignal = init?.signal as AbortSignal;
        return new Promise<Response>(() => undefined);
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = sendPhotoUse({
      downloadLocation:
        'https://api.unsplash.com/photos/deadline/download?ixid=deadline',
      trackingToken:
        `00000000-0000-4000-8000-000000000099.${'A'.repeat(43)}`,
    });
    const rejection = expect(request).rejects.toMatchObject({
      code: 'request_timeout',
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(PHOTO_API_REQUEST_TIMEOUT_MS);

    await rejection;
    expect(requestSignal).not.toBeNull();
    expect((requestSignal as unknown as AbortSignal).aborted).toBe(true);
  });
});
