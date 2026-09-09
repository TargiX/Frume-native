import { afterEach, describe, expect, it, vi } from 'vitest';
import { browsePuzzlePhotos, fetchPuzzlePhoto } from './fetchPuzzlePhoto';
const photo = {
  id: 'abc',
  width: 1200,
  height: 900,
  alt_description: 'A lake',
  urls: { regular: 'https://images.unsplash.com/photo-1' },
  user: {
    name: 'Ada',
    links: {
      html: 'https://unsplash.com/@ada?utm_source=frume&utm_medium=referral',
    },
  },
  links: { download_location: 'https://api.unsplash.com/photos/abc/download' },
};
const category = { id: 'nature', label: 'Nature' };
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function respond(body: unknown) {
  vi.stubEnv('EXPO_PUBLIC_PHOTO_API_URL', 'https://photos.example.com');
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
describe('photo collection contract', () => {
  it('browses attributed hotlinked photos without a use token', async () => {
    const fetch = respond({ photos: [photo], category });
    expect(await browsePuzzlePhotos('nature')).toEqual([photo]);
    expect(String(fetch.mock.calls[0][0])).toContain('browse=1');
  });
  it('rejects photos from a different category', async () => {
    respond({ photos: [photo], category: { id: 'city', label: 'City' } });
    await expect(browsePuzzlePhotos('nature')).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });
  it('rejects unbounded or hostile collections', async () => {
    respond({ photos: Array(7).fill(photo), category });
    await expect(browsePuzzlePhotos('nature')).rejects.toMatchObject({
      code: 'invalid_response',
    });
    respond({
      photos: [
        { ...photo, urls: { regular: 'https://untrusted.example/photo' } },
      ],
      category,
    });
    await expect(browsePuzzlePhotos('nature')).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });
  it('waits for a warming collection once before showing an error', async () => {
    const fetch = respond({ photos: [photo], category });
    fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'warming' }), {
        status: 503,
        headers: { 'Retry-After': '0' },
      }),
    );
    expect(await browsePuzzlePhotos('nature')).toEqual([photo]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('does not retry endlessly or retry an error without a server delay', async () => {
    const fetch = respond({});
    fetch.mockImplementation(
      async () =>
        new Response('{}', { status: 503, headers: { 'Retry-After': '0' } }),
    );
    await expect(browsePuzzlePhotos('nature')).rejects.toMatchObject({
      status: 503,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch
      .mockClear()
      .mockImplementation(async () => new Response('{}', { status: 503 }));
    await expect(browsePuzzlePhotos('nature')).rejects.toMatchObject({
      status: 503,
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('cancels a warming wait without making a second request', async () => {
    vi.useFakeTimers();
    const fetch = respond({});
    fetch.mockResolvedValueOnce(
      new Response('{}', { status: 503, headers: { 'Retry-After': '2' } }),
    );
    const controller = new AbortController();
    const request = browsePuzzlePhotos('nature', controller.signal);
    const rejected = expect(request).rejects.toBeDefined();
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await rejected;
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('does not replace a requested category with a different one during selection', async () => {
    respond({
      photo,
      category: { id: 'city', label: 'City' },
      tracking_token: `00000000-0000-4000-8000-000000000099.${'A'.repeat(43)}`,
    });
    await expect(
      fetchPuzzlePhoto('nature', undefined, undefined, undefined, 'abc'),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('describes malformed collection JSON as an invalid service response', async () => {
    const fetch = respond({});
    fetch.mockResolvedValueOnce(
      new Response('<html>unavailable</html>', { status: 200 }),
    );
    await expect(browsePuzzlePhotos('nature')).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });
  it('rejects an older server silently returning a random photo instead of the selection', async () => {
    respond({
      photo,
      category,
      tracking_token: `00000000-0000-4000-8000-000000000099.${'A'.repeat(43)}`,
    });
    await expect(
      fetchPuzzlePhoto('nature', undefined, undefined, undefined, 'selected'),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });
});
