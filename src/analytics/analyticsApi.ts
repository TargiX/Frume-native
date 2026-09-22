import { normalizeAnalyticsEvent, type AnalyticsEvent } from './analyticsEvents';

export type AnalyticsApiErrorCode = 'not_configured' | 'invalid_configuration' | 'network_error' | 'request_timeout' | 'request_failed';
export const ANALYTICS_API_REQUEST_TIMEOUT_MS = 10_000;
export class AnalyticsApiError extends Error {
  constructor(message: string, readonly code: AnalyticsApiErrorCode, readonly status?: number) { super(message); this.name = 'AnalyticsApiError'; }
}
export type AnalyticsConfiguration = { captureUrl: string; apiKey: string };
const ORIGIN = 'https://stats.phosphene.cc';
const WEBSITE = 'b7375888-6948-4e98-9805-8d4a9a1399db';

// Website IDs are public routing identifiers, never administrator credentials.
export function readAnalyticsConfiguration(): AnalyticsConfiguration | null {
  const website = process.env.EXPO_PUBLIC_UMAMI_WEBSITE_ID?.trim();
  const host = process.env.EXPO_PUBLIC_ANALYTICS_HOST?.trim();
  if (!website && !host) return null;
  if (website !== WEBSITE || host !== ORIGIN) throw new AnalyticsApiError('Use the reviewed Frume Umami website and HTTPS origin', 'invalid_configuration');
  return { captureUrl: `${ORIGIN}/native/batch`, apiKey: website };
}
export function analyticsConfigured(): boolean {
  try { return readAnalyticsConfiguration() !== null; } catch { return false; }
}

export async function sendAnalyticsBatch(events: readonly AnalyticsEvent[], distinctId: string, configuration: AnalyticsConfiguration): Promise<void> {
  if (!events.length) return;
  if (configuration.captureUrl !== `${ORIGIN}/native/batch` || configuration.apiKey !== WEBSITE || !/^[a-f0-9]{32}$/i.test(distinctId)) {
    throw new AnalyticsApiError('Invalid anonymous analytics destination or installation ID', 'invalid_configuration');
  }
  const batch = events.map(normalizeAnalyticsEvent).filter((event): event is AnalyticsEvent => event !== null).map(event => ({
    type: 'event', payload: {
      website: WEBSITE, hostname: 'frume.ios', url: '/', name: event.name,
      id: `frume:${distinctId}`, timestamp: Math.floor(event.occurredAt / 1000),
      data: event.properties,
      // Native ingress also removes request IP headers. Do not derive location.
      ip: '127.0.0.1', browser: '', os: 'iOS', device: 'mobile',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    },
  }));
  if (!batch.length) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANALYTICS_API_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(configuration.captureUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify(batch) });
    if (!response.ok) throw new AnalyticsApiError(`Analytics request failed (${response.status})`, 'request_failed', response.status);
    const receipt = await response.json() as { processed?: number; errors?: number };
    if (receipt.errors !== 0 || receipt.processed !== batch.length) throw new AnalyticsApiError('Analytics batch was not fully accepted', 'request_failed', 503);
  } catch (error) {
    if (controller.signal.aborted) throw new AnalyticsApiError('Analytics service took too long', 'request_timeout');
    if (error instanceof AnalyticsApiError) throw error;
    throw new AnalyticsApiError('Analytics service is unavailable', 'network_error');
  } finally { clearTimeout(timeout); }
}
