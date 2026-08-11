import { describe, expect, it } from 'vitest';

import { PUZZLE_SEAM_DISSOLVE_MS } from '../../../puzzle/render/revealMotion';
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

  it('lets the seams finish dissolving before the panel arrives', () => {
    expect(CELEBRATION_MOTION.panelDelayMs).toBeGreaterThan(
      PUZZLE_SEAM_DISSOLVE_MS,
    );
    // Long enough to see the whole photograph, short enough not to feel stuck.
    expect(CELEBRATION_MOTION.panelDelayMs).toBeLessThanOrEqual(900);
  });

  it('keeps reduced motion to a short fade', () => {
    expect(CELEBRATION_MOTION.reducedDurationMs).toBeLessThanOrEqual(150);
  });
});
