import type { PuzzleCutterId } from '../../puzzle/types/layout';
import {
  PREMIUM_CUT_CATALOG,
  PREMIUM_CUT_CATALOG_LIST,
} from '../../premium/catalog';

const CUT_STYLE_LABELS = Object.fromEntries([
  ['classic', 'Classic'],
  ...PREMIUM_CUT_CATALOG.map(({ id, label }) => [id, label] as const),
  ['fractal', 'Fractal'],
]) as Record<PuzzleCutterId, string>;

export const PREMIUM_CUT_STYLE_LABELS = PREMIUM_CUT_CATALOG.map(
  ({ label }) => label,
);

export const PREMIUM_CUT_STYLE_LIST = PREMIUM_CUT_CATALOG_LIST;

export function puzzleCutStyleLabel(cutterId: PuzzleCutterId): string {
  return CUT_STYLE_LABELS[cutterId];
}
