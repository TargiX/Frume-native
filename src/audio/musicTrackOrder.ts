const FAMILY_SPACED_TRACK_ORDER = [0, 2, 4, 1, 3, 5] as const;

/** Rotates a family-spaced order so every session can begin on a different song. */
export function createMusicTrackOrder(randomValue: number): number[] {
  const boundedRandom = Math.min(Math.max(randomValue, 0), 0.999_999);
  const offset = Math.floor(boundedRandom * FAMILY_SPACED_TRACK_ORDER.length);
  return [
    ...FAMILY_SPACED_TRACK_ORDER.slice(offset),
    ...FAMILY_SPACED_TRACK_ORDER.slice(0, offset),
  ];
}
