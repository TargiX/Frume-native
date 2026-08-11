import type { PuzzleCutter } from '../types/cutter';
import type { PuzzleCutterId } from '../types/layout';
import { AmoebaCutter } from './amoeba';
import {
  AmoebaColumnarCutter,
  BiomorphicCutter,
  CrystalCutter,
  CrystalQuarteredCutter,
  LivingSpectrumCutter,
} from './biomorphic';
import { ClassicCutter } from './classic';
import { OrganicCutter } from './organic';

const CUTTERS: Partial<Record<PuzzleCutterId, PuzzleCutter>> = {
  classic: ClassicCutter,
  organic: OrganicCutter,
  biomorphic: BiomorphicCutter,
  'living-spectrum': LivingSpectrumCutter,
  crystal: CrystalCutter,
  'crystal-quartered': CrystalQuarteredCutter,
  amoeba: AmoebaCutter,
  'amoeba-columnar': AmoebaColumnarCutter,
};

export function getCutter(id: PuzzleCutterId): PuzzleCutter {
  const cutter = CUTTERS[id];
  if (!cutter) {
    throw new Error(`Puzzle cutter "${id}" is not available`);
  }
  return cutter;
}

// Grouped by family rather than by name, so the picker reads as a progression
// from the familiar to the strange.
export function listCutters(): PuzzleCutter[] {
  return [
    ClassicCutter,
    OrganicCutter,
    BiomorphicCutter,
    LivingSpectrumCutter,
    CrystalCutter,
    CrystalQuarteredCutter,
    AmoebaCutter,
    AmoebaColumnarCutter,
  ];
}
