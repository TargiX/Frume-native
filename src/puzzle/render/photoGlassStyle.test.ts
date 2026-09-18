import { describe, expect, it } from 'vitest';

import { PUZZLE_SURFACE_COLORS } from './surfacePalette';
import {
  PHOTO_GLASS_BLUR_RADIUS,
  resolveBoardMaterial,
  resolveSurfaceInk,
  resolveTrayMaterial,
} from './photoGlassStyle';

/** Relative luminance of a `#rrggbb` or `rgba(r, g, b, a)` colour. */
function luminance(color: string): number {
  const rgb = color.startsWith('#')
    ? [
        parseInt(color.slice(1, 3), 16),
        parseInt(color.slice(3, 5), 16),
        parseInt(color.slice(5, 7), 16),
      ]
    : (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const [r, g, b] = rgb;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

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

  it('gives dark photographs a light table and loading plate to sit on', () => {
    const linen = resolveBoardMaterial('linen');
    const felt = resolveBoardMaterial('felt');

    expect(luminance(linen.lit)).toBeGreaterThan(luminance(felt.lit));
    expect(luminance(linen.shaded)).toBeGreaterThan(luminance(felt.shaded));
    expect(luminance(linen.loading)).toBeGreaterThan(0.6);
    expect(resolveTrayMaterial('linen').top).not.toBe(
      PUZZLE_SURFACE_COLORS.trayTop,
    );
  });

  it('flips on-board text so it stays readable against each material', () => {
    const linenInk = resolveSurfaceInk('linen');
    const feltInk = resolveSurfaceInk('felt');
    const glassInk = resolveSurfaceInk('photo-glass');

    // Dark ink on the light table, light ink on both dark ones.
    expect(luminance(linenInk.onSurface)).toBeLessThan(0.35);
    expect(luminance(feltInk.onSurface)).toBeGreaterThan(0.65);
    expect(glassInk.onSurface).toBe(feltInk.onSurface);
    // The engraved groove line stays darker than the board it is cut into.
    expect(luminance(linenInk.guideCut)).toBeLessThan(
      luminance(resolveBoardMaterial('linen').lit),
    );
  });
});
