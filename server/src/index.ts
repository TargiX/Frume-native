import { DurableObject } from 'cloudflare:workers';

/**
 * Frume photo proxy.
 *
 * Each category is coordinated by its own SQLite-backed Durable Object. Photo
 * download tracking is authorized by a short-lived, HMAC-authenticated grant
 * in one globally bounded broker Durable Object so the client can never turn
 * this Worker into an arbitrary Unsplash API relay or fan out storage by ID.
 */

export type Env = {
  CATEGORY_POOLS: DurableObjectNamespace<CategoryPhotoPool>;
  TRACKING_GRANTS: DurableObjectNamespace<TrackingGrant>;
  PROVIDER_BUDGET: DurableObjectNamespace<ProviderBudget>;
  PHOTO_ISSUE_RATE_LIMITER: RateLimit;
  TRACKING_RATE_LIMITER: RateLimit;
  UNSPLASH_ACCESS_KEY?: string;
  /** Independent high-entropy secret used only to authenticate grant tokens. */
  TRACKING_TOKEN_SECRET?: string;
  /** Exact integer ceiling shared by every Worker isolate. */
  PROVIDER_REQUESTS_PER_HOUR?: string;
  /** Requests held back for manual recovery and provider housekeeping. */
  PROVIDER_RESERVE_PER_HOUR?: string;
  /** Invariant ceiling for retained rows in the single global grant DO. */
  MAX_RETAINED_TRACKING_GRANTS?: string;
  /** Global issuance ceiling independent of caller-controlled source IPs. */
  TRACKING_GRANT_ISSUES_PER_MINUTE?: string;
  /** Explicit production capacity gate; current write envelope requires Paid. */
  WORKERS_PAID_PLAN_CONFIRMED?: string;
  /** Emergency fail-closed switch. The only enabled value is exactly `1`. */
  PHOTO_API_DISABLED?: string;
  /** Cloudflare-generated identity for the exact code/configuration version. */
  CF_VERSION_METADATA?: {
    id: string;
    tag: string;
    timestamp: string;
  };
  /** Comma-separated browser origins. Native clients send no Origin header. */
  ALLOWED_ORIGINS?: string;
};

type Category = (typeof CATEGORIES)[number];

type CategoryDescriptor = {
  id: string;
  label: string;
  query: string;
};

type PhotoOrientation = 'portrait' | 'landscape';

type UnsplashPhoto = {
  id: string;
  width: number;
  height: number;
  alt_description: string | null;
  description: string | null;
  urls: { regular: string };
  user: { name: string; links: { html: string } };
  links: { download_location: string };
};

export type PoolPhoto = {
  id: string;
  width: number;
  height: number;
  altDescription: string | null;
  url: string;
  photographerName: string;
  photographerUrl: string;
  downloadLocation: string;
};

/** Narrow app-facing shape; intentionally not the full Unsplash response. */
type PublicPhoto = {
  id: string;
  width: number;
  height: number;
  alt_description: string | null;
  urls: { regular: string };
  user: { name: string; links: { html: string } };
  links: { download_location: string };
};

type ErrorBody = {
  error: string;
  upstreamStatus?: number;
};

type SerializedFailure =
  | { kind: 'configuration'; message: string }
  | { kind: 'provider_capacity'; retryAfterSeconds: number }
  | { kind: 'upstream'; message: string; status?: number };

export type CategoryPhotoResult =
  | { kind: 'ready'; photo: PoolPhoto }
  | { kind: 'warming'; retryAfterSeconds: number }
  | { kind: 'error'; failure: SerializedFailure };

export type CategoryRefillResult =
  | { kind: 'refilled'; photoCount: number }
  | { kind: 'warming'; retryAfterSeconds: number }
  | { kind: 'error'; failure: SerializedFailure };

export type TrackingGrantResult =
  | { kind: 'consumed' }
  | { kind: 'already_consumed' }
  | { kind: 'in_progress'; retryAfterSeconds: number }
  | { kind: 'invalid_or_expired' }
  | { kind: 'location_mismatch' }
  | { kind: 'permanent'; upstreamStatus: number }
  | { kind: 'error'; failure: SerializedFailure };

export type ProviderBudgetResult =
  | { kind: 'reserved'; remaining: number; resetAt: number }
  | { kind: 'exhausted'; remaining: 0; resetAt: number };

export type TrackingGrantIssueResult =
  | { kind: 'issued'; retained: number }
  | { kind: 'exhausted'; retryAfterSeconds: number };

const CATEGORIES = [
  { id: 'nature', label: 'Nature', query: 'landscape mountains forest lake' },
  { id: 'city', label: 'City', query: 'city street architecture skyline' },
  { id: 'animals', label: 'Animals', query: 'wildlife animal portrait' },
  { id: 'travel', label: 'Travel', query: 'travel landmark destination' },
  { id: 'food', label: 'Food', query: 'food dish cooking' },
  { id: 'ocean', label: 'Ocean', query: 'beach ocean coast waves' },
] as const;

const PATTERN_KEYWORDS = [
  'abstract',
  'pattern',
  'texture',
  'wallpaper',
  'background',
  'geometric',
  'geometry',
  'minimal',
  'minimalist',
  'seamless',
  'repetition',
  'tile',
  'gradient',
  'marble',
  'fabric',
  'damask',
  'vector',
  'illustration',
  'render',
  'bokeh',
  'wrapping paper',
];

const PER_PAGE = 30;
const POOL_LIMIT = 90;
const REFILL_LEASE_MS = 30_000;
const TRACKING_ATTEMPT_LEASE_MS = 30_000;
const UPSTREAM_TIMEOUT_MS = 15_000;
const TRACKING_GRANT_TTL_MS = 24 * 60 * 60 * 1000;
const TRACKING_GRANT_RETENTION_MS = 60 * 60 * 1000;
const RETRY_AFTER_SECONDS = 2;
const MAX_TRACK_BODY_BYTES = 4 * 1024;
const SAFE_PHOTO_ID = /^[A-Za-z0-9_-]{1,128}$/;
const TRACKING_TOKEN_ID_SOURCE =
  '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const TRACKING_TOKEN_ID_PATTERN = new RegExp(`^${TRACKING_TOKEN_ID_SOURCE}$`);
export const TRACKING_TOKEN_PATTERN = new RegExp(
  `^(${TRACKING_TOKEN_ID_SOURCE})\\.([A-Za-z0-9_-]{43})$`,
);
const TRACKING_TOKEN_CONTEXT = 'frume-tracking-grant-v1:';
const MIN_TRACKING_TOKEN_SECRET_CHARS = 32;
const MAX_TRACKING_TOKEN_SECRET_CHARS = 256;
const IMAGE_HOSTS = new Set(['images.unsplash.com', 'plus.unsplash.com']);
const DOWNLOAD_HOSTS = new Set(['api.unsplash.com']);
const PHOTOGRAPHER_HOSTS = new Set(['unsplash.com', 'www.unsplash.com']);
const MIN_PUZZLE_ASPECT = 9 / 16;
const MAX_PUZZLE_ASPECT = 16 / 9;
const MAX_TARGET_ASPECT_FACTOR = 1.25;
const TARGET_ASPECT_QUERY = /^(?:0|[1-9]\d?)(?:\.\d{1,4})?$/;
const PROVIDER_BUDGET_OBJECT_NAME = 'global';
const TRACKING_GRANT_OBJECT_NAME = 'global';
const DEFAULT_PROVIDER_REQUESTS_PER_HOUR = 1_000;
const DEFAULT_PROVIDER_RESERVE_PER_HOUR = 100;
const MAX_PROVIDER_REQUESTS_PER_HOUR = 1_000_000;
const DEFAULT_MAX_RETAINED_TRACKING_GRANTS = 10_000;
const DEFAULT_TRACKING_GRANT_ISSUES_PER_MINUTE = 5;
const MAX_TRACKING_GRANT_CONFIGURATION = 100_000;
const PHOTO_API_DEPLOYMENT_ID_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._-]{11,127}$/;
// Include two boundary buckets so a burst across minute boundaries cannot
// reach the storage backstop before the oldest retained row becomes eligible
// for cleanup.
const TRACKING_GRANT_RETENTION_BUCKETS =
  Math.ceil(
    (TRACKING_GRANT_TTL_MS + TRACKING_GRANT_RETENTION_MS) / 60_000,
  ) + 2;

type OperationalEvent =
  | 'photo_issued'
  | 'photo_rejected'
  | 'tracking_consumed'
  | 'tracking_idempotent'
  | 'provider_reserved'
  | 'provider_exhausted'
  | 'provider_success'
  | 'provider_failure'
  | 'api_disabled';

function recordOperationalEvent(
  event: OperationalEvent,
  fields: Record<string, string | number | boolean> = {},
): void {
  // Fixed event names and scalar counters only: never log request URLs,
  // tracking tokens, IP addresses, photo identifiers, or exception messages.
  console.log('frume_worker_event', { event, ...fields });
}

class ConfigurationError extends Error {}

class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

class ProviderCapacityError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('Photo provider capacity is temporarily unavailable');
  }
}

class PermanentTrackingError extends Error {
  constructor(readonly upstreamStatus: number) {
    super('Photo use can no longer be registered');
  }
}

class BodyTooLargeError extends Error {}
class InvalidContentLengthError extends Error {}

function validateTrackingTokenSecret(value: string | undefined): string {
  if (
    !value ||
    value !== value.trim() ||
    value.length < MIN_TRACKING_TOKEN_SECRET_CHARS ||
    value.length > MAX_TRACKING_TOKEN_SECRET_CHARS
  ) {
    throw new ConfigurationError(
      'TRACKING_TOKEN_SECRET is not configured securely',
    );
  }
  return value;
}

function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value: string): Uint8Array | null {
  try {
    const padding = '='.repeat((4 - (value.length % 4)) % 4);
    const decoded = atob(
      `${value.replace(/-/g, '+').replace(/_/g, '/')}${padding}`,
    );
    const bytes = Uint8Array.from(decoded, (character) =>
      character.charCodeAt(0),
    );
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

async function trackingTokenKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(validateTrackingTokenSecret(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function createTrackingToken(
  tokenId: string,
  secret: string,
): Promise<string> {
  if (!TRACKING_TOKEN_ID_PATTERN.test(tokenId)) {
    throw new Error('Invalid tracking token ID');
  }
  const payload = new TextEncoder().encode(
    `${TRACKING_TOKEN_CONTEXT}${tokenId}`,
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', await trackingTokenKey(secret), payload),
  );
  return `${tokenId}.${base64UrlEncode(signature)}`;
}

export async function verifyTrackingToken(
  token: string,
  secret: string,
): Promise<string | null> {
  const match = TRACKING_TOKEN_PATTERN.exec(token);
  if (!match) {
    return null;
  }
  const signature = base64UrlDecode(match[2]);
  if (!signature) {
    return null;
  }
  const payload = new TextEncoder().encode(
    `${TRACKING_TOKEN_CONTEXT}${match[1]}`,
  );
  return (await crypto.subtle.verify(
    'HMAC',
    await trackingTokenKey(secret),
    signature,
    payload,
  ))
    ? match[1]
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function normalizeDescription(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const description = value.trim();
  return description ? description.slice(0, 500) : null;
}

function hasSupportedPuzzleAspect(width: number, height: number): boolean {
  const aspect = width / height;
  return aspect >= MIN_PUZZLE_ASPECT && aspect <= MAX_PUZZLE_ASPECT;
}

function parseHttpsUrl(value: unknown, allowedHosts: ReadonlySet<string>): URL | null {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !allowedHosts.has(url.hostname)
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

/**
 * Accept only the endpoint Unsplash itself returns for download tracking.
 * Query parameters are retained because they are part of the issued grant.
 */
export function parseDownloadLocation(value: unknown): URL | null {
  const url = parseHttpsUrl(value, DOWNLOAD_HOSTS);
  if (!url || url.hash) {
    return null;
  }

  const match = /^\/photos\/([^/]+)\/download$/.exec(url.pathname);
  if (!match || !SAFE_PHOTO_ID.test(match[1])) {
    return null;
  }

  return url;
}

function toPhotographerUrl(value: unknown): string | null {
  const url = parseHttpsUrl(value, PHOTOGRAPHER_HOSTS);
  if (!url) {
    return null;
  }

  url.searchParams.set('utm_source', 'frume');
  url.searchParams.set('utm_medium', 'referral');
  return url.toString();
}

function parseUnsplashPhoto(value: unknown): UnsplashPhoto | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !SAFE_PHOTO_ID.test(value.id)
  ) {
    return null;
  }

  const urls = value.urls;
  const user = value.user;
  const links = value.links;
  if (!isRecord(urls) || !isRecord(user) || !isRecord(links)) {
    return null;
  }

  const userLinks = user.links;
  if (!isRecord(userLinks)) {
    return null;
  }

  const imageUrl = parseHttpsUrl(urls.regular, IMAGE_HOSTS);
  const photographerUrl = toPhotographerUrl(userLinks.html);
  const downloadLocation = parseDownloadLocation(links.download_location);
  if (
    !imageUrl ||
    !photographerUrl ||
    !downloadLocation ||
    !isPositiveNumber(value.width) ||
    !isPositiveNumber(value.height) ||
    !hasSupportedPuzzleAspect(value.width, value.height) ||
    typeof user.name !== 'string' ||
    !user.name.trim()
  ) {
    return null;
  }

  return {
    id: value.id,
    width: value.width,
    height: value.height,
    alt_description: normalizeDescription(value.alt_description),
    description: normalizeDescription(value.description),
    urls: { regular: imageUrl.toString() },
    user: {
      name: user.name.trim(),
      links: { html: photographerUrl },
    },
    links: { download_location: downloadLocation.toString() },
  };
}

function isGoodPuzzlePhoto(photo: UnsplashPhoto): boolean {
  const text = `${photo.alt_description ?? ''} ${photo.description ?? ''}`.toLowerCase();
  return !text.trim() || !PATTERN_KEYWORDS.some((keyword) => text.includes(keyword));
}

function toPoolPhoto(photo: UnsplashPhoto): PoolPhoto {
  return {
    id: photo.id,
    width: photo.width,
    height: photo.height,
    altDescription: photo.alt_description ?? photo.description,
    url: photo.urls.regular,
    photographerName: photo.user.name,
    photographerUrl: photo.user.links.html,
    downloadLocation: photo.links.download_location,
  };
}

function toPublicPhoto(photo: PoolPhoto): PublicPhoto {
  return {
    id: photo.id,
    width: photo.width,
    height: photo.height,
    alt_description: photo.altDescription,
    urls: { regular: photo.url },
    user: {
      name: photo.photographerName,
      links: { html: photo.photographerUrl },
    },
    links: { download_location: photo.downloadLocation },
  };
}

function allowedOrigins(env: Env): Set<string> {
  return new Set(
    (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function requestOrigin(request: Request): string | null {
  return request.headers.get('Origin');
}

function isOriginAllowed(request: Request, env: Env): boolean {
  const origin = requestOrigin(request);
  return origin === null || allowedOrigins(env).has(origin);
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
  const origin = requestOrigin(request);
  if (origin && allowedOrigins(env).has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function json<T>(
  body: T,
  request: Request,
  env: Env,
  status = 200,
  extraHeaders?: HeadersInit,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request, env),
      ...extraHeaders,
    },
  });
}

function requireAccessKey(env: Env): string {
  const key = env.UNSPLASH_ACCESS_KEY?.trim();
  if (!key) {
    throw new ConfigurationError('UNSPLASH_ACCESS_KEY is not configured');
  }
  return key;
}

function requireTrackingTokenSecret(env: Env): string {
  return validateTrackingTokenSecret(env.TRACKING_TOKEN_SECRET);
}

function requireBinding<T>(binding: T | undefined, name: string): T {
  if (!binding) {
    throw new ConfigurationError(`${name} is not configured`);
  }
  return binding;
}

function parseBoundedInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  if (!/^[1-9]\d*$/.test(value.trim())) {
    throw new ConfigurationError(`${name} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > MAX_PROVIDER_REQUESTS_PER_HOUR) {
    throw new ConfigurationError(`${name} is outside the supported range`);
  }
  return parsed;
}

export function providerBudgetConfiguration(env: Env): {
  limit: number;
  reserve: number;
} {
  const limit = parseBoundedInteger(
    env.PROVIDER_REQUESTS_PER_HOUR,
    DEFAULT_PROVIDER_REQUESTS_PER_HOUR,
    'PROVIDER_REQUESTS_PER_HOUR',
  );
  const reserve = parseBoundedInteger(
    env.PROVIDER_RESERVE_PER_HOUR,
    DEFAULT_PROVIDER_RESERVE_PER_HOUR,
    'PROVIDER_RESERVE_PER_HOUR',
  );
  if (reserve >= limit) {
    throw new ConfigurationError(
      'PROVIDER_RESERVE_PER_HOUR must be lower than PROVIDER_REQUESTS_PER_HOUR',
    );
  }
  return { limit, reserve };
}

export function trackingGrantConfiguration(env: Env): {
  maxRetained: number;
  maxIssuesPerMinute: number;
} {
  const maxRetained = parseBoundedInteger(
    env.MAX_RETAINED_TRACKING_GRANTS,
    DEFAULT_MAX_RETAINED_TRACKING_GRANTS,
    'MAX_RETAINED_TRACKING_GRANTS',
  );
  const maxIssuesPerMinute = parseBoundedInteger(
    env.TRACKING_GRANT_ISSUES_PER_MINUTE,
    DEFAULT_TRACKING_GRANT_ISSUES_PER_MINUTE,
    'TRACKING_GRANT_ISSUES_PER_MINUTE',
  );
  if (
    maxRetained > MAX_TRACKING_GRANT_CONFIGURATION ||
    maxIssuesPerMinute > MAX_TRACKING_GRANT_CONFIGURATION
  ) {
    throw new ConfigurationError(
      'Tracking grant configuration is outside the supported range',
    );
  }
  if (
    maxRetained <
    maxIssuesPerMinute * TRACKING_GRANT_RETENTION_BUCKETS
  ) {
    throw new ConfigurationError(
      'MAX_RETAINED_TRACKING_GRANTS cannot safely retain the configured issuance rate',
    );
  }
  return { maxRetained, maxIssuesPerMinute };
}

export function photoApiDisabled(env: Env): boolean {
  const configured = env.PHOTO_API_DISABLED?.trim();
  if (configured === undefined || configured === '' || configured === '1') {
    return true;
  }
  if (configured === '0') {
    return false;
  }
  throw new ConfigurationError('PHOTO_API_DISABLED must be 0 or 1');
}

function photoApiDeploymentId(env: Env): string {
  const configured = env.CF_VERSION_METADATA?.id;
  if (
    !configured ||
    configured !== configured.trim() ||
    !PHOTO_API_DEPLOYMENT_ID_PATTERN.test(configured)
  ) {
    throw new ConfigurationError(
      'CF_VERSION_METADATA is not configured as a valid Worker version identity',
    );
  }
  return configured;
}

export function workersPaidPlanConfirmed(env: Env): boolean {
  const configured = env.WORKERS_PAID_PLAN_CONFIRMED?.trim();
  if (configured === '1') {
    return true;
  }
  if (configured === undefined || configured === '' || configured === '0') {
    return false;
  }
  throw new ConfigurationError(
    'WORKERS_PAID_PLAN_CONFIRMED must be 0 or 1',
  );
}

function photoServiceDisabled(env: Env): boolean {
  return photoApiDisabled(env) || !workersPaidPlanConfirmed(env);
}

function providerBudgetStub(env: Env): DurableObjectStub<ProviderBudget> {
  return requireBinding(env.PROVIDER_BUDGET, 'PROVIDER_BUDGET').getByName(
    PROVIDER_BUDGET_OBJECT_NAME,
  );
}

async function reserveProviderRequest(env: Env): Promise<void> {
  const { limit, reserve } = providerBudgetConfiguration(env);
  const result = await providerBudgetStub(env).reserve(limit, reserve);
  if (result.kind === 'exhausted') {
    recordOperationalEvent('provider_exhausted', {
      remaining: result.remaining,
    });
    throw new ProviderCapacityError(
      Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1_000)),
    );
  }
  recordOperationalEvent('provider_reserved', { remaining: result.remaining });
}

function reportLowRateLimit(response: Response): void {
  const limit = Number(response.headers.get('X-Ratelimit-Limit'));
  const remaining = Number(response.headers.get('X-Ratelimit-Remaining'));
  if (
    Number.isFinite(limit) &&
    limit > 0 &&
    Number.isFinite(remaining) &&
    remaining <= Math.max(5, Math.ceil(limit * 0.1))
  ) {
    console.warn('Unsplash API rate limit is low', { limit, remaining });
  }
}

async function requestUnsplash(url: URL, env: Env): Promise<Response> {
  const accessKey = requireAccessKey(env);
  await reserveProviderRequest(env);
  let response: Response;
  try {
    response = await fetch(url, {
      // Workers intentionally does not implement redirect: "error". Manual
      // mode keeps the credential on the allowlisted origin, and every 3xx is
      // rejected below because it is not an OK response.
      redirect: 'manual',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        'Accept-Version': 'v1',
      },
    });
  } catch {
    recordOperationalEvent('provider_failure', { reason: 'transport' });
    throw new UpstreamError('Unsplash request failed');
  }

  reportLowRateLimit(response);
  if (!response.ok) {
    recordOperationalEvent('provider_failure', { status: response.status });
    throw new UpstreamError('Unsplash returned an error', response.status);
  }
  recordOperationalEvent('provider_success', { status: response.status });
  return response;
}

function serializeFailure(error: unknown): SerializedFailure {
  if (error instanceof ConfigurationError) {
    return { kind: 'configuration', message: error.message };
  }
  if (error instanceof ProviderCapacityError) {
    return {
      kind: 'provider_capacity',
      retryAfterSeconds: error.retryAfterSeconds,
    };
  }
  if (error instanceof UpstreamError) {
    return {
      kind: 'upstream',
      message: error.message,
      ...(error.status === undefined ? {} : { status: error.status }),
    };
  }
  return { kind: 'upstream', message: 'Unsplash request failed' };
}

function throwFailure(failure: SerializedFailure): never {
  if (failure.kind === 'configuration') {
    throw new ConfigurationError(failure.message);
  }
  if (failure.kind === 'provider_capacity') {
    throw new ProviderCapacityError(failure.retryAfterSeconds);
  }
  throw new UpstreamError(failure.message, failure.status);
}

function categoryDescriptor(category: Category): CategoryDescriptor {
  return { id: category.id, label: category.label, query: category.query };
}

type PoolRow = {
  id: string;
  width: number;
  height: number;
  alt_description: string | null;
  url: string;
  photographer_name: string;
  photographer_url: string;
  download_location: string;
};

function rowToPoolPhoto(row: PoolRow): PoolPhoto {
  return {
    id: row.id,
    width: row.width,
    height: row.height,
    altDescription: row.alt_description,
    url: row.url,
    photographerName: row.photographer_name,
    photographerUrl: row.photographer_url,
    downloadLocation: row.download_location,
  };
}

export class CategoryPhotoPool extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => this.migrate());
  }

  private migrate(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
        id INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    const version =
      this.ctx.storage.sql
        .exec<{ version: number }>(
          'SELECT COALESCE(MAX(id), 0) AS version FROM _sql_schema_migrations',
        )
        .toArray()[0]?.version ?? 0;

    if (version < 1) {
      this.ctx.storage.sql.exec(`
        CREATE TABLE category_config (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          category_id TEXT NOT NULL,
          label TEXT NOT NULL,
          query TEXT NOT NULL
        );
        CREATE TABLE photos (
          id TEXT PRIMARY KEY,
          width INTEGER NOT NULL,
          height INTEGER NOT NULL,
          alt_description TEXT,
          url TEXT NOT NULL,
          photographer_name TEXT NOT NULL,
          photographer_url TEXT NOT NULL,
          download_location TEXT NOT NULL,
          added_at INTEGER NOT NULL
        );
        CREATE INDEX photos_by_recency ON photos(added_at DESC);
        CREATE TABLE refill_lease (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          owner TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        );
        INSERT INTO _sql_schema_migrations (id) VALUES (1);
      `);
    }
  }

  private ensureCategory(category: CategoryDescriptor): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO category_config (singleton, category_id, label, query)
       VALUES (1, ?, ?, ?)
       ON CONFLICT(singleton) DO NOTHING`,
      category.id,
      category.label,
      category.query,
    );
    const stored = this.ctx.storage.sql
      .exec<{ category_id: string; label: string; query: string }>(
        `SELECT category_id, label, query
         FROM category_config
         WHERE singleton = 1`,
      )
      .toArray()[0];
    if (
      !stored ||
      stored.category_id !== category.id ||
      stored.label !== category.label ||
      stored.query !== category.query
    ) {
      throw new Error('Category Durable Object identity mismatch');
    }
  }

  private selectPhoto(
    orientation?: PhotoOrientation,
    targetAspect?: number,
  ): PoolPhoto | null {
    const orientationClause =
      orientation === 'portrait'
        ? 'height > width'
        : orientation === 'landscape'
          ? 'width > height'
          : '';
    const clauses = orientationClause ? [orientationClause] : [];
    const queryParameters: number[] = [];
    if (targetAspect !== undefined) {
      clauses.push(
        '(CAST(width AS REAL) / CAST(height AS REAL)) BETWEEN ? AND ?',
      );
      queryParameters.push(
        targetAspect / MAX_TARGET_ASPECT_FACTOR,
        targetAspect * MAX_TARGET_ASPECT_FACTOR,
      );
    }
    const whereClause =
      clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    // Every photo left after the filters fits the caller's viewport within the
    // tolerance the client itself accepts, so the choice among them is random.
    // Ranking by closeness to the target instead made selection deterministic:
    // one device asking the same category always got back the single
    // nearest-aspect photo in the pool, puzzle after puzzle.
    const row = this.ctx.storage.sql
      .exec<PoolRow>(
        `SELECT id, width, height, alt_description, url, photographer_name,
                photographer_url, download_location
         FROM photos
         ${whereClause}
         ORDER BY random()
         LIMIT 1`,
        ...queryParameters,
      )
      .toArray()[0];
    return row ? rowToPoolPhoto(row) : null;
  }

  private acquireRefillLease(now: number): string | null {
    const owner = crypto.randomUUID();
    const acquired = this.ctx.storage.sql
      .exec<{ owner: string }>(
        `INSERT INTO refill_lease (singleton, owner, expires_at)
         VALUES (1, ?, ?)
         ON CONFLICT(singleton) DO UPDATE SET
           owner = excluded.owner,
           expires_at = excluded.expires_at
         WHERE refill_lease.expires_at <= ?
         RETURNING owner`,
        owner,
        now + REFILL_LEASE_MS,
        now,
      )
      .toArray()[0];
    return acquired?.owner === owner ? owner : null;
  }

  private async fetchFreshPhotos(
    category: CategoryDescriptor,
    orientation?: PhotoOrientation,
  ): Promise<PoolPhoto[]> {
    const page = Math.floor(Math.random() * 20) + 1;
    const url = new URL('/search/photos', 'https://api.unsplash.com');
    url.searchParams.set('query', category.query);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(PER_PAGE));
    url.searchParams.set('content_filter', 'high');
    if (orientation) {
      url.searchParams.set('orientation', orientation);
    }

    const response = await requestUnsplash(url, this.env);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new UpstreamError('Unsplash returned invalid JSON', response.status);
    }
    if (!isRecord(body) || !Array.isArray(body.results)) {
      throw new UpstreamError('Unsplash returned an invalid photo list', response.status);
    }

    const fresh = body.results
      .map(parseUnsplashPhoto)
      .filter((photo): photo is UnsplashPhoto => photo !== null)
      .filter(isGoodPuzzlePhoto)
      .map(toPoolPhoto);
    if (fresh.length === 0) {
      throw new UpstreamError('Unsplash returned no usable photos', response.status);
    }
    return fresh;
  }

  private persistPhotos(photos: PoolPhoto[], owner: string): number {
    const addedAt = Date.now();
    for (const photo of photos) {
      this.ctx.storage.sql.exec(
        `INSERT INTO photos (
           id, width, height, alt_description, url, photographer_name,
           photographer_url, download_location, added_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           width = excluded.width,
           height = excluded.height,
           alt_description = excluded.alt_description,
           url = excluded.url,
           photographer_name = excluded.photographer_name,
           photographer_url = excluded.photographer_url,
           download_location = excluded.download_location,
           added_at = excluded.added_at`,
        photo.id,
        photo.width,
        photo.height,
        photo.altDescription,
        photo.url,
        photo.photographerName,
        photo.photographerUrl,
        photo.downloadLocation,
        addedAt,
      );
    }
    this.ctx.storage.sql.exec(
      `DELETE FROM photos
       WHERE id NOT IN (
         SELECT id FROM photos ORDER BY added_at DESC, id DESC LIMIT ?
       )`,
      POOL_LIMIT,
    );
    this.ctx.storage.sql.exec(
      'DELETE FROM refill_lease WHERE singleton = 1 AND owner = ?',
      owner,
    );
    return (
      this.ctx.storage.sql
        .exec<{ count: number }>('SELECT COUNT(*) AS count FROM photos')
        .toArray()[0]?.count ?? 0
    );
  }

  private releaseRefillLease(owner: string): void {
    this.ctx.storage.sql.exec(
      'DELETE FROM refill_lease WHERE singleton = 1 AND owner = ?',
      owner,
    );
  }

  private async refillOwned(
    category: CategoryDescriptor,
    orientation?: PhotoOrientation,
  ): Promise<CategoryRefillResult> {
    const owner = this.acquireRefillLease(Date.now());
    if (!owner) {
      return { kind: 'warming', retryAfterSeconds: RETRY_AFTER_SECONDS };
    }

    try {
      const photos = await this.fetchFreshPhotos(category, orientation);
      return { kind: 'refilled', photoCount: this.persistPhotos(photos, owner) };
    } catch (error) {
      this.releaseRefillLease(owner);
      return { kind: 'error', failure: serializeFailure(error) };
    }
  }

  async getPhoto(
    category: CategoryDescriptor,
    orientation?: PhotoOrientation,
    targetAspect?: number,
  ): Promise<CategoryPhotoResult> {
    this.ensureCategory(category);
    const existing = this.selectPhoto(orientation, targetAspect);
    if (existing) {
      return { kind: 'ready', photo: existing };
    }

    // The lease is committed before external I/O. A concurrent caller sees the
    // durable lease and gets a retryable warming response; it never awaits or
    // shares the first caller's request-owned Unsplash fetch.
    const refill = await this.refillOwned(category, orientation);
    if (refill.kind !== 'refilled') {
      return refill;
    }
    const photo = this.selectPhoto(orientation, targetAspect);
    return photo
      ? { kind: 'ready', photo }
      : {
          kind: 'error',
          failure: { kind: 'upstream', message: 'Unsplash returned no usable photos' },
        };
  }

  async refill(category: CategoryDescriptor): Promise<CategoryRefillResult> {
    this.ensureCategory(category);
    return this.refillOwned(category);
  }
}

type ProviderBudgetRow = {
  window_started_at: number;
  request_count: number;
  configured_limit: number;
  configured_reserve: number;
};

/**
 * One globally named Durable Object is the final authority for every outbound
 * provider request, including scheduled refills and download tracking. SQLite
 * mutation happens before external I/O, so concurrent Worker isolates cannot
 * overrun the reviewed allowance in any rolling 60-minute period.
 */
export class ProviderBudget extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => this.migrate());
  }

  private migrate(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS provider_budget_minutes (
        minute_started_at INTEGER PRIMARY KEY,
        request_count INTEGER NOT NULL CHECK (request_count > 0)
      );
    `);
    const hasLegacyBudget =
      this.ctx.storage.sql
        .exec<{ count: number }>(
          `SELECT COUNT(*) AS count FROM sqlite_master
           WHERE type = 'table' AND name = 'provider_budget'`,
        )
        .one().count === 1;
    if (hasLegacyBudget) {
      const legacyCount = this.ctx.storage.sql
        .exec<{ request_count: number }>(
          `SELECT request_count FROM provider_budget WHERE singleton = 1`,
        )
        .toArray()[0]?.request_count;
      if (legacyCount && legacyCount > 0) {
        const currentMinute = Math.floor(Date.now() / 60_000) * 60_000;
        // Carry legacy use into the new rolling window conservatively rather
        // than granting fresh capacity at deployment.
        this.ctx.storage.sql.exec(
          `INSERT INTO provider_budget_minutes (
             minute_started_at, request_count
           ) VALUES (?, ?)
           ON CONFLICT(minute_started_at) DO UPDATE SET
             request_count = request_count + excluded.request_count`,
          currentMinute,
          legacyCount,
        );
      }
      this.ctx.storage.sql.exec('DROP TABLE provider_budget');
    }
  }

  private rollingUsage(now: number): {
    minuteStartedAt: number;
    requestCount: number;
    resetAt: number;
  } {
    const minuteMs = 60_000;
    const minuteStartedAt = Math.floor(now / minuteMs) * minuteMs;
    // Keep the boundary minute too. This is conservative by less than one
    // minute and guarantees a calendar-boundary burst can never exceed the
    // provider's generic "per hour" contract.
    const oldestIncludedMinute = minuteStartedAt - 60 * minuteMs;
    this.ctx.storage.sql.exec(
      `DELETE FROM provider_budget_minutes WHERE minute_started_at < ?`,
      oldestIncludedMinute,
    );
    const usage = this.ctx.storage.sql
      .exec<{ request_count: number; earliest_minute: number | null }>(
        `SELECT COALESCE(SUM(request_count), 0) AS request_count,
                MIN(minute_started_at) AS earliest_minute
         FROM provider_budget_minutes`,
      )
      .one();
    return {
      minuteStartedAt,
      requestCount: usage.request_count,
      resetAt:
        (usage.earliest_minute ?? minuteStartedAt) + 61 * minuteMs,
    };
  }

  reserve(
    limit: number,
    reserve: number,
    now = Date.now(),
  ): ProviderBudgetResult {
    if (
      !Number.isSafeInteger(limit) ||
      !Number.isSafeInteger(reserve) ||
      !Number.isSafeInteger(now) ||
      limit <= 0 ||
      reserve <= 0 ||
      reserve >= limit ||
      now < 0
    ) {
      throw new Error('Invalid provider budget request');
    }

    const usage = this.rollingUsage(now);
    const available = Math.max(0, limit - reserve);
    if (usage.requestCount >= available) {
      return {
        kind: 'exhausted',
        remaining: 0,
        resetAt: usage.resetAt,
      };
    }

    this.ctx.storage.sql.exec(
      `INSERT INTO provider_budget_minutes (minute_started_at, request_count)
       VALUES (?, 1)
       ON CONFLICT(minute_started_at) DO UPDATE SET
         request_count = request_count + 1`,
      usage.minuteStartedAt,
    );
    return {
      kind: 'reserved',
      remaining: available - usage.requestCount - 1,
      resetAt: usage.resetAt,
    };
  }

  status(limit: number, reserve: number, now = Date.now()): ProviderBudgetRow {
    if (
      !Number.isSafeInteger(limit) ||
      !Number.isSafeInteger(reserve) ||
      !Number.isSafeInteger(now) ||
      limit <= 0 ||
      reserve <= 0 ||
      reserve >= limit ||
      now < 0
    ) {
      throw new Error('Invalid provider budget request');
    }
    const usage = this.rollingUsage(now);
    return {
      window_started_at: usage.minuteStartedAt - 60 * 60_000,
      request_count: usage.requestCount,
      configured_limit: limit,
      configured_reserve: reserve,
    };
  }
}

type GrantRow = {
  token_id: string;
  expected_download_location: string;
  expires_at: number;
  status: string;
  attempt_expires_at: number | null;
  permanent_status: number | null;
};

export class TrackingGrant extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => this.migrate());
  }

  private migrate(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
        id INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    // Releases before the global broker used one named object per token. Keep
    // their old schema untouched so their already-scheduled alarms can delete
    // them; no request in the new protocol opens a caller-selected object.
    if (this.ctx.id.name !== TRACKING_GRANT_OBJECT_NAME) {
      return;
    }
    const version =
      this.ctx.storage.sql
        .exec<{ version: number }>(
          'SELECT COALESCE(MAX(id), 0) AS version FROM _sql_schema_migrations',
        )
        .toArray()[0]?.version ?? 0;

    if (version < 2) {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS tracking_grants (
          token_id TEXT PRIMARY KEY,
          expected_download_location TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('issued', 'tracking', 'consumed', 'permanent')),
          attempt_owner TEXT,
          attempt_expires_at INTEGER,
          consumed_at INTEGER,
          permanent_status INTEGER
        );
        CREATE INDEX IF NOT EXISTS tracking_grants_expires_at
          ON tracking_grants(expires_at);
        CREATE TABLE IF NOT EXISTS tracking_grant_issue_window (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          window_started_at INTEGER NOT NULL,
          issue_count INTEGER NOT NULL
        );
        INSERT OR IGNORE INTO _sql_schema_migrations (id) VALUES (2);
      `);
    }
  }

  private cleanup(now: number): void {
    this.ctx.storage.sql.exec(
      `DELETE FROM tracking_grants
       WHERE expires_at <= ?`,
      now - TRACKING_GRANT_RETENTION_MS,
    );
  }

  private async scheduleCleanup(): Promise<void> {
    const next = this.ctx.storage.sql
      .exec<{ cleanup_at: number }>(
        `SELECT MIN(expires_at) + ? AS cleanup_at FROM tracking_grants`,
        TRACKING_GRANT_RETENTION_MS,
      )
      .toArray()[0]?.cleanup_at;
    const currentAlarm = await this.ctx.storage.getAlarm();
    if (
      Number.isSafeInteger(next) &&
      (currentAlarm === null || next < currentAlarm)
    ) {
      await this.ctx.storage.setAlarm(next);
    }
  }

  async issue(
    tokenId: string,
    expectedDownloadLocation: string,
    expiresAt: number,
    maxRetained: number,
    maxIssuesPerMinute: number,
    now = Date.now(),
  ): Promise<TrackingGrantIssueResult> {
    const normalized = parseDownloadLocation(expectedDownloadLocation)?.toString();
    if (
      !TRACKING_TOKEN_ID_PATTERN.test(tokenId) ||
      !normalized ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= now ||
      !Number.isSafeInteger(now) ||
      this.ctx.id.name !== TRACKING_GRANT_OBJECT_NAME ||
      !Number.isSafeInteger(maxRetained) ||
      !Number.isSafeInteger(maxIssuesPerMinute) ||
      maxRetained <= 0 ||
      maxRetained > MAX_TRACKING_GRANT_CONFIGURATION ||
      maxIssuesPerMinute <= 0 ||
      maxIssuesPerMinute > MAX_TRACKING_GRANT_CONFIGURATION
    ) {
      throw new Error('Invalid tracking grant');
    }

    this.cleanup(now);
    const minuteMs = 60_000;
    const windowStartedAt = Math.floor(now / minuteMs) * minuteMs;
    this.ctx.storage.sql.exec(
      `INSERT INTO tracking_grant_issue_window (
         singleton, window_started_at, issue_count
       ) VALUES (1, ?, 0)
       ON CONFLICT(singleton) DO UPDATE SET
         window_started_at = excluded.window_started_at,
         issue_count = 0
       WHERE tracking_grant_issue_window.window_started_at != excluded.window_started_at`,
      windowStartedAt,
    );
    const window = this.ctx.storage.sql
      .exec<{ issue_count: number }>(
        `SELECT issue_count FROM tracking_grant_issue_window
         WHERE singleton = 1`,
      )
      .one();
    const retainedRows = this.ctx.storage.sql
      .exec<{ count: number }>(
        'SELECT COUNT(*) AS count FROM tracking_grants',
      )
      .one().count;
    if (
      window.issue_count >= maxIssuesPerMinute ||
      retainedRows >= maxRetained
    ) {
      const earliestCleanup = this.ctx.storage.sql
        .exec<{ cleanup_at: number }>(
          `SELECT MIN(expires_at) + ? AS cleanup_at FROM tracking_grants`,
          TRACKING_GRANT_RETENTION_MS,
        )
        .toArray()[0]?.cleanup_at;
      const resetAt =
        window.issue_count >= maxIssuesPerMinute
          ? windowStartedAt + minuteMs
          : earliestCleanup;
      return {
        kind: 'exhausted',
        retryAfterSeconds: Number.isSafeInteger(resetAt)
          ? Math.max(1, Math.ceil((resetAt - now) / 1_000))
          : 60,
      };
    }

    this.ctx.storage.sql.exec(
      `INSERT INTO tracking_grants (
         token_id, expected_download_location, expires_at, status
       ) VALUES (?, ?, ?, 'issued')`,
      tokenId,
      normalized,
      expiresAt,
    );
    this.ctx.storage.sql.exec(
      `UPDATE tracking_grant_issue_window
       SET issue_count = issue_count + 1 WHERE singleton = 1`,
    );
    await this.scheduleCleanup();
    return { kind: 'issued', retained: retainedRows + 1 };
  }

  private releaseAttempt(tokenId: string, owner: string): void {
    this.ctx.storage.sql.exec(
      `UPDATE tracking_grants
       SET status = 'issued', attempt_owner = NULL, attempt_expires_at = NULL
       WHERE token_id = ? AND status = 'tracking' AND attempt_owner = ?`,
      tokenId,
      owner,
    );
  }

  async consume(
    tokenId: string,
    downloadLocation: string,
  ): Promise<TrackingGrantResult> {
    const normalized = parseDownloadLocation(downloadLocation)?.toString();
    if (
      this.ctx.id.name !== TRACKING_GRANT_OBJECT_NAME ||
      !TRACKING_TOKEN_ID_PATTERN.test(tokenId) ||
      !normalized
    ) {
      return { kind: 'location_mismatch' };
    }

    const now = Date.now();
    const grant = this.ctx.storage.sql
      .exec<GrantRow>(
        `SELECT token_id, expected_download_location, expires_at, status,
                attempt_expires_at, permanent_status
         FROM tracking_grants
         WHERE token_id = ?`,
        tokenId,
      )
      .toArray()[0];
    if (!grant) {
      return { kind: 'invalid_or_expired' };
    }
    if (grant.expected_download_location !== normalized) {
      return { kind: 'location_mismatch' };
    }
    if (grant.status === 'consumed') {
      return { kind: 'already_consumed' };
    }
    if (grant.status === 'permanent') {
      return { kind: 'permanent', upstreamStatus: grant.permanent_status ?? 404 };
    }
    if (grant.expires_at <= now) {
      return { kind: 'invalid_or_expired' };
    }
    if (
      grant.status === 'tracking' &&
      grant.attempt_expires_at !== null &&
      grant.attempt_expires_at > now
    ) {
      return { kind: 'in_progress', retryAfterSeconds: RETRY_AFTER_SECONDS };
    }

    const owner = crypto.randomUUID();
    const acquired = this.ctx.storage.sql.exec(
      `UPDATE tracking_grants
       SET status = 'tracking', attempt_owner = ?, attempt_expires_at = ?
       WHERE token_id = ?
         AND expires_at > ?
         AND (
           status = 'issued'
           OR (
             status = 'tracking'
             AND (attempt_expires_at IS NULL OR attempt_expires_at <= ?)
           )
         )`,
      owner,
      now + TRACKING_ATTEMPT_LEASE_MS,
      tokenId,
      now,
      now,
    );
    if (acquired.rowsWritten !== 1) {
      return { kind: 'in_progress', retryAfterSeconds: RETRY_AFTER_SECONDS };
    }

    try {
      await requestUnsplash(new URL(normalized), this.env);
      this.ctx.storage.sql.exec(
        `UPDATE tracking_grants
         SET status = 'consumed', consumed_at = ?, attempt_owner = NULL,
             attempt_expires_at = NULL
         WHERE token_id = ? AND status = 'tracking' AND attempt_owner = ?`,
        Date.now(),
        tokenId,
        owner,
      );
      return { kind: 'consumed' };
    } catch (error) {
      if (error instanceof UpstreamError && error.status === 404) {
        this.ctx.storage.sql.exec(
          `UPDATE tracking_grants
           SET status = 'permanent', permanent_status = 404,
               attempt_owner = NULL, attempt_expires_at = NULL
           WHERE token_id = ? AND status = 'tracking' AND attempt_owner = ?`,
          tokenId,
          owner,
        );
        return { kind: 'permanent', upstreamStatus: 404 };
      }
      this.releaseAttempt(tokenId, owner);
      return { kind: 'error', failure: serializeFailure(error) };
    }
  }

  async alarm(): Promise<void> {
    if (this.ctx.id.name !== TRACKING_GRANT_OBJECT_NAME) {
      const hasLegacyTable =
        this.ctx.storage.sql
          .exec<{ count: number }>(
            `SELECT COUNT(*) AS count FROM sqlite_master
             WHERE type = 'table' AND name = 'tracking_grant'`,
          )
          .one().count === 1;
      if (!hasLegacyTable) {
        await this.ctx.storage.deleteAll();
        return;
      }
      const legacyGrant = this.ctx.storage.sql
        .exec<{ expires_at: number }>(
          `SELECT expires_at FROM tracking_grant WHERE singleton = 1`,
        )
        .toArray()[0];
      const cleanupAt = legacyGrant
        ? legacyGrant.expires_at + TRACKING_GRANT_RETENTION_MS
        : 0;
      if (!legacyGrant || cleanupAt <= Date.now()) {
        await this.ctx.storage.deleteAll();
      } else {
        await this.ctx.storage.setAlarm(cleanupAt);
      }
      return;
    }
    this.cleanup(Date.now());
    await this.scheduleCleanup();
  }
}

async function readBoundedBody(request: Request, maxBytes: number): Promise<string> {
  const contentLength = request.headers.get('Content-Length');
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      throw new InvalidContentLengthError();
    }
    if (Number(contentLength) > maxBytes) {
      throw new BodyTooLargeError();
    }
  }

  if (!request.body) {
    return '';
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // The 413 response is authoritative even if cancellation races closure.
      }
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
}

function photoRateLimitKey(request: Request): string {
  return request.headers.get('CF-Connecting-IP')?.trim() || 'unknown-client';
}

type TargetAspectParseResult =
  | { ok: true; value?: number }
  | { ok: false };

function parseTargetAspect(
  searchParams: URLSearchParams,
): TargetAspectParseResult {
  const values = searchParams.getAll('aspect');
  if (values.length === 0) {
    return { ok: true };
  }
  if (values.length !== 1 || !TARGET_ASPECT_QUERY.test(values[0])) {
    return { ok: false };
  }
  const value = Number(values[0]);
  return Number.isFinite(value) &&
    value >= MIN_PUZZLE_ASPECT &&
    value <= MAX_PUZZLE_ASPECT
    ? { ok: true, value }
    : { ok: false };
}

async function handlePhoto(request: Request, env: Env): Promise<Response> {
  const trackingTokenSecret = requireTrackingTokenSecret(env);
  const searchParams = new URL(request.url).searchParams;
  const requested = searchParams.get('category');
  const requestedOrientation = searchParams.get('orientation');
  if (
    requestedOrientation !== null &&
    requestedOrientation !== 'portrait' &&
    requestedOrientation !== 'landscape'
  ) {
    return json<ErrorBody>(
      { error: 'Unknown photo orientation' },
      request,
      env,
      400,
    );
  }
  const orientation = requestedOrientation ?? undefined;
  const targetAspectResult = parseTargetAspect(searchParams);
  if (
    !targetAspectResult.ok ||
    (orientation === 'portrait' &&
      targetAspectResult.value !== undefined &&
      targetAspectResult.value > 1) ||
    (orientation === 'landscape' &&
      targetAspectResult.value !== undefined &&
      targetAspectResult.value < 1)
  ) {
    return json<ErrorBody>(
      { error: 'Invalid photo aspect target' },
      request,
      env,
      400,
    );
  }
  const targetAspect = targetAspectResult.value;
  const category = requested
    ? CATEGORIES.find((entry) => entry.id === requested)
    : CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];

  if (!category) {
    return json<ErrorBody>({ error: 'Unknown category' }, request, env, 400);
  }

  const issueLimiter = requireBinding(
    env.PHOTO_ISSUE_RATE_LIMITER,
    'PHOTO_ISSUE_RATE_LIMITER',
  );
  const issueLimit = await issueLimiter.limit({ key: photoRateLimitKey(request) });
  if (!issueLimit.success) {
    recordOperationalEvent('photo_rejected', { reason: 'source_limit' });
    return json<ErrorBody>(
      { error: 'Too many photo requests' },
      request,
      env,
      429,
      { 'Retry-After': '60' },
    );
  }

  const pools = requireBinding(env.CATEGORY_POOLS, 'CATEGORY_POOLS');
  const result = await pools
    .getByName(category.id)
    .getPhoto(categoryDescriptor(category), orientation, targetAspect);
  if (result.kind === 'warming') {
    return json<ErrorBody>(
      { error: 'Photo pool is warming' },
      request,
      env,
      503,
      { 'Retry-After': String(result.retryAfterSeconds) },
    );
  }
  if (result.kind === 'error') {
    throwFailure(result.failure);
  }

  const grants = requireBinding(env.TRACKING_GRANTS, 'TRACKING_GRANTS');
  const grantConfiguration = trackingGrantConfiguration(env);
  const trackingTokenId = crypto.randomUUID();
  const trackingToken = await createTrackingToken(
    trackingTokenId,
    trackingTokenSecret,
  );
  const grantResult = await grants
    .getByName(TRACKING_GRANT_OBJECT_NAME)
    .issue(
      trackingTokenId,
      result.photo.downloadLocation,
      Date.now() + TRACKING_GRANT_TTL_MS,
      grantConfiguration.maxRetained,
      grantConfiguration.maxIssuesPerMinute,
    );
  if (grantResult.kind === 'exhausted') {
    recordOperationalEvent('photo_rejected', {
      reason: 'global_grant_limit',
    });
    return json<ErrorBody>(
      { error: 'Photo service is temporarily at capacity' },
      request,
      env,
      503,
      { 'Retry-After': String(grantResult.retryAfterSeconds) },
    );
  }

  recordOperationalEvent('photo_issued', {
    category: category.id,
    source: requested ? 'category' : 'surprise',
  });

  return json(
    {
      photo: toPublicPhoto(result.photo),
      category: { id: category.id, label: category.label },
      tracking_token: trackingToken,
    },
    request,
    env,
  );
}

async function handleTrack(request: Request, env: Env): Promise<Response> {
  let rawBody: string;
  try {
    rawBody = await readBoundedBody(request, MAX_TRACK_BODY_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return json<ErrorBody>({ error: 'Request body is too large' }, request, env, 413);
    }
    if (error instanceof InvalidContentLengthError) {
      return json<ErrorBody>({ error: 'Invalid Content-Length' }, request, env, 400);
    }
    return json<ErrorBody>({ error: 'Invalid request body' }, request, env, 400);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    body = null;
  }
  const trackingToken = isRecord(body) ? body.trackingToken : null;
  const location = isRecord(body)
    ? parseDownloadLocation(body.downloadLocation)
    : null;
  if (typeof trackingToken !== 'string' || !location) {
    return json<ErrorBody>(
      { error: 'Invalid tracking grant or download location' },
      request,
      env,
      400,
    );
  }

  const trackingTokenId = await verifyTrackingToken(
    trackingToken,
    requireTrackingTokenSecret(env),
  );
  if (!trackingTokenId) {
    return json<ErrorBody>(
      { error: 'Invalid tracking grant or download location' },
      request,
      env,
      400,
    );
  }

  const limiter = requireBinding(env.TRACKING_RATE_LIMITER, 'TRACKING_RATE_LIMITER');
  const sourceLimit = await limiter.limit({
    key: `source:${photoRateLimitKey(request)}`,
  });
  const grantLimit = sourceLimit.success
    ? await limiter.limit({ key: `grant:${trackingTokenId}` })
    : null;
  if (!sourceLimit.success || !grantLimit?.success) {
    return json<ErrorBody>(
      { error: 'Too many tracking attempts' },
      request,
      env,
      429,
      { 'Retry-After': '60' },
    );
  }

  const grants = requireBinding(env.TRACKING_GRANTS, 'TRACKING_GRANTS');
  const result = await grants
    .getByName(TRACKING_GRANT_OBJECT_NAME)
    .consume(trackingTokenId, location.toString());
  if (result.kind === 'invalid_or_expired') {
    return json<ErrorBody>(
      { error: 'Tracking grant is invalid or expired' },
      request,
      env,
      410,
    );
  }
  if (result.kind === 'location_mismatch') {
    return json<ErrorBody>(
      { error: 'Download location does not match tracking grant' },
      request,
      env,
      400,
    );
  }
  if (result.kind === 'in_progress') {
    return json<ErrorBody>(
      { error: 'Photo tracking is already in progress' },
      request,
      env,
      503,
      { 'Retry-After': String(result.retryAfterSeconds) },
    );
  }
  if (result.kind === 'permanent') {
    throw new PermanentTrackingError(result.upstreamStatus);
  }
  if (result.kind === 'error') {
    throwFailure(result.failure);
  }

  recordOperationalEvent(
    result.kind === 'already_consumed'
      ? 'tracking_idempotent'
      : 'tracking_consumed',
  );

  return new Response(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store', ...corsHeaders(request, env) },
  });
}

function errorResponse(error: unknown, request: Request, env: Env): Response {
  if (error instanceof ConfigurationError) {
    return json<ErrorBody>({ error: error.message }, request, env, 503);
  }
  if (error instanceof ProviderCapacityError) {
    return json<ErrorBody>(
      { error: error.message },
      request,
      env,
      503,
      { 'Retry-After': String(error.retryAfterSeconds) },
    );
  }
  if (error instanceof PermanentTrackingError) {
    return json<ErrorBody>(
      { error: error.message, upstreamStatus: error.upstreamStatus },
      request,
      env,
      410,
    );
  }
  if (error instanceof UpstreamError) {
    return json<ErrorBody>(
      { error: error.message, ...(error.status ? { upstreamStatus: error.status } : {}) },
      request,
      env,
      502,
    );
  }
  return json<ErrorBody>({ error: 'Internal server error' }, request, env, 500);
}

function methodNotAllowed(request: Request, env: Env, allow: string): Response {
  return json<ErrorBody>(
    { error: 'Method not allowed' },
    request,
    env,
    405,
    { Allow: allow },
  );
}

function readiness(env: Env): {
  deploymentId: string | null;
  checks: Record<string, boolean>;
} {
  let providerBudgetConfig = false;
  let trackingGrantConfig = false;
  let photoApiEnabled = false;
  let trackingTokenSecret = false;
  let workersPaidPlan = false;
  let deploymentId: string | null = null;
  try {
    providerBudgetConfiguration(env);
    providerBudgetConfig = true;
    trackingGrantConfiguration(env);
    trackingGrantConfig = true;
    requireTrackingTokenSecret(env);
    trackingTokenSecret = true;
  } catch {
    // The individual check remains false without exposing configuration input.
  }
  try {
    workersPaidPlan = workersPaidPlanConfirmed(env);
    photoApiEnabled = !photoApiDisabled(env) && workersPaidPlan;
  } catch {
    // Invalid or unconfirmed capacity stays fail-closed.
  }
  try {
    deploymentId = photoApiDeploymentId(env);
  } catch {
    // Never echo malformed configuration; readiness exposes only null.
  }
  return {
    deploymentId,
    checks: {
      categoryPools: Boolean(env.CATEGORY_POOLS),
      trackingGrants: Boolean(env.TRACKING_GRANTS) && trackingGrantConfig,
      providerBudget: Boolean(env.PROVIDER_BUDGET) && providerBudgetConfig,
      photoIssueRateLimiter: Boolean(env.PHOTO_ISSUE_RATE_LIMITER),
      trackingRateLimiter: Boolean(env.TRACKING_RATE_LIMITER),
      unsplashAccessKey: Boolean(env.UNSPLASH_ACCESS_KEY?.trim()),
      trackingTokenSecret,
      workersPaidPlan,
      photoApiEnabled,
      deploymentIdentity: deploymentId !== null,
    },
  };
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!isOriginAllowed(request, env)) {
      return json<ErrorBody>({ error: 'Origin not allowed' }, request, env, 403);
    }

    const { pathname } = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    try {
      if (pathname === '/health') {
        if (request.method !== 'GET') {
          return methodNotAllowed(request, env, 'GET, OPTIONS');
        }
        const { checks, deploymentId } = readiness(env);
        const ready = Object.values(checks).every(Boolean);
        return json(
          { status: ready ? 'ok' : 'not_ready', deploymentId, checks },
          request,
          env,
          ready ? 200 : 503,
        );
      }
      if (pathname === '/photo') {
        if (photoServiceDisabled(env)) {
          recordOperationalEvent('api_disabled', { endpoint: 'photo' });
          return json<ErrorBody>(
            { error: 'Photo service is temporarily unavailable' },
            request,
            env,
            503,
            { 'Retry-After': '300' },
          );
        }
        return request.method === 'GET'
          ? await handlePhoto(request, env)
          : methodNotAllowed(request, env, 'GET, OPTIONS');
      }
      if (pathname === '/track') {
        if (photoServiceDisabled(env)) {
          recordOperationalEvent('api_disabled', { endpoint: 'track' });
          return json<ErrorBody>(
            { error: 'Photo service is temporarily unavailable' },
            request,
            env,
            503,
            { 'Retry-After': '300' },
          );
        }
        return request.method === 'POST'
          ? await handleTrack(request, env)
          : methodNotAllowed(request, env, 'POST, OPTIONS');
      }
      return json<ErrorBody>({ error: 'Not found' }, request, env, 404);
    } catch (error) {
      return errorResponse(error, request, env);
    }
  },

  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    if (photoServiceDisabled(env)) {
      recordOperationalEvent('api_disabled', { endpoint: 'scheduled' });
      return;
    }
    const results = await Promise.all(
      CATEGORIES.map((category) =>
        env.CATEGORY_POOLS
          .getByName(category.id)
          .refill(categoryDescriptor(category)),
      ),
    );
    const failure = results.find((result) => result.kind === 'error');
    if (failure?.kind === 'error') {
      const reason =
        failure.failure.kind === 'provider_capacity'
          ? 'provider capacity exhausted'
          : failure.failure.message;
      throw new Error(`Scheduled category refill failed: ${reason}`);
    }
  },
} satisfies ExportedHandler<Env>;

export default worker;
