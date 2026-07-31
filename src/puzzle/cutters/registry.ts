import type { PuzzleCutter } from '../types/cutter';
import type { PuzzleCutterId } from '../types/layout';
import { BiomorphicCutter } from './biomorphic';
import { ClassicCutter } from './classic';
import { OrganicCutter } from './organic';

const CUTTERS: Partial<Record<PuzzleCutterId, PuzzleCutter>> = {
  classic: ClassicCutter,
  organic: OrganicCutter,
  biomorphic: BiomorphicCutter,
};

export function getCutter(id: PuzzleCutterId): PuzzleCutter {
  const cutter = CUTTERS[id];
  if (!cutter) {
    throw new Error(`Puzzle cutter "${id}" is not available`);
  }
  return cutter;
}

export function listCutters(): PuzzleCutter[] {
  return [ClassicCutter, OrganicCutter, BiomorphicCutter];
}
