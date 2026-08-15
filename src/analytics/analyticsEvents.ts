/**
 * The complete analytics contract.
 *
 * Every event Frume can send is declared here together with the exact
 * properties it may carry, and `normalizeAnalyticsEvent` discards anything
 * outside that declaration. The allowlist is the privacy boundary: a future
 * call site cannot widen what leaves the device, because a photo URL, a
 * filename, a photographer's name, or a free-text error message all fail the
 * value rules below and are dropped instead of sent.
 *
 * Adding an event here is a deliberate act. It also changes the App Store
 * privacy declaration in `STORE_METADATA.md`, so the two must move together.
 */

export const ANALYTICS_EVENT_NAMES = [
  'app_opened',
  'photo_source_chosen',
  'puzzle_started',
  'puzzle_completed',
  'puzzle_abandoned',
  'paywall_shown',
  'purchase_completed',
  'restore_completed',
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

export type AnalyticsPhotoSource = 'theme' | 'own_photo';

export type AnalyticsEventProperties = {
  app_opened: { cold_start: boolean };
  photo_source_chosen: {
    source: AnalyticsPhotoSource;
    theme_id?: string;
  };
  puzzle_started: {
    cut_id: string;
    piece_count: number;
    source: AnalyticsPhotoSource;
  };
  puzzle_completed: {
    cut_id: string;
    piece_count: number;
    duration_s: number;
  };
  puzzle_abandoned: {
    cut_id: string;
    piece_count: number;
    progress_pct: number;
  };
  paywall_shown: { trigger_cut_id: string };
  purchase_completed: { product_id: string };
  restore_completed: Record<string, never>;
};

export type AnalyticsPropertyValue = string | number | boolean;

export type AnalyticsEvent = {
  name: AnalyticsEventName;
  properties: Record<string, AnalyticsPropertyValue>;
  /** Milliseconds since the epoch, captured when the event happened. */
  occurredAt: number;
};

type PropertyRule =
  | { kind: 'boolean' }
  | { kind: 'token' }
  | { kind: 'count'; max: number }
  | { kind: 'percent' };

type EventRule = Readonly<Record<string, PropertyRule>>;

/**
 * Identifiers Frume actually emits: cutter ids (`living-spectrum`), size ids
 * (`4x4`), theme ids (`nature`), and store product ids
 * (`com.targix.frumenative.premium_cut_styles`). The character class has no
 * slash, space, or at-sign, so no URL, path, or address can satisfy it.
 */
const TOKEN_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;

/** 196 pieces is the largest shipping grid; the ceiling only bounds nonsense. */
const MAX_PIECE_COUNT = 10_000;

/** A single sitting longer than a week is a clock change, not a play session. */
const MAX_DURATION_SECONDS = 604_800;

const EVENT_RULES: Readonly<Record<AnalyticsEventName, EventRule>> = {
  app_opened: { cold_start: { kind: 'boolean' } },
  photo_source_chosen: {
    source: { kind: 'token' },
    theme_id: { kind: 'token' },
  },
  puzzle_started: {
    cut_id: { kind: 'token' },
    piece_count: { kind: 'count', max: MAX_PIECE_COUNT },
    source: { kind: 'token' },
  },
  puzzle_completed: {
    cut_id: { kind: 'token' },
    piece_count: { kind: 'count', max: MAX_PIECE_COUNT },
    duration_s: { kind: 'count', max: MAX_DURATION_SECONDS },
  },
  puzzle_abandoned: {
    cut_id: { kind: 'token' },
    piece_count: { kind: 'count', max: MAX_PIECE_COUNT },
    progress_pct: { kind: 'percent' },
  },
  paywall_shown: { trigger_cut_id: { kind: 'token' } },
  purchase_completed: { product_id: { kind: 'token' } },
  restore_completed: {},
};

export function isAnalyticsEventName(
  value: unknown,
): value is AnalyticsEventName {
  return (
    typeof value === 'string' &&
    (ANALYTICS_EVENT_NAMES as readonly string[]).includes(value)
  );
}

function normalizePropertyValue(
  rule: PropertyRule,
  value: unknown,
): AnalyticsPropertyValue | null {
  switch (rule.kind) {
    case 'boolean':
      return typeof value === 'boolean' ? value : null;
    case 'token':
      return typeof value === 'string' && TOKEN_PATTERN.test(value)
        ? value
        : null;
    case 'count': {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return null;
      }
      return Math.min(Math.round(value), rule.max);
    }
    case 'percent': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
      }
      return Math.min(Math.max(Math.round(value), 0), 100);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Returns a canonical event, or null when the name is unknown or the timestamp
 * is unusable.
 *
 * Unknown property keys and values that fail their rule are dropped rather than
 * rejecting the whole event: losing one property is a measurement gap, while
 * losing the event is a hole in the funnel. Absent required properties are also
 * tolerated for the same reason — the analysis can see the gap, and no
 * undeclared data is ever forwarded either way.
 */
export function normalizeAnalyticsEvent(value: unknown): AnalyticsEvent | null {
  if (!isRecord(value) || !isAnalyticsEventName(value.name)) {
    return null;
  }

  const occurredAt = value.occurredAt;
  if (
    typeof occurredAt !== 'number' ||
    !Number.isFinite(occurredAt) ||
    occurredAt <= 0
  ) {
    return null;
  }

  const rules = EVENT_RULES[value.name];
  const source = isRecord(value.properties) ? value.properties : {};
  const properties: Record<string, AnalyticsPropertyValue> = {};
  for (const [key, rule] of Object.entries(rules)) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      continue;
    }
    const normalized = normalizePropertyValue(rule, source[key]);
    if (normalized !== null) {
      properties[key] = normalized;
    }
  }

  return {
    name: value.name,
    properties,
    occurredAt: Math.round(occurredAt),
  };
}

export function sameAnalyticsEvent(
  left: AnalyticsEvent,
  right: AnalyticsEvent,
): boolean {
  if (
    left.name !== right.name ||
    left.occurredAt !== right.occurredAt
  ) {
    return false;
  }
  const leftKeys = Object.keys(left.properties).sort();
  const rightKeys = Object.keys(right.properties).sort();
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every(
    (key, index) =>
      key === rightKeys[index] &&
      left.properties[key] === right.properties[key],
  );
}
