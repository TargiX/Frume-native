import { afterEach, describe, expect, it, vi } from 'vitest';
import { readAnalyticsConfiguration, sendAnalyticsBatch } from './analyticsApi';
const configuration = { captureUrl: 'https://stats.phosphene.cc/native/batch', apiKey: 'b7375888-6948-4e98-9805-8d4a9a1399db' };
const event = { name: 'puzzle_completed' as const, occurredAt: 1789970000000, properties: { cut_id: 'crystal', piece_count: 25, duration_s: 30, email: 'private@example.com' } };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('Umami privacy and delivery', () => {
 it('requires both reviewed public configuration values', () => {
  vi.stubEnv('EXPO_PUBLIC_ANALYTICS_HOST', ''); vi.stubEnv('EXPO_PUBLIC_UMAMI_WEBSITE_ID', ''); expect(readAnalyticsConfiguration()).toBeNull();
  vi.stubEnv('EXPO_PUBLIC_ANALYTICS_HOST', 'https://us.i.posthog.com'); expect(() => readAnalyticsConfiguration()).toThrow();
  vi.stubEnv('EXPO_PUBLIC_ANALYTICS_HOST', 'https://stats.phosphene.cc'); vi.stubEnv('EXPO_PUBLIC_UMAMI_WEBSITE_ID', configuration.apiKey); expect(readAnalyticsConfiguration()).toEqual(configuration);
 });
 it('retains event time and strips undeclared private data', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ processed: 1, errors: 0 }) }); vi.stubGlobal('fetch', fetcher);
  await sendAnalyticsBatch([event], 'a'.repeat(32), configuration);
  const batch = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(batch[0].payload).toMatchObject({ id: `frume:${'a'.repeat(32)}`, timestamp: 1789970000, ip: '127.0.0.1', name: 'puzzle_completed' });
  expect(batch[0].payload.data).toEqual({ cut_id: 'crystal', piece_count: 25, duration_s: 30 });
  expect(JSON.stringify(batch)).not.toContain('private@example.com');
 });
 it('does not acknowledge partial ingestion as success', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ processed: 0, errors: 1 }) }));
  await expect(sendAnalyticsBatch([event], 'a'.repeat(32), configuration)).rejects.toMatchObject({ code: 'request_failed' });
 });
 it('rejects an identifying installation value and foreign destination before networking', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  await expect(sendAnalyticsBatch([event], 'private@example.com', configuration)).rejects.toThrow();
  await expect(sendAnalyticsBatch([event], 'a'.repeat(32), { ...configuration, captureUrl: 'https://example.com' })).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
 });
 it('preserves retryable network failures', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
  await expect(sendAnalyticsBatch([event], 'a'.repeat(32), configuration)).rejects.toMatchObject({ code: 'network_error' });
 });
});
