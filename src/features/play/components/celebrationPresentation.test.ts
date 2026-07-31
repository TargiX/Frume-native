import { describe, expect, it } from 'vitest';

import {
  CELEBRATION_MOTION,
  CONFETTI_PARTICLES,
} from './celebrationPresentation';

describe('puzzle completion celebration', () => {
  it('uses a restrained but visible confetti burst', () => {
    expect(CONFETTI_PARTICLES.length).toBeGreaterThanOrEqual(14);
    expect(CONFETTI_PARTICLES.length).toBeLessThanOrEqual(24);
  });

  it('finishes the decorative motion quickly', () => {
    expect(CELEBRATION_MOTION.confettiDurationMs).toBeLessThanOrEqual(1_800);
    expect(Math.max(...CONFETTI_PARTICLES.map((particle) => particle.delay))).toBeLessThanOrEqual(500);
  });

  it('keeps reduced motion to a short fade', () => {
    expect(CELEBRATION_MOTION.reducedDurationMs).toBeLessThanOrEqual(150);
  });
});
