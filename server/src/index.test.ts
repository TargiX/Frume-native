import { reset, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

import worker, {
  CategoryPhotoPool,
  TrackingGrant,
  TRACKING_TOKEN_PATTERN,
  type Env,
  type PoolPhoto,
  parseDownloadLocation,
} from './index';

const testEnv = env as unknown as Env;

const CATEGORY = {
  id: 'nature',
  label: 'Nature',
  query: 'landscape mountains forest lake',
};

const SEEDED_PHOTO: PoolPhoto = {
  id: 'seeded_photo',
  width: 1600,
  height: 1000,
  altDescription: 'A seeded landscape',
  url: 'https://images.unsplash.com/seeded-photo?ixid=hotlink',
  photographerName: 'Test Photographer',
  photographerUrl:
    'https://unsplash.com/@test-photographer?utm_source=frume&utm_medium=referral',
  downloadLocation:
    'https://api.unsplash.com/photos/seeded_photo/download?ixid=tracking',
};

afterEach(async () => {
  await reset();
});

async function fetchWorker(path: string, init?: RequestInit): Promise<Response> {
  return worker.fetch(new Request(`https://worker.example${path}`, init), testEnv);
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

async function seedPhotos(photos: readonly PoolPhoto[]): Promise<void> {
  const stub = testEnv.CATEGORY_POOLS.getByName(CATEGORY.id);
  await runInDurableObject(
    stub,
    (_instance: CategoryPhotoPool, state) => {
      state.storage.sql.exec(
        `INSERT INTO category_config (singleton, category_id, label, query)
         VALUES (1, ?, ?, ?)
         ON CONFLICT(singleton) DO NOTHING`,
        CATEGORY.id,
        CATEGORY.label,
        CATEGORY.query,
      );
      for (const photo of photos) {
        state.storage.sql.exec(
          `INSERT INTO photos (
             id, width, height, alt_description, url, photographer_name,
             photographer_url, download_location, added_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          photo.id,
          photo.width,
          photo.height,
          photo.altDescription,
          photo.url,
          photo.photographerName,
          photo.photographerUrl,
          photo.downloadLocation,
          Date.now(),
        );
      }
    },
  );
}

async function seedPhoto(photo: PoolPhoto = SEEDED_PHOTO): Promise<void> {
  await seedPhotos([photo]);
}

function photoWithDimensions(
  id: string,
  width: number,
  height: number,
): PoolPhoto {
  return {
    ...SEEDED_PHOTO,
    id,
    width,
    height,
    url: `https://images.unsplash.com/${id}?ixid=hotlink`,
    downloadLocation:
      `https://api.unsplash.com/photos/${id}/download?ixid=tracking`,
  };
}

async function issueGrant(
  token: string,
  location: string,
): Promise<DurableObjectStub<TrackingGrant>> {
  const stub = testEnv.TRACKING_GRANTS.getByName(token);
  await stub.issue(location, Date.now() + 60_000);
  return stub;
}

function trackRequest(
  token: string,
  location: string,
  init?: Omit<RequestInit, 'method' | 'body'>,
): Promise<Response> {
  return fetchWorker('/track', {
    ...init,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    body: JSON.stringify({ downloadLocation: location, trackingToken: token }),
  });
}

describe('configuration and URL validation', () => {
  it('reports every production binding in health readiness', async () => {
    const ready = await fetchWorker('/health');
    expect(ready.status).toBe(200);
    expect(await readJson(ready)).toEqual({
      status: 'ok',
      checks: {
        categoryPools: true,
        trackingGrants: true,
        photoIssueRateLimiter: true,
        trackingRateLimiter: true,
        unsplashAccessKey: true,
      },
    });

    const notReady = await worker.fetch(
      new Request('https://worker.example/health'),
      {} as Env,
    );
    expect(notReady.status).toBe(503);
    expect(await readJson(notReady)).toMatchObject({ status: 'not_ready' });
  });

  it('accepts only exact Unsplash photo download endpoints', () => {
    expect(
      parseDownloadLocation(
        'https://api.unsplash.com/photos/abc_DEF-123/download?ixid=token',
      )?.toString(),
    ).toBe(
      'https://api.unsplash.com/photos/abc_DEF-123/download?ixid=token',
    );

    for (const rejected of [
      'http://api.unsplash.com/photos/abc/download',
      'https://api.unsplash.com.evil.test/photos/abc/download',
      'https://user@api.unsplash.com/photos/abc/download',
      'https://api.unsplash.com:444/photos/abc/download',
      'https://api.unsplash.com/photos/abc/download/',
      'https://api.unsplash.com/photos/abc/download/more',
      'https://api.unsplash.com/photos/abc%2Fother/download',
      'https://api.unsplash.com/photos/abc.def/download',
      'https://api.unsplash.com/photos/abc/download#fragment',
    ]) {
      expect(parseDownloadLocation(rejected)).toBeNull();
    }
  });
});

describe('SQLite category photo pools', () => {
  it('returns a server-issued UUID grant for a persisted photo', async () => {
    await seedPhoto();

    const response = await fetchWorker('/photo?category=nature', {
      headers: { 'CF-Connecting-IP': '203.0.113.1' },
    });
    expect(response.status).toBe(200);
    const body = await readJson(response);
    expect(body.photo).toMatchObject({
      id: SEEDED_PHOTO.id,
      links: { download_location: SEEDED_PHOTO.downloadLocation },
    });
    expect(body.category).toEqual({ id: 'nature', label: 'Nature' });
    expect(body.tracking_token).toEqual(
      expect.stringMatching(TRACKING_TOKEN_PATTERN),
    );

    const token = body.tracking_token as string;
    const grant = testEnv.TRACKING_GRANTS.getByName(token);
    await runInDurableObject(
      grant,
      (_instance: TrackingGrant, state) => {
        const row = state.storage.sql
          .exec<{
            expected_download_location: string;
            status: string;
          }>(
            `SELECT expected_download_location, status
             FROM tracking_grant WHERE singleton = 1`,
          )
          .one();
        expect(row).toEqual({
          expected_download_location: SEEDED_PHOTO.downloadLocation,
          status: 'issued',
        });
      },
    );
  });

  it('does not return a landscape photo to a portrait request', async () => {
    await seedPhoto();

    const response = await fetchWorker(
      '/photo?category=nature&orientation=portrait',
      {
        headers: { 'CF-Connecting-IP': '203.0.113.19' },
      },
    );

    if (response.status === 200) {
      const body = await readJson(response);
      expect(body.photo).toMatchObject({
        width: expect.any(Number),
        height: expect.any(Number),
      });
      const photo = body.photo as { width: number; height: number };
      expect(photo.height).toBeGreaterThan(photo.width);
    } else {
      expect(response.status).toBe(502);
    }
  });

  it('prefers the closest landscape aspect and excludes a near-square photo', async () => {
    await seedPhotos([
      photoWithDimensions('near_square_landscape', 1_050, 1_000),
      photoWithDimensions('target_landscape', 1_600, 1_000),
      photoWithDimensions('wide_landscape', 1_750, 1_000),
    ]);

    const response = await fetchWorker(
      '/photo?category=nature&orientation=landscape&aspect=1.62',
      { headers: { 'CF-Connecting-IP': '203.0.113.20' } },
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({
      photo: { id: 'target_landscape', width: 1_600, height: 1_000 },
    });
  });

  it('prefers the closest portrait aspect and excludes a near-square photo', async () => {
    await seedPhotos([
      photoWithDimensions('near_square_portrait', 950, 1_000),
      photoWithDimensions('target_portrait', 620, 1_000),
      photoWithDimensions('tall_portrait', 570, 1_000),
    ]);

    const response = await fetchWorker(
      '/photo?category=nature&orientation=portrait&aspect=0.62',
      { headers: { 'CF-Connecting-IP': '203.0.113.21' } },
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({
      photo: { id: 'target_portrait', width: 620, height: 1_000 },
    });
  });

  it('can prefer a near-square photo when the safe viewport is near square', async () => {
    await seedPhotos([
      photoWithDimensions('near_square_target', 1_060, 1_000),
      photoWithDimensions('moderately_wide', 1_200, 1_000),
    ]);

    const response = await fetchWorker(
      '/photo?category=nature&orientation=landscape&aspect=1.05',
      { headers: { 'CF-Connecting-IP': '203.0.113.22' } },
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({
      photo: { id: 'near_square_target' },
    });
  });

  it.each([
    ['below the minimum', '0.5624'],
    ['above the maximum', '1.7778'],
    ['negative', '-1'],
    ['non-finite', 'Infinity'],
    ['exponent syntax', '1e0'],
    ['oversized input', '1.0000000000000000000000000000000000001'],
  ])('rejects a %s aspect query', async (_label, aspect) => {
    const response = await fetchWorker(
      `/photo?category=nature&orientation=landscape&aspect=${encodeURIComponent(aspect)}`,
      { headers: { 'CF-Connecting-IP': '203.0.113.23' } },
    );

    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      error: 'Invalid photo aspect target',
    });
  });

  it('rejects duplicate and orientation-mismatched aspect targets', async () => {
    const duplicate = await fetchWorker(
      '/photo?category=nature&orientation=portrait&aspect=0.6&aspect=0.7',
      { headers: { 'CF-Connecting-IP': '203.0.113.24' } },
    );
    const mismatch = await fetchWorker(
      '/photo?category=nature&orientation=portrait&aspect=1.4',
      { headers: { 'CF-Connecting-IP': '203.0.113.25' } },
    );

    expect(duplicate.status).toBe(400);
    expect(mismatch.status).toBe(400);
  });

  it('persists one cold refill owner and makes the concurrent caller retry', async () => {
    const [first, second] = await Promise.all([
      fetchWorker('/photo?category=nature', {
        headers: { 'CF-Connecting-IP': '203.0.113.2' },
      }),
      fetchWorker('/photo?category=nature', {
        headers: { 'CF-Connecting-IP': '203.0.113.3' },
      }),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 503]);
    const warming = first.status === 503 ? first : second;
    expect(warming.headers.get('Retry-After')).toBe('2');
    expect(await readJson(warming)).toEqual({ error: 'Photo pool is warming' });

    const stub = testEnv.CATEGORY_POOLS.getByName(CATEGORY.id);
    await runInDurableObject(
      stub,
      (_instance: CategoryPhotoPool, state) => {
        expect(
          state.storage.sql
            .exec<{ count: number }>('SELECT COUNT(*) AS count FROM photos')
            .one().count,
        ).toBeGreaterThan(0);
        expect(
          state.storage.sql
            .exec<{ count: number }>('SELECT COUNT(*) AS count FROM refill_lease')
            .one().count,
        ).toBe(0);
      },
    );
  });

  it('honors a persisted refill lease after object activation', async () => {
    const stub = testEnv.CATEGORY_POOLS.getByName(CATEGORY.id);
    await runInDurableObject(
      stub,
      (_instance: CategoryPhotoPool, state) => {
        state.storage.sql.exec(
          `INSERT INTO refill_lease (singleton, owner, expires_at)
           VALUES (1, 'previous-owner', ?)`,
          Date.now() + 60_000,
        );
      },
    );

    const response = await fetchWorker('/photo?category=nature', {
      headers: { 'CF-Connecting-IP': '203.0.113.4' },
    });
    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('2');
  });

  it('runs scheduled refills through the same category Durable Objects', async () => {
    await worker.scheduled({} as ScheduledController, testEnv);

    const stub = testEnv.CATEGORY_POOLS.getByName(CATEGORY.id);
    await runInDurableObject(
      stub,
      (_instance: CategoryPhotoPool, state) => {
        expect(
          state.storage.sql
            .exec<{ count: number }>('SELECT COUNT(*) AS count FROM photos')
            .one().count,
        ).toBeGreaterThan(0);
      },
    );
  });
});

describe('tracking grants', () => {
  it('rejects oversized bodies from Content-Length before parsing', async () => {
    const response = await fetchWorker('/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': '4097',
      },
      body: '{}',
    });
    expect(response.status).toBe(413);
    expect(await readJson(response)).toEqual({ error: 'Request body is too large' });
  });

  it('bounds a streamed body even without Content-Length', async () => {
    const response = await fetchWorker('/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'x'.repeat(4097),
    });
    expect(response.status).toBe(413);
  });

  it('rejects unknown grants without relaying a valid-looking Unsplash URL', async () => {
    const response = await trackRequest(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'https://api.unsplash.com/photos/unknown_photo/download?ixid=tracking',
    );
    expect(response.status).toBe(410);
    expect(await readJson(response)).toEqual({
      error: 'Tracking grant is invalid or expired',
    });
  });

  it('requires the location issued with the token', async () => {
    const token = crypto.randomUUID();
    await issueGrant(token, SEEDED_PHOTO.downloadLocation);

    const response = await trackRequest(
      token,
      'https://api.unsplash.com/photos/other_photo/download?ixid=tracking',
    );
    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      error: 'Download location does not match tracking grant',
    });
  });

  it('consumes a grant once and treats a retry as idempotent success', async () => {
    const token = crypto.randomUUID();
    const grant = await issueGrant(token, SEEDED_PHOTO.downloadLocation);

    const first = await trackRequest(token, SEEDED_PHOTO.downloadLocation);
    const retry = await trackRequest(token, SEEDED_PHOTO.downloadLocation);
    expect(first.status).toBe(204);
    expect(retry.status).toBe(204);

    await runInDurableObject(
      grant,
      (_instance: TrackingGrant, state) => {
        expect(
          state.storage.sql
            .exec<{ status: string }>(
              'SELECT status FROM tracking_grant WHERE singleton = 1',
            )
            .one().status,
        ).toBe('consumed');
      },
    );
  });

  it('persists an upstream 404 as a permanent tracking result', async () => {
    const token = crypto.randomUUID();
    const location =
      'https://api.unsplash.com/photos/deleted_photo/download?ixid=tracking';
    const grant = await issueGrant(token, location);

    const first = await trackRequest(token, location);
    const retry = await trackRequest(token, location);
    expect(first.status).toBe(410);
    expect(retry.status).toBe(410);
    expect(await readJson(first)).toEqual({
      error: 'Photo use can no longer be registered',
      upstreamStatus: 404,
    });

    await runInDurableObject(
      grant,
      (_instance: TrackingGrant, state) => {
        expect(
          state.storage.sql
            .exec<{ status: string; permanent_status: number }>(
              `SELECT status, permanent_status
               FROM tracking_grant WHERE singleton = 1`,
            )
            .one(),
        ).toEqual({ status: 'permanent', permanent_status: 404 });
      },
    );
  });
});
