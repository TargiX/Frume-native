import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalyticsApiError,
  analyticsConfigured,
  readAnalyticsConfiguration,
  sendAnalyticsBatch,
} from './analyticsApi';
import type { AnalyticsEvent } from './analyticsEvents';

const originalKey = process.env.EXPO_PUBLIC_ANALYTICS_API_KEY;
const originalHost = process.env.EXPO_PUBLIC_ANALYTICS_HOST;

const event: AnalyticsEvent = {
  name: 'puzzle_completed',
  properties: { cut_id: 'crystal', piece_count: 25, duration_s: 431 },
  occurredAt: Date.UTC(2026, 7, 15, 12, 0, 0),
};

const PROJECT_TOKEN = `phc_${'A1b2C3d4E5f6G7h8I9j0'.repeat(2)}`;

function configure(host: string, key: string = PROJECT_TOKEN) {
  process.env.EXPO_PUBLIC_ANALYTICS_HOST = host;
  process.env.EXPO_PUBLIC_ANALYTICS_API_KEY = key;
}

beforeEach(() => {
  delete process.env.EXPO_PUBLIC_ANALYTICS_HOST;
  delete process.env.EXPO_PUBLIC_ANALYTICS_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalKey === undefined) {
    delete process.env.EXPO_PUBLIC_ANALYTICS_API_KEY;
  } else {
    process.env.EXPO_PUBLIC_ANALYTICS_API_KEY = originalKey;
  }
  if (originalHost === undefined) {
    delete process.env.EXPO_PUBLIC_ANALYTICS_HOST;
  } else {
    process.env.EXPO_PUBLIC_ANALYTICS_HOST = originalHost;
  }
});

describe('analytics configuration', () => {
  it('reports an unconfigured build instead of raising', () => {
    expect(readAnalyticsConfiguration()).toBeNull();
    expect(analyticsConfigured()).toBe(false);

    process.env.EXPO_PUBLIC_ANALYTICS_HOST = 'https://eu.i.posthog.com';
    expect(readAnalyticsConfiguration()).toBeNull();
  });

  it('builds the batch endpoint from a bare origin', () => {
    configure('https://eu.i.posthog.com');
    expect(readAnalyticsConfiguration()).toEqual({
      captureUrl: 'https://eu.i.posthog.com/batch/',
      apiKey: PROJECT_TOKEN,
    });
    expect(analyticsConfigured()).toBe(true);
  });

  it('refuses a personal API key, which would be published in the bundle', () => {
    configure('https://eu.i.posthog.com', `phx_${'A1b2C3d4E5f6G7h8I9j0'.repeat(2)}`);
    expect(() => readAnalyticsConfiguration()).toThrowError(
      /personal API key/,
    );
    expect(analyticsConfigured()).toBe(false);
  });

  it('refuses any key that is not a project token', () => {
    for (const key of [
      'phc_short',
      'private_service_credential',
      'abcdefghijklmnopqrstuvwxyz',
    ]) {
      configure('https://eu.i.posthog.com', key);
      expect(() => readAnalyticsConfiguration()).toThrowError(AnalyticsApiError);
      expect(analyticsConfigured()).toBe(false);
    }
  });

  it('refuses a host that is not a bare secure origin', () => {
    for (const host of [
      'http://analytics.example.com',
      'https://user:pass@eu.i.posthog.com',
      'https://eu.i.posthog.com/ingest',
      'https://eu.i.posthog.com/?token=1',
      'not a url',
    ]) {
      configure(host);
      expect(() => readAnalyticsConfiguration()).toThrowError(AnalyticsApiError);
      expect(analyticsConfigured()).toBe(false);
    }
  });

  it('allows a local origin for development', () => {
    configure('http://127.0.0.1:8000');
    expect(readAnalyticsConfiguration()?.captureUrl).toBe(
      'http://127.0.0.1:8000/batch/',
    );
  });
});

describe('analytics delivery', () => {
  it('sends only declared properties plus the anonymity flags', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await sendAnalyticsBatch([event], 'a'.repeat(32), {
      captureUrl: 'https://eu.i.posthog.com/batch/',
      apiKey: 'phc_test',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://eu.i.posthog.com/batch/');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      api_key: 'phc_test',
      batch: [
        {
          event: 'puzzle_completed',
          timestamp: '2026-08-15T12:00:00.000Z',
          properties: {
            cut_id: 'crystal',
            piece_count: 25,
            duration_s: 431,
            distinct_id: 'a'.repeat(32),
            $process_person_profile: false,
            $geoip_disable: true,
          },
        },
      ],
    });
  });

  it('makes no request for an empty batch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await sendAnalyticsBatch([], 'a'.repeat(32), {
      captureUrl: 'https://eu.i.posthog.com/batch/',
      apiKey: 'phc_test',
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports the status so the queue can tell permanent from transient', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    );

    await expect(
      sendAnalyticsBatch([event], 'a'.repeat(32), {
        captureUrl: 'https://eu.i.posthog.com/batch/',
        apiKey: 'phc_test',
      }),
    ).rejects.toMatchObject({ code: 'request_failed', status: 401 });
  });

  it('reports an unreachable service without a status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Network request failed')),
    );

    await expect(
      sendAnalyticsBatch([event], 'a'.repeat(32), {
        captureUrl: 'https://eu.i.posthog.com/batch/',
        apiKey: 'phc_test',
      }),
    ).rejects.toMatchObject({ code: 'network_error', status: undefined });
  });
});
