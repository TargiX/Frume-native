import type { PuzzleTableAppearance } from '../types';
import { PUZZLE_SURFACE_COLORS } from './surfacePalette';

export const PHOTO_GLASS_BLUR_RADIUS = 24;
export const PHOTO_GLASS_TINT = 'rgba(17, 14, 12, 0.44)';
export const PHOTO_GLASS_VIGNETTE: string[] = [
  'rgba(255, 255, 255, 0.14)',
  'rgba(0, 0, 0, 0.3)',
];

type TrayMaterial = {
  top: string;
  bottom: string;
  contactShadow: string;
  coarseNoiseOpacity: number;
  fineNoiseOpacity: number;
};

type BoardMaterial = {
  lit: string;
  shaded: string;
  coarseNoiseOpacity: number;
  fineNoiseOpacity: number;
  imageGuideOpacity: number;
};

export function resolveBoardMaterial(
  appearance: PuzzleTableAppearance,
): BoardMaterial {
  if (appearance === 'photo-glass') {
    return {
      lit: 'rgba(55, 51, 46, 0.76)',
      shaded: 'rgba(38, 35, 32, 0.68)',
      coarseNoiseOpacity: 0.035,
      fineNoiseOpacity: 0.055,
      imageGuideOpacity: 0.14,
    };
  }

  return {
    lit: PUZZLE_SURFACE_COLORS.boardLit,
    shaded: PUZZLE_SURFACE_COLORS.boardShaded,
    coarseNoiseOpacity: 0.05,
    fineNoiseOpacity: 0.08,
    imageGuideOpacity: 0.18,
  };
}

export function resolveTrayMaterial(
  appearance: PuzzleTableAppearance,
): TrayMaterial {
  if (appearance === 'photo-glass') {
    return {
      top: 'rgba(20, 18, 17, 0.64)',
      bottom: 'rgba(10, 9, 9, 0.52)',
      contactShadow: 'rgba(0, 0, 0, 0.24)',
      coarseNoiseOpacity: 0.035,
      fineNoiseOpacity: 0.045,
    };
  }

  return {
    top: PUZZLE_SURFACE_COLORS.trayTop,
    bottom: PUZZLE_SURFACE_COLORS.trayBottom,
    contactShadow: 'rgba(0, 0, 0, 0.32)',
    coarseNoiseOpacity: 0.05,
    fineNoiseOpacity: 0.07,
  };
}
