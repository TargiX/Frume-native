import type { PuzzleTableAppearance } from '../types';
import {
  LINEN_SURFACE_COLORS,
  PUZZLE_SURFACE_COLORS,
} from './surfacePalette';

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
  /** Flat colour behind the board before the photograph has decoded. */
  loading: string;
  coarseNoiseOpacity: number;
  fineNoiseOpacity: number;
  imageGuideOpacity: number;
};

/** The colours drawn directly on a material: guide lines and on-board text. */
export type SurfaceInk = {
  guideCut: string;
  guideEdge: string;
  onSurface: string;
  onSurfaceMuted: string;
  trayHint: string;
};

export function resolveBoardMaterial(
  appearance: PuzzleTableAppearance,
): BoardMaterial {
  if (appearance === 'photo-glass') {
    return {
      lit: 'rgba(55, 51, 46, 0.76)',
      shaded: 'rgba(38, 35, 32, 0.68)',
      loading: PUZZLE_SURFACE_COLORS.boardLoading,
      coarseNoiseOpacity: 0.035,
      fineNoiseOpacity: 0.055,
      imageGuideOpacity: 0.14,
    };
  }
  if (appearance === 'linen') {
    return {
      lit: LINEN_SURFACE_COLORS.boardLit,
      shaded: LINEN_SURFACE_COLORS.boardShaded,
      loading: LINEN_SURFACE_COLORS.boardLoading,
      coarseNoiseOpacity: 0.05,
      fineNoiseOpacity: 0.07,
      imageGuideOpacity: 0.16,
    };
  }

  return {
    lit: PUZZLE_SURFACE_COLORS.boardLit,
    shaded: PUZZLE_SURFACE_COLORS.boardShaded,
    loading: PUZZLE_SURFACE_COLORS.boardLoading,
    coarseNoiseOpacity: 0.05,
    fineNoiseOpacity: 0.08,
    imageGuideOpacity: 0.18,
  };
}

/**
 * Guide lines and on-board text follow the material, never a fixed dark-theme
 * ink: a near-white guide edge vanishes on linen, and a dark one vanishes on
 * felt. Keeping them here means a new surface cannot ship with unreadable
 * guides by forgetting one call site.
 */
export function resolveSurfaceInk(
  appearance: PuzzleTableAppearance,
): SurfaceInk {
  if (appearance === 'linen') {
    return {
      guideCut: LINEN_SURFACE_COLORS.guideCut,
      guideEdge: LINEN_SURFACE_COLORS.guideEdge,
      onSurface: LINEN_SURFACE_COLORS.onSurface,
      onSurfaceMuted: LINEN_SURFACE_COLORS.onSurfaceMuted,
      trayHint: LINEN_SURFACE_COLORS.trayHint,
    };
  }
  return {
    guideCut: PUZZLE_SURFACE_COLORS.guideCut,
    guideEdge: PUZZLE_SURFACE_COLORS.guideEdge,
    onSurface: PUZZLE_SURFACE_COLORS.onSurface,
    onSurfaceMuted: PUZZLE_SURFACE_COLORS.onSurfaceMuted,
    trayHint: PUZZLE_SURFACE_COLORS.trayHint,
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
  if (appearance === 'linen') {
    return {
      top: LINEN_SURFACE_COLORS.trayTop,
      bottom: LINEN_SURFACE_COLORS.trayBottom,
      contactShadow: 'rgba(96, 80, 56, 0.22)',
      coarseNoiseOpacity: 0.05,
      fineNoiseOpacity: 0.07,
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
