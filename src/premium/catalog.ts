import type { PuzzleCutterId } from '../puzzle/types';

export type PremiumCutCatalogId = Exclude<
  PuzzleCutterId,
  'classic' | 'fractal'
>;

export type PremiumCutCatalogEntry = {
  id: PremiumCutCatalogId;
  label: string;
};

/** The exact cut styles granted by the reviewed permanent product. */
export const PREMIUM_CUT_CATALOG = [
  { id: 'organic', label: 'Organic' },
  { id: 'biomorphic', label: 'Living' },
  { id: 'living-spectrum', label: 'Living spectrum' },
  { id: 'crystal', label: 'Crystal' },
  { id: 'crystal-quartered', label: 'Crystal quartered' },
  { id: 'amoeba', label: 'Amoeba' },
  { id: 'amoeba-columnar', label: 'Amoeba columnar' },
] as const satisfies readonly PremiumCutCatalogEntry[];

export const PREMIUM_CUT_CATALOG_COUNT = PREMIUM_CUT_CATALOG.length;

const premiumCutLabels = PREMIUM_CUT_CATALOG.map(({ label }) => label);
export const PREMIUM_CUT_CATALOG_LIST = `${premiumCutLabels
  .slice(0, -1)
  .join(', ')}, and ${premiumCutLabels[premiumCutLabels.length - 1]}`;
