import { describe, expect, it } from 'vitest';

import { PUZZLE_SURFACE_COLORS } from './surfacePalette';
import {
  PHOTO_GLASS_BLUR_RADIUS,
  resolveBoardMaterial,
  resolveTrayMaterial,
} from './photoGlassStyle';

describe('photo glass material', () => {
  it('keeps the source photograph recognizable', () => {
    expect(PHOTO_GLASS_BLUR_RADIUS).toBeGreaterThanOrEqual(18);
    expect(PHOTO_GLASS_BLUR_RADIUS).toBeLessThanOrEqual(28);
  });

  it('uses a translucent shelf in photo glass mode', () => {
    const material = resolveTrayMaterial('photo-glass');

    expect(material.top).toMatch(/^rgba\(/);
    expect(material.bottom).toMatch(/^rgba\(/);
    expect(material.top).not.toBe(PUZZLE_SURFACE_COLORS.trayTop);
    expect(material.bottom).not.toBe(PUZZLE_SURFACE_COLORS.trayBottom);
  });

  it('preserves the original opaque shelf for dark felt', () => {
    const material = resolveTrayMaterial('felt');

    expect(material.top).toBe(PUZZLE_SURFACE_COLORS.trayTop);
    expect(material.bottom).toBe(PUZZLE_SURFACE_COLORS.trayBottom);
  });

  it('lets the photo atmosphere pass softly through the glass board', () => {
    const glass = resolveBoardMaterial('photo-glass');
    const felt = resolveBoardMaterial('felt');

    expect(glass.lit).toMatch(/^rgba\(/);
    expect(glass.shaded).toMatch(/^rgba\(/);
    expect(glass.lit).not.toBe(felt.lit);
    expect(felt.lit).toBe(PUZZLE_SURFACE_COLORS.boardLit);
    expect(glass.imageGuideOpacity).toBeLessThan(felt.imageGuideOpacity);
    expect(glass.imageGuideOpacity).toBeGreaterThanOrEqual(0.12);
  });
});
