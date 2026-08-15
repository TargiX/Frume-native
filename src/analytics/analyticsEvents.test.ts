import { describe, expect, it } from 'vitest';

import {
  isAnalyticsEventName,
  normalizeAnalyticsEvent,
  sameAnalyticsEvent,
} from './analyticsEvents';

const occurredAt = 1_760_000_000_000;

describe('analytics event contract', () => {
  it('rejects any event outside the declared set', () => {
    expect(isAnalyticsEventName('puzzle_started')).toBe(true);
    expect(isAnalyticsEventName('screen_viewed')).toBe(false);
    expect(
      normalizeAnalyticsEvent({
        name: 'photo_opened',
        properties: {},
        occurredAt,
      }),
    ).toBeNull();
  });

  it('keeps declared properties and drops undeclared ones', () => {
    const event = normalizeAnalyticsEvent({
      name: 'puzzle_started',
      properties: {
        cut_id: 'living-spectrum',
        piece_count: 196,
        source: 'own_photo',
        photo_url: 'https://images.unsplash.com/photo-1234',
        photographer: 'Jane Doe',
      },
      occurredAt,
    });

    expect(event).toEqual({
      name: 'puzzle_started',
      properties: {
        cut_id: 'living-spectrum',
        piece_count: 196,
        source: 'own_photo',
      },
      occurredAt,
    });
  });

  it('drops declared properties whose value could carry free text', () => {
    const event = normalizeAnalyticsEvent({
      name: 'puzzle_started',
      properties: {
        cut_id: 'file:///var/mobile/Containers/photo.heic',
        piece_count: 16,
        source: 'theme',
      },
      occurredAt,
    });

    // The event survives so the funnel keeps its step; only the unusable value
    // is lost.
    expect(event?.properties).toEqual({ piece_count: 16, source: 'theme' });
  });

  it('rejects tokens containing separators found in paths and addresses', () => {
    for (const value of [
      'a/b',
      'name@example.com',
      'two words',
      '',
      'x'.repeat(65),
    ]) {
      const event = normalizeAnalyticsEvent({
        name: 'paywall_shown',
        properties: { trigger_cut_id: value },
        occurredAt,
      });
      expect(event?.properties.trigger_cut_id).toBeUndefined();
    }
  });

  it('rounds and clamps numeric properties', () => {
    expect(
      normalizeAnalyticsEvent({
        name: 'puzzle_abandoned',
        properties: { cut_id: 'classic', piece_count: 9, progress_pct: 142.6 },
        occurredAt,
      })?.properties.progress_pct,
    ).toBe(100);

    expect(
      normalizeAnalyticsEvent({
        name: 'puzzle_abandoned',
        properties: { cut_id: 'classic', piece_count: 9, progress_pct: -3 },
        occurredAt,
      })?.properties.progress_pct,
    ).toBe(0);

    expect(
      normalizeAnalyticsEvent({
        name: 'puzzle_completed',
        properties: { cut_id: 'classic', piece_count: 9, duration_s: 12.7 },
        occurredAt,
      })?.properties.duration_s,
    ).toBe(13);

    expect(
      normalizeAnalyticsEvent({
        name: 'puzzle_completed',
        properties: {
          cut_id: 'classic',
          piece_count: 9,
          duration_s: Number.POSITIVE_INFINITY,
        },
        occurredAt,
      })?.properties.duration_s,
    ).toBeUndefined();
  });

  it('requires a usable timestamp', () => {
    expect(
      normalizeAnalyticsEvent({
        name: 'restore_completed',
        properties: {},
        occurredAt: 0,
      }),
    ).toBeNull();
    expect(
      normalizeAnalyticsEvent({
        name: 'restore_completed',
        properties: {},
        occurredAt: 'yesterday',
      }),
    ).toBeNull();
  });

  it('tolerates hostile persisted shapes', () => {
    expect(normalizeAnalyticsEvent(null)).toBeNull();
    expect(normalizeAnalyticsEvent([])).toBeNull();
    expect(
      normalizeAnalyticsEvent({
        name: 'app_opened',
        properties: 'not-an-object',
        occurredAt,
      }),
    ).toEqual({ name: 'app_opened', properties: {}, occurredAt });
  });

  it('compares events by name, time, and every property', () => {
    const base = {
      name: 'app_opened' as const,
      properties: { cold_start: true },
      occurredAt,
    };
    expect(sameAnalyticsEvent(base, { ...base })).toBe(true);
    expect(
      sameAnalyticsEvent(base, { ...base, properties: { cold_start: false } }),
    ).toBe(false);
    expect(sameAnalyticsEvent(base, { ...base, occurredAt: occurredAt + 1 })).toBe(
      false,
    );
    expect(sameAnalyticsEvent(base, { ...base, properties: {} })).toBe(false);
  });
});
