import type { PuzzlePieceDefinition } from "../../types/layout";
import {
  generateBiomorphicPiecesFromTopology,
  isBiomorphicTopologySafe,
  type BiomorphicCell,
  type BiomorphicEdge,
  type BiomorphicPathSegment,
  type BiomorphicPoint,
  type BiomorphicTopology,
} from "./generateBiomorphic";
import {
  BIOMORPHIC_PHASE_FIELD_NUMERICS,
  BIOMORPHIC_PHASE_FIELD_PROFILES,
  parsePhaseFieldLabSettings,
  type BiomorphicPhaseFieldLabSettings,
  type BiomorphicPhaseFieldNumerics,
  type BiomorphicPhaseFieldProfile,
  type BiomorphicPhaseFieldStyle,
  type BiomorphicSeedLayout,
} from "./phaseFieldLabConfig";
import { measureCutThickness, type CutThickness } from "./measureCutThickness";

export type { BiomorphicPhaseFieldStyle } from "./phaseFieldLabConfig";

type LatticePoint = {
  x: number;
  y: number;
};

type PhaseSeed = {
  id: string;
  index: number;
  row: number;
  col: number;
  x: number;
  y: number;
};

type OrientedBoundaryUnit = {
  recordKey: string;
  start: LatticePoint;
  end: LatticePoint;
};

type BoundaryRecord = {
  key: string;
  start: LatticePoint;
  end: LatticePoint;
  owners: Set<number>;
};

type ExtractedEdge = {
  edge: BiomorphicEdge;
  recordDirections: ReadonlyMap<
    string,
    { start: LatticePoint; end: LatticePoint }
  >;
};

type PhaseFieldSimulation = {
  width: number;
  height: number;
  labels: Int16Array;
  seeds: readonly PhaseSeed[];
  liquidRatio: number;
  voronoiLabels?: Int16Array;
  perturbedLabels?: Int16Array;
  unrepairedLabels?: Int16Array;
  /** Debug capture: labels before the residual melt was assigned. */
  rawLabels?: Int16Array;
};

export type BiomorphicPhaseFieldLabFrame = {
  iteration: number;
  svg: string;
  componentCounts: readonly number[];
  holeCounts: readonly number[];
  boundaryUnits: number;
  changedFromInitialRatio: number;
  maximumPenetrationFromInitial: number;
};

export type BiomorphicPhaseFieldLabResult = {
  settings: BiomorphicPhaseFieldLabSettings;
  frames: readonly BiomorphicPhaseFieldLabFrame[];
  finalSvg: string;
  elapsedMs: number;
  /** Share of the board left unclaimed — the free rim, when one was asked for. */
  liquidRatio: number;
  /**
   * Thinnest isthmus or whisker in the finished cut, as a fraction of a piece.
   * Connected and hole-free says nothing about this: a piece can stay simply
   * connected while carrying a tab too thin to survive the plywood.
   */
  thinnest: { fraction: number } & CutThickness;
  vectorizationError?: string;
};

type PhaseFieldObserver = {
  captureEvery: number;
  onFrame: (iteration: number, labels: Int16Array) => void;
};

function countLabelComponents(
  labels: Int16Array,
  width: number,
  height: number,
  phaseCount: number,
): number[] {
  const counts = Array.from({ length: phaseCount }, () => 0);
  const visited = new Uint8Array(labels.length);
  const queue = new Int32Array(labels.length);
  for (let start = 0; start < labels.length; start += 1) {
    if (visited[start]) continue;
    const owner = labels[start];
    counts[owner] += 1;
    visited[start] = 1;
    queue[0] = start;
    let cursor = 0;
    let length = 1;
    while (cursor < length) {
      const pixel = queue[cursor];
      cursor += 1;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      const neighbors = [
        x > 0 ? pixel - 1 : -1,
        x + 1 < width ? pixel + 1 : -1,
        y > 0 ? pixel - width : -1,
        y + 1 < height ? pixel + width : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor >= 0 && !visited[neighbor] && labels[neighbor] === owner) {
          visited[neighbor] = 1;
          queue[length] = neighbor;
          length += 1;
        }
      }
    }
  }
  return counts;
}

function countLabelHoles(
  labels: Int16Array,
  width: number,
  height: number,
  phaseCount: number,
): number[] {
  const holes = Array.from({ length: phaseCount }, () => 0);
  const visited = new Uint8Array(labels.length);
  const queue = new Int32Array(labels.length);
  const enqueueExterior = (
    phaseIndex: number,
    pixel: number,
    queueLength: number,
  ): number => {
    if (visited[pixel] || labels[pixel] === phaseIndex) return queueLength;
    visited[pixel] = 1;
    queue[queueLength] = pixel;
    return queueLength + 1;
  };
  const flood = (phaseIndex: number, queueLength: number): void => {
    for (let cursor = 0; cursor < queueLength; cursor += 1) {
      const pixel = queue[cursor];
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      // Pieces are grown and repaired under 4-connectivity, so their complement
      // has to be flooded under 8-connectivity: that is the pairing digital
      // topology requires. Flooding both under 4 reports a hole wherever the
      // outline pinches diagonally across a single sample, which is a staircase
      // artefact of the lattice and not a ring in the piece.
      const left = x > 0;
      const right = x + 1 < width;
      const up = y > 0;
      const down = y + 1 < height;
      const neighbors = [
        left ? pixel - 1 : -1,
        right ? pixel + 1 : -1,
        up ? pixel - width : -1,
        down ? pixel + width : -1,
        left && up ? pixel - width - 1 : -1,
        right && up ? pixel - width + 1 : -1,
        left && down ? pixel + width - 1 : -1,
        right && down ? pixel + width + 1 : -1,
      ];
      for (const neighbor of neighbors) {
        if (
          neighbor >= 0 &&
          !visited[neighbor] &&
          labels[neighbor] !== phaseIndex
        ) {
          visited[neighbor] = 1;
          queue[queueLength] = neighbor;
          queueLength += 1;
        }
      }
    }
  };

  for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
    visited.fill(0);
    let queueLength = 0;
    for (let x = 0; x < width; x += 1) {
      queueLength = enqueueExterior(phaseIndex, x, queueLength);
      queueLength = enqueueExterior(
        phaseIndex,
        (height - 1) * width + x,
        queueLength,
      );
    }
    for (let y = 1; y + 1 < height; y += 1) {
      queueLength = enqueueExterior(phaseIndex, y * width, queueLength);
      queueLength = enqueueExterior(
        phaseIndex,
        y * width + width - 1,
        queueLength,
      );
    }
    flood(phaseIndex, queueLength);
    for (let pixel = 0; pixel < labels.length; pixel += 1) {
      if (visited[pixel] || labels[pixel] === phaseIndex) continue;
      holes[phaseIndex] += 1;
      visited[pixel] = 1;
      queue[0] = pixel;
      flood(phaseIndex, 1);
    }
  }
  return holes;
}

/**
 * Once every label is connected, a ring-shaped label is exactly an
 * articulation vertex in the region-adjacency graph: removing it disconnects
 * at least one interior region from the board exterior. Tarjan's low-link
 * test finds that condition in O(pixels + labels + adjacencies), avoiding a
 * full complement flood-fill for every phase on every Euler step.
 */
function hasEnclosingPhase(
  labels: Int16Array,
  width: number,
  height: number,
  phaseCount: number,
): boolean {
  const exterior = phaseCount;
  const neighbors = Array.from(
    { length: phaseCount + 1 },
    () => new Set<number>(),
  );
  const connect = (first: number, second: number) => {
    if (first === second) return;
    neighbors[first].add(second);
    neighbors[second].add(first);
  };

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      const pixel = rowOffset + x;
      const owner = labels[pixel];
      if (x + 1 < width) connect(owner, labels[pixel + 1]);
      if (y + 1 < height) connect(owner, labels[pixel + width]);
      if (x === 0 || x + 1 === width || y === 0 || y + 1 === height) {
        connect(owner, exterior);
      }
    }
  }

  const discovery = new Int16Array(phaseCount + 1);
  discovery.fill(-1);
  const low = new Int16Array(phaseCount + 1);
  const parent = new Int16Array(phaseCount + 1);
  parent.fill(-1);
  let time = 0;
  let enclosing = false;
  const visit = (node: number) => {
    discovery[node] = time;
    low[node] = time;
    time += 1;
    for (const neighbor of neighbors[node]) {
      if (discovery[neighbor] < 0) {
        parent[neighbor] = node;
        visit(neighbor);
        low[node] = Math.min(low[node], low[neighbor]);
        if (node !== exterior && low[neighbor] >= discovery[node]) {
          enclosing = true;
        }
      } else if (neighbor !== parent[node]) {
        low[node] = Math.min(low[node], discovery[neighbor]);
      }
    }
  };
  visit(exterior);
  return enclosing;
}

/**
 * Marks melt reachable from the board edge without crossing a claimed sample.
 * That is the grown outer contour; anything else is an enclosed hole.
 */
/**
 * Shaves tabs narrower than `radius` samples off every piece and hands the
 * shavings to whichever neighbour is closest, leaving fat lobes untouched.
 *
 * A morphological opening: erode each piece, then dilate the survivors back.
 * Anything that cannot survive the erosion was a hair thinner than twice the
 * radius. This runs after the solve, the way the paper removes its own too-thin
 * sections, so the physics keeps producing fine detail and only the parts that
 * would snap out of the plywood are removed.
 */
/** Reduces a mask to its largest 4-connected component, in place. */
/**
 * Rounds the whole partition at once: every sample takes the majority label in
 * a disc of `radius` around it, repeated until nothing changes.
 *
 * Shaving pieces one at a time cannot fix a thin neck. The same sliver is an
 * isthmus of the piece it belongs to and a finger of the piece wrapped around
 * it, so removing it from one hands it straight to the other, which is what the
 * measurements showed: the narrowest neck did not move. A majority filter is
 * symmetric -- it does not know which side it is standing on -- so a structure
 * thinner than the disc dissolves for whoever owns it, and the neighbours close
 * over it together.
 *
 * Seed samples are pinned, so no piece can be voted out of existence.
 */
function roundPartition(
  labels: Int16Array,
  width: number,
  height: number,
  radius: number,
  seedPixels: readonly number[],
  maxPasses = 4,
): number {
  if (radius < 1) return 0;
  const pixelCount = width * height;
  const next = new Int16Array(pixelCount);
  const tally = new Map<number, number>();
  let changedTotal = 0;

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let changed = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = y * width + x;
        tally.clear();
        let best = labels[pixel];
        let bestCount = 0;
        for (let dy = -radius; dy <= radius; dy += 1) {
          const sampleY = y + dy;
          if (sampleY < 0 || sampleY >= height) continue;
          const span = radius - Math.abs(dy);
          for (let dx = -span; dx <= span; dx += 1) {
            const sampleX = x + dx;
            if (sampleX < 0 || sampleX >= width) continue;
            const owner = labels[sampleY * width + sampleX];
            const count = (tally.get(owner) ?? 0) + 1;
            tally.set(owner, count);
            // Ties go to the incumbent, so the filter cannot oscillate.
            if (count > bestCount || (count === bestCount && owner === labels[pixel])) {
              bestCount = count;
              best = owner;
            }
          }
        }
        next[pixel] = best;
        if (best !== labels[pixel]) changed += 1;
      }
    }
    labels.set(next);
    for (let index = 0; index < seedPixels.length; index += 1) {
      labels[seedPixels[index]] = index;
    }
    changedTotal += changed;
    if (changed === 0) break;
  }
  return changedTotal;
}

/**
 * Restores one connected piece per phase after the partition has been rounded.
 *
 * The majority filter is deliberately blind to ownership, so it can sever a
 * lobe from its piece. Whatever no longer reaches the piece's seed is released
 * and handed to the nearest front, which is the same repair the solver already
 * applies to leftover melt.
 */
function repairPartitionConnectivity(
  labels: Int16Array,
  width: number,
  height: number,
  seedPixels: readonly number[],
): void {
  const pixelCount = width * height;
  const reachable = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let length = 0;
  for (let phaseIndex = 0; phaseIndex < seedPixels.length; phaseIndex += 1) {
    const seedPixel = seedPixels[phaseIndex];
    if (labels[seedPixel] !== phaseIndex || reachable[seedPixel]) continue;
    reachable[seedPixel] = 1;
    queue[length] = seedPixel;
    length += 1;
  }
  for (let cursor = 0; cursor < length; cursor += 1) {
    const pixel = queue[cursor];
    const owner = labels[pixel];
    const x = pixel % width;
    const y = (pixel - x) / width;
    const neighbours = [
      x > 0 ? pixel - 1 : -1,
      x + 1 < width ? pixel + 1 : -1,
      y > 0 ? pixel - width : -1,
      y + 1 < height ? pixel + width : -1,
    ];
    for (const neighbour of neighbours) {
      if (neighbour < 0 || reachable[neighbour]) continue;
      if (labels[neighbour] !== owner) continue;
      reachable[neighbour] = 1;
      queue[length] = neighbour;
      length += 1;
    }
  }
  let released = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (labels[pixel] >= 0 && !reachable[pixel]) {
      labels[pixel] = -1;
      released += 1;
    }
  }
  if (released > 0) assignLiquidToNearestFront(labels, width, height);
}

function keepLargestComponent(
  mask: Uint8Array,
  seen: Uint8Array,
  queue: Int32Array,
  width: number,
  height: number,
): void {
  seen.fill(0);
  let bestStart = -1;
  let bestSize = 0;
  const pixelCount = width * height;
  for (let start = 0; start < pixelCount; start += 1) {
    if (!mask[start] || seen[start]) continue;
    seen[start] = 1;
    queue[0] = start;
    let length = 1;
    for (let cursor = 0; cursor < length; cursor += 1) {
      const pixel = queue[cursor];
      const x = pixel % width;
      const y = (pixel - x) / width;
      const neighbours = [
        x > 0 ? pixel - 1 : -1,
        x + 1 < width ? pixel + 1 : -1,
        y > 0 ? pixel - width : -1,
        y + 1 < height ? pixel + width : -1,
      ];
      for (const neighbour of neighbours) {
        if (neighbour < 0 || !mask[neighbour] || seen[neighbour]) continue;
        seen[neighbour] = 1;
        queue[length] = neighbour;
        length += 1;
      }
    }
    if (length > bestSize) {
      bestSize = length;
      bestStart = start;
    }
  }
  if (bestStart < 0) return;

  seen.fill(0);
  seen[bestStart] = 1;
  queue[0] = bestStart;
  let length = 1;
  for (let cursor = 0; cursor < length; cursor += 1) {
    const pixel = queue[cursor];
    const x = pixel % width;
    const y = (pixel - x) / width;
    const neighbours = [
      x > 0 ? pixel - 1 : -1,
      x + 1 < width ? pixel + 1 : -1,
      y > 0 ? pixel - width : -1,
      y + 1 < height ? pixel + width : -1,
    ];
    for (const neighbour of neighbours) {
      if (neighbour < 0 || !mask[neighbour] || seen[neighbour]) continue;
      seen[neighbour] = 1;
      queue[length] = neighbour;
      length += 1;
    }
  }
  for (let pixel = 0; pixel < pixelCount; pixel += 1) mask[pixel] = seen[pixel];
}

function shaveThinNecks(
  labels: Int16Array,
  width: number,
  height: number,
  phaseCount: number,
  radius: number,
): number {
  if (radius < 1) return 0;
  const pixelCount = width * height;
  const keep = new Uint8Array(pixelCount);
  const current = new Uint8Array(pixelCount);
  const next = new Uint8Array(pixelCount);
  const queueScratch = new Int32Array(pixelCount);

  for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
    let present = false;
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const owned = labels[pixel] === phaseIndex ? 1 : 0;
      current[pixel] = owned;
      if (owned) present = true;
    }
    if (!present) continue;

    // Erode: a sample survives only with the whole cross of neighbours owned.
    // Off the board counts as owned, so pieces are not eaten from the rim.
    for (let step = 0; step < radius; step += 1) {
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const pixel = y * width + x;
          next[pixel] =
            current[pixel] &&
            (x === 0 || current[pixel - 1]) &&
            (x + 1 === width || current[pixel + 1]) &&
            (y === 0 || current[pixel - width]) &&
            (y + 1 === height || current[pixel + width])
              ? 1
              : 0;
        }
      }
      current.set(next);
    }

    // The whole piece may be thinner than the radius; keeping nothing would
    // delete it outright, so in that case leave the piece exactly as it was.
    let survived = false;
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      if (current[pixel]) {
        survived = true;
        break;
      }
    }
    if (!survived) {
      for (let pixel = 0; pixel < pixelCount; pixel += 1) {
        if (labels[pixel] === phaseIndex) keep[pixel] = 1;
      }
      continue;
    }

    // Keep only the largest surviving core. Dilating every survivor back would
    // rebuild the very isthmus the erosion just cut: both lobes come through,
    // and the dilation joins them again. Growing one core alone is what turns
    // "eroding by r splits this piece" into "the lobe hanging on a thread is
    // given to a neighbour", which is the whole point of the pass.
    //
    // Measured caveat, and the reason minNeck still ships off: this removes
    // material as intended but does not move the measured minimum, because the
    // lobe handed to a neighbour arrives attached to it by a thread of its own.
    // Repairing thin necks needs the neighbours resolved together, not one
    // piece at a time.
    keepLargestComponent(current, next, queueScratch, width, height);

    for (let step = 0; step < radius; step += 1) {
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const pixel = y * width + x;
          next[pixel] =
            current[pixel] ||
            (x > 0 && current[pixel - 1]) ||
            (x + 1 < width && current[pixel + 1]) ||
            (y > 0 && current[pixel - width]) ||
            (y + 1 < height && current[pixel + width])
              ? 1
              : 0;
        }
      }
      current.set(next);
    }
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      if (current[pixel] && labels[pixel] === phaseIndex) keep[pixel] = 1;
    }
  }

  // Hand the shavings to the nearest OTHER piece. Giving them to the nearest
  // front of any kind would return every hair to the piece it grew from, since
  // that piece is what it is attached to.
  const shavedFrom = new Int16Array(pixelCount).fill(-1);
  const queue = new Int32Array(pixelCount);
  let shaved = 0;
  let length = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (labels[pixel] >= 0 && !keep[pixel]) {
      shavedFrom[pixel] = labels[pixel];
      labels[pixel] = -1;
      shaved += 1;
    }
  }
  if (shaved === 0) return 0;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (labels[pixel] >= 0) {
      queue[length] = pixel;
      length += 1;
    }
  }
  for (let cursor = 0; cursor < length; cursor += 1) {
    const pixel = queue[cursor];
    const owner = labels[pixel];
    const x = pixel % width;
    const y = (pixel - x) / width;
    const neighbours = [
      x > 0 ? pixel - 1 : -1,
      x + 1 < width ? pixel + 1 : -1,
      y > 0 ? pixel - width : -1,
      y + 1 < height ? pixel + width : -1,
    ];
    for (const neighbour of neighbours) {
      if (neighbour < 0) continue;
      if (labels[neighbour] >= 0) continue;
      if (shavedFrom[neighbour] === owner) continue;
      labels[neighbour] = owner;
      queue[length] = neighbour;
      length += 1;
    }
  }
  // A hair with no other piece anywhere near it stays with its own piece: it is
  // a spike on the board rim, and deleting it would punch a hole in the board.
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (labels[pixel] < 0 && shavedFrom[pixel] >= 0) {
      labels[pixel] = shavedFrom[pixel];
    }
  }
  return shaved;
}

function floodOuterMelt(
  labels: Int16Array,
  width: number,
  height: number,
): Uint8Array {
  const outside = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let length = 0;
  const push = (pixel: number) => {
    if (labels[pixel] >= 0 || outside[pixel]) return;
    outside[pixel] = 1;
    queue[length] = pixel;
    length += 1;
  };
  for (let x = 0; x < width; x += 1) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    push(y * width);
    push(y * width + width - 1);
  }
  for (let cursor = 0; cursor < length; cursor += 1) {
    const pixel = queue[cursor];
    const x = pixel % width;
    const y = (pixel - x) / width;
    if (x > 0) push(pixel - 1);
    if (x + 1 < width) push(pixel + 1);
    if (y > 0) push(pixel - width);
    if (y + 1 < height) push(pixel + width);
  }
  return outside;
}

function createPhaseTopologyProjector(
  width: number,
  height: number,
  phaseCount: number,
  seeds: readonly PhaseSeed[],
): (
  phis: readonly Float32Array[],
  boxes: Int32Array,
  boundingBoxMargin: number,
) => number {
  const pixelCount = width * height;
  const labels = new Int16Array(pixelCount);
  const strongest = new Float32Array(pixelCount);
  const componentIds = new Int32Array(pixelCount);
  const repaired = new Int16Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const seedPixels = new Int32Array(phaseCount);
  const anchors = new Int32Array(phaseCount);
  const acceptedLabels = new Int16Array(pixelCount);
  let hasAcceptedLabels = false;
  const componentOwners: number[] = [];
  const componentSizes: number[] = [];

  seeds.forEach((phaseSeed, phaseIndex) => {
    const x = Math.max(0, Math.min(width - 1, Math.round(phaseSeed.x * width)));
    const y = Math.max(
      0,
      Math.min(height - 1, Math.round(phaseSeed.y * height)),
    );
    seedPixels[phaseIndex] = y * width + x;
  });

  return (phis, boxes, boundingBoxMargin) => {
    labels.fill(-1);
    strongest.fill(-Infinity);
    for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
      const phi = phis[phaseIndex];
      for (let pixel = 0; pixel < pixelCount; pixel += 1) {
        if (phi[pixel] > strongest[pixel]) {
          strongest[pixel] = phi[pixel];
          labels[pixel] = phaseIndex;
        }
      }
    }

    // Every physical piece keeps its original seed as an immutable topology
    // anchor. The phase may deform around it, but cannot vanish or be replaced
    // wholesale by a neighbor.
    for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
      labels[seedPixels[phaseIndex]] = phaseIndex;
    }

    componentIds.fill(-1);
    componentOwners.length = 0;
    componentSizes.length = 0;
    let componentCount = 0;
    for (let start = 0; start < pixelCount; start += 1) {
      if (componentIds[start] >= 0) continue;
      const owner = labels[start];
      const componentId = componentCount;
      componentCount += 1;
      componentOwners.push(owner);
      componentIds[start] = componentId;
      queue[0] = start;
      let cursor = 0;
      let length = 1;
      while (cursor < length) {
        const pixel = queue[cursor];
        cursor += 1;
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        const neighbors = [
          x > 0 ? pixel - 1 : -1,
          x + 1 < width ? pixel + 1 : -1,
          y > 0 ? pixel - width : -1,
          y + 1 < height ? pixel + width : -1,
        ];
        for (const neighbor of neighbors) {
          if (
            neighbor >= 0 &&
            componentIds[neighbor] < 0 &&
            labels[neighbor] === owner
          ) {
            componentIds[neighbor] = componentId;
            queue[length] = neighbor;
            length += 1;
          }
        }
      }
      componentSizes.push(length);
    }

    anchors.fill(-1);
    for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
      const seededComponent = componentIds[seedPixels[phaseIndex]];
      if (componentOwners[seededComponent] === phaseIndex) {
        anchors[phaseIndex] = seededComponent;
        continue;
      }
      let largestSize = -1;
      for (
        let componentId = 0;
        componentId < componentCount;
        componentId += 1
      ) {
        if (
          componentOwners[componentId] === phaseIndex &&
          componentSizes[componentId] > largestSize
        ) {
          anchors[phaseIndex] = componentId;
          largestSize = componentSizes[componentId];
        }
      }
    }

    repaired.fill(-1);
    let queueLength = 0;
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const owner = labels[pixel];
      if (componentIds[pixel] !== anchors[owner]) continue;
      repaired[pixel] = owner;
      queue[queueLength] = pixel;
      queueLength += 1;
    }

    // Grow all retained connected cores simultaneously into the discarded
    // islands. Because every awarded sample is reached from its owner's core,
    // the repaired ownership remains connected by construction.
    for (let cursor = 0; cursor < queueLength; cursor += 1) {
      const pixel = queue[cursor];
      const owner = repaired[pixel];
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      const neighbors = [
        x > 0 ? pixel - 1 : -1,
        x + 1 < width ? pixel + 1 : -1,
        y > 0 ? pixel - width : -1,
        y + 1 < height ? pixel + width : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || repaired[neighbor] >= 0) continue;
        repaired[neighbor] = owner;
        queue[queueLength] = neighbor;
        queueLength += 1;
      }
    }

    // A phase can stay connected while wrapping completely around another
    // region, producing a ring-shaped physical piece. Preserve the last valid
    // ownership partition when a proposed Euler step creates such a hole.
    // Continuous phase/temperature fields still advance, so subsequent steps
    // can find a different, topology-safe direction instead of terminating
    // the simulation or manufacturing a post-process contour.
    if (
      hasAcceptedLabels &&
      hasEnclosingPhase(repaired, width, height, phaseCount)
    ) {
      repaired.set(acceptedLabels);
    }

    let changed = 0;
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const repairedOwner = repaired[pixel];
      // `labels` contains the forced seed anchors used by the topology solve.
      // At an anchor its label can therefore differ from the actual strongest
      // phase field. Compare against the fields themselves; otherwise the
      // projector reports a connected partition but the next argmax brings
      // the detached pre-anchor island straight back.
      let previousOwner = 0;
      let previousMaximum = -Infinity;
      for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
        if (phis[phaseIndex][pixel] > previousMaximum) {
          previousMaximum = phis[phaseIndex][pixel];
          previousOwner = phaseIndex;
        }
      }
      if (previousOwner === repairedOwner) continue;
      changed += 1;
      let competingMaximum = 0;
      for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
        if (phaseIndex === repairedOwner) continue;
        if (phaseIndex === previousOwner) phis[phaseIndex][pixel] = 0;
        if (phis[phaseIndex][pixel] > competingMaximum) {
          competingMaximum = phis[phaseIndex][pixel];
        }
      }
      phis[repairedOwner][pixel] = Math.max(
        phis[repairedOwner][pixel],
        competingMaximum + 1e-5,
      );
      let total = 0;
      for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
        total += phis[phaseIndex][pixel];
      }
      if (total > 1e-12) {
        for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
          phis[phaseIndex][pixel] /= total;
        }
      } else {
        phis[repairedOwner][pixel] = 1;
      }

      const x = pixel % width;
      const y = Math.floor(pixel / width);
      const offset = repairedOwner * 4;
      boxes[offset] = Math.min(
        boxes[offset],
        Math.max(0, x - boundingBoxMargin),
      );
      boxes[offset + 1] = Math.max(
        boxes[offset + 1],
        Math.min(width - 1, x + boundingBoxMargin),
      );
      boxes[offset + 2] = Math.min(
        boxes[offset + 2],
        Math.max(0, y - boundingBoxMargin),
      );
      boxes[offset + 3] = Math.max(
        boxes[offset + 3],
        Math.min(height - 1, y + boundingBoxMargin),
      );
    }
    acceptedLabels.set(repaired);
    hasAcceptedLabels = true;
    return changed;
  };
}

export type BiomorphicPhaseFieldDiagnostics = {
  /** Share of samples whose final owner differs from plain nearest-seed Voronoi. */
  changedLabelRatio: number;
  /** Share of samples reassigned by the post-simulation connectivity repair. */
  cleanupChangedLabelRatio: number;
  /** Interface length of the simulated cut relative to the straight Voronoi cut. */
  boundaryAmplification: number;
  /** Share of samples changed by simulation after Perturb Edges completed. */
  simulationChangedLabelRatio: number;
  /** Interface growth caused by simulation alone, after Perturb Edges. */
  simulationBoundaryAmplification: number;
  /** Deepest ownership change caused by simulation alone, in samples. */
  simulationMaximumPenetrationSamples: number;
  /** Deepest simulated intrusion past the Voronoi boundary, in samples. */
  maximumPenetrationSamples: number;
  /** Share of ownership changes at least 3 samples past the Voronoi boundary. */
  deepGrowthRatio: number;
  /** Share of the board left unclaimed when the run stopped. */
  liquidRatio: number;
  safeAfterSimulation: boolean;
};

/**
 * One attempt of the run, following Louis-Rosenberg, Resnick & Rosenkrantz,
 * "Multiphase Numerical Modeling of Dendritic Solidification for Jigsaw
 * Puzzle Generation" (2012). Every profile is the paper's simulation; the
 * parameters below are the published simulation scale, never a geometric
 * lobe template or a silent fallback to another cutter.
 */
type SimulationProfile = BiomorphicPhaseFieldProfile & {
  /**
   * Coral mode: pieces start as small star nuclei and grow dendritically
   * through their own supercooled territory, so mass visibly flows from
   * the center out into ramifying arm tips. Absent = tessellation mode
   * (pieces tile the board from the start and only their seams evolve).
   */
  /**
   * Coral mode: after growth and melt assignment, re-tile the board from
   * the resulting labels and anneal the seams isotropically for this many
   * iterations. Rounds the straight melt-fill segments into organic curves
   * while the deep grown fjords freeze in place.
   */
  polishIterations?: number;
  /**
   * Coupling to the territorial quench bath: temperatures relax back
   * toward their initial supercooled/superheated profile at this rate,
   * emulating the infinite cold reservoir classic dendrites grow into.
   */
  bathCoupling?: number;
  nucleus?: {
    /** Nucleus radius as a fraction of the piece size. */
    radius: number;
    /** Rim lobe counts seeding the first arms. */
    lobes: number;
    lobes2: number;
    /** Rim lobe amplitudes as fractions of the radius. */
    lobeAmplitude: number;
    lobeAmplitude2: number;
  };
};

const SIMULATION_PROFILES: Record<
  BiomorphicPhaseFieldStyle,
  SimulationProfile
> = BIOMORPHIC_PHASE_FIELD_PROFILES;

function phaseFieldsToLabels(
  phis: readonly Float32Array[],
  width: number,
  height: number,
): Int16Array {
  const labels = new Int16Array(width * height);
  const strongest = new Float32Array(width * height);
  labels.fill(-1);
  for (let phaseIndex = 0; phaseIndex < phis.length; phaseIndex += 1) {
    const phi = phis[phaseIndex];
    for (let pixel = 0; pixel < labels.length; pixel += 1) {
      if (phi[pixel] > strongest[pixel]) {
        strongest[pixel] = phi[pixel];
        labels[pixel] = phaseIndex;
      }
    }
  }
  return labels;
}

function labelsToBoundarySvg(
  labels: Int16Array,
  width: number,
  height: number,
): string {
  const segments: string[] = [];
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      const pixel = rowOffset + x;
      if (x + 1 < width && labels[pixel] !== labels[pixel + 1]) {
        segments.push(`M${x + 1} ${y}V${y + 1}`);
      }
      if (y + 1 < height && labels[pixel] !== labels[pixel + width]) {
        segments.push(`M${x} ${y + 1}H${x + 1}`);
      }
    }
  }
  const strokeWidth = Math.max(0.7, Math.min(width, height) / 430);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">`,
    '<rect width="100%" height="100%" fill="#0d0e0e"/>',
    `<path d="${segments.join("")}" fill="none" stroke="#e6ad4b" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<rect x="${strokeWidth / 2}" y="${strokeWidth / 2}" width="${width - strokeWidth}" height="${height - strokeWidth}" fill="none" stroke="#72562b" stroke-width="${strokeWidth}"/>`,
    "</svg>",
  ].join("");
}

function topologyToBoundarySvg(topology: BiomorphicTopology): string {
  const coordinate = (value: number) => (value * 1000).toFixed(2);
  const paths = topology.edges.map((edge) => {
    const first = edge.segments[0];
    const commands = [
      `M${coordinate(first.start.x)} ${coordinate(first.start.y)}`,
    ];
    for (const segment of edge.segments) {
      if (segment.kind === "line") {
        commands.push(
          `L${coordinate(segment.end.x)} ${coordinate(segment.end.y)}`,
        );
      } else {
        commands.push(
          `C${coordinate(segment.control1.x)} ${coordinate(segment.control1.y)} ` +
            `${coordinate(segment.control2.x)} ${coordinate(segment.control2.y)} ` +
            `${coordinate(segment.end.x)} ${coordinate(segment.end.y)}`,
        );
      }
    }
    return `<path d="${commands.join("")}" fill="none" stroke="${
      edge.exterior ? "#72562b" : "#e6ad4b"
    }" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">',
    '<rect width="100%" height="100%" fill="#0d0e0e"/>',
    ...paths,
    "</svg>",
  ].join("");
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;
  return hash >>> 0;
}

function randomUnit(seed: string, key: string): number {
  return hashString(`${seed}:${key}`) / 0x100000000;
}

function randomSigned(seed: string, key: string): number {
  return randomUnit(seed, key) * 2 - 1;
}

function assertDimensions(rows: number, columns: number): void {
  if (
    !Number.isInteger(rows) ||
    !Number.isInteger(columns) ||
    rows < 1 ||
    columns < 1
  ) {
    throw new Error(
      "Biomorphic phase-field rows and columns must be positive integers",
    );
  }
}

function createSeeds(
  rows: number,
  columns: number,
  seed: string,
  layout: BiomorphicSeedLayout,
): PhaseSeed[] {
  const count = rows * columns;
  const sites: LatticePoint[] = [];
  // Seed placement is a cut-style parameter in its own right: the paper's
  // figure 5 shows the same solver over blue-noise, columnar, and lattice
  // seeds producing three visibly different families of pieces.
  if (layout.mode !== "blue-noise") {
    const jitter = layout.mode === "grid" ? 0 : layout.jitter;
    for (let index = 0; index < count; index += 1) {
      const row = Math.floor(index / columns);
      const col = index % columns;
      // Half a cell of jitter would let neighbouring sites coincide, so the
      // usable range is half of that in each direction.
      const offsetX = randomSigned(seed, `grid-x-${index}`) * jitter * 0.5;
      const offsetY = randomSigned(seed, `grid-y-${index}`) * jitter * 0.5;
      sites.push({
        x: Math.min(0.999, Math.max(0.001, (col + 0.5 + offsetX) / columns)),
        y: Math.min(0.999, Math.max(0.001, (row + 0.5 + offsetY) / rows)),
      });
    }
    return orderSeeds(sites, columns);
  }
  const candidateCount = Math.max(96, count * 4);
  const insetScale = layout.jitter > 0 ? layout.jitter / 0.34 : 1;
  const insetX = (0.32 * insetScale) / columns;
  const insetY = (0.32 * insetScale) / rows;
  for (let index = 0; index < count; index += 1) {
    let bestX =
      insetX + randomUnit(seed, `phase-site-x-${index}-0`) * (1 - 2 * insetX);
    let bestY =
      insetY + randomUnit(seed, `phase-site-y-${index}-0`) * (1 - 2 * insetY);
    let bestDistance = -1;
    for (let candidate = 0; candidate < candidateCount; candidate += 1) {
      const x =
        insetX +
        randomUnit(seed, `phase-site-x-${index}-${candidate}`) *
          (1 - 2 * insetX);
      const y =
        insetY +
        randomUnit(seed, `phase-site-y-${index}-${candidate}`) *
          (1 - 2 * insetY);
      let nearestSquared = Infinity;
      for (const site of sites) {
        // Measure in piece units so non-square boards keep an isotropic
        // physical seed density. `stretch` deliberately breaks that isotropy:
        // weighting one axis harder pushes sites apart along it, which comes
        // out as columnar or banded pieces.
        const dx = ((x - site.x) * columns) / layout.stretch;
        const dy = (y - site.y) * rows * layout.stretch;
        nearestSquared = Math.min(nearestSquared, dx * dx + dy * dy);
      }
      if (sites.length === 0) {
        nearestSquared = randomUnit(seed, `phase-first-${candidate}`);
      }
      if (nearestSquared > bestDistance) {
        bestDistance = nearestSquared;
        bestX = x;
        bestY = y;
      }
    }
    sites.push({ x: bestX, y: bestY });
  }
  return orderSeeds(sites, columns);
}

/**
 * Stable spatial order keeps ids and persistence deterministic while the
 * sites themselves retain whatever distribution the layout produced.
 */
function orderSeeds(sites: LatticePoint[], columns: number): PhaseSeed[] {
  sites.sort((first, second) => first.y - second.y || first.x - second.x);
  return sites.map(({ x, y }, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    return {
      id: `biomorphic-${row}-${col}`,
      index,
      row,
      col,
      x,
      y,
    };
  });
}

/**
 * The paper's multiphase dendritic solidification. Each piece carries its
 * own phase field AND its own temperature field, initialized supercooled
 * inside itself and superheated outside, so every seam grows leaf-like
 * lobes symmetrically into both neighbors. Phases interact through the
 * Steinbach pairwise potential; temperature obeys diffusion plus latent
 * heat of that piece's own phase change.
 */
function simulatePhaseField(
  rows: number,
  columns: number,
  seed: string,
  profile: SimulationProfile,
  captureStages = false,
  numerics: BiomorphicPhaseFieldNumerics = BIOMORPHIC_PHASE_FIELD_NUMERICS,
  observer?: PhaseFieldObserver,
): PhaseFieldSimulation {
  const width = columns * numerics.samplesPerPiece;
  const height = rows * numerics.samplesPerPiece;
  const pixelCount = width * height;
  const seeds = createSeeds(rows, columns, seed, profile.seedLayout);
  const phaseCount = seeds.length;
  const invdx2 = 1 / (numerics.dx * numerics.dx);
  const dtOverTau = numerics.dt / numerics.tau;
  const epsilonSquared = profile.interfaceEpsilon * profile.interfaceEpsilon;

  const leftPixels = new Int32Array(pixelCount);
  const rightPixels = new Int32Array(pixelCount);
  const upPixels = new Int32Array(pixelCount);
  const downPixels = new Int32Array(pixelCount);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      leftPixels[pixel] = x > 0 ? pixel - 1 : pixel;
      rightPixels[pixel] = x + 1 < width ? pixel + 1 : pixel;
      upPixels[pixel] = y > 0 ? pixel - width : pixel;
      downPixels[pixel] = y + 1 < height ? pixel + width : pixel;
    }
  }

  // Free melt around the board: the border pieces have nothing to push against
  // there, so they grow outward into it and the puzzle's own outer edge ends up
  // grown rather than guillotined to a rectangle.
  const rimSamples = Math.round(
    (profile.freeRim ?? 0) * numerics.samplesPerPiece,
  );
  const isMeltRim = (x: number, y: number): boolean =>
    rimSamples > 0 &&
    (x < rimSamples ||
      y < rimSamples ||
      x >= width - rimSamples ||
      y >= height - rimSamples);

  // Piece regions: warped Voronoi stands in for the paper's dart-throwing
  // plus reaction-diffusion step, giving irregular, organically wobbling
  // cells rather than straight polygons.
  const voronoi = nearestSeedLabels(width, height, seeds);
  const WARP_COMPONENTS = profile.warpWavelengths.length;
  const warpVectors = new Float64Array(WARP_COMPONENTS * 2 * 4);
  for (let axis = 0; axis < 2; axis += 1) {
    for (let component = 0; component < WARP_COMPONENTS; component += 1) {
      const direction =
        randomUnit(seed, `warp-dir-${axis}-${component}`) * Math.PI * 2;
      const wavelength =
        profile.warpWavelengths[component] *
        (0.85 + randomUnit(seed, `warp-len-${axis}-${component}`) * 0.3);
      const frequency = (Math.PI * 2) / wavelength;
      const offset = axis * WARP_COMPONENTS * 4 + component * 4;
      warpVectors[offset] = Math.cos(direction) * frequency;
      warpVectors[offset + 1] = Math.sin(direction) * frequency;
      warpVectors[offset + 2] =
        randomUnit(seed, `warp-phase-${axis}-${component}`) * Math.PI * 2;
      warpVectors[offset + 3] = profile.warpAmplitudes[component];
    }

    // A coordinate warp is only a valid way to deform a tessellation while
    // it remains one-to-one. If its Jacobian can reverse sign, one Voronoi
    // cell is sampled in several remote places and begins the simulation as
    // droplets or as a ring. Bound the displacement gradient so I + grad(w)
    // cannot fold over itself. This preserves the organic wobble without
    // manufacturing topology the phase solver could never physically grow.
    let derivativeBound = 0;
    for (let component = 0; component < WARP_COMPONENTS; component += 1) {
      const offset = axis * WARP_COMPONENTS * 4 + component * 4;
      derivativeBound +=
        warpVectors[offset + 3] *
        (Math.abs(warpVectors[offset]) + Math.abs(warpVectors[offset + 1]));
    }
    const safeScale = derivativeBound > 0.55 ? 0.55 / derivativeBound : 1;
    if (safeScale < 1) {
      for (let component = 0; component < WARP_COMPONENTS; component += 1) {
        const offset = axis * WARP_COMPONENTS * 4 + component * 4;
        warpVectors[offset + 3] *= safeScale;
      }
    }
  }
  const warpedVoronoi = new Int16Array(pixelCount);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      let sampleX = x;
      let sampleY = y;
      for (let component = 0; component < WARP_COMPONENTS; component += 1) {
        const offsetX = component * 4;
        const offsetY = WARP_COMPONENTS * 4 + component * 4;
        sampleX +=
          warpVectors[offsetX + 3] *
          Math.sin(
            warpVectors[offsetX] * x +
              warpVectors[offsetX + 1] * y +
              warpVectors[offsetX + 2],
          );
        sampleY +=
          warpVectors[offsetY + 3] *
          Math.sin(
            warpVectors[offsetY] * x +
              warpVectors[offsetY + 1] * y +
              warpVectors[offsetY + 2],
          );
      }
      const clampedX = Math.max(0, Math.min(width - 1, Math.round(sampleX)));
      const clampedY = Math.max(0, Math.min(height - 1, Math.round(sampleY)));
      warpedVoronoi[rowOffset + x] = voronoi[clampedY * width + clampedX];
    }
  }

  // Perturb Edges: the paper adds two families of sinusoidal noise, one
  // gross (lambda1) and one fine (lambda2), along every boundary. The wave
  // displaces each seam along its normal as a function of arc length.
  const seamField = computeSeamField(warpedVoronoi, width, height);
  // Harmonics are spread geometrically from the gross wavelength down to the
  // fine one, so two of them reproduce the paper's pair exactly while more
  // fill the octaves between. Amplitude follows u1 * (lambda/lambda1)^falloff:
  // at falloff 1 the slope is the same at every scale, which is what a natural
  // self-affine edge looks like, and it also lands on the stock u2 when there
  // are two harmonics.
  const harmonicCount = Math.max(1, Math.round(profile.spectrumHarmonics ?? 2));
  const falloff = profile.spectrumFalloff ?? 1;
  const variation = profile.pieceVariation ?? 0;
  const baseWavelengths: number[] = [];
  const baseAmplitudes: number[] = [];
  for (let index = 0; index < harmonicCount; index += 1) {
    const t = harmonicCount === 1 ? 0 : index / (harmonicCount - 1);
    const wavelength =
      profile.lambda1 * Math.pow(profile.lambda2 / profile.lambda1, t);
    baseWavelengths.push(wavelength);
    baseAmplitudes.push(
      harmonicCount === 2 && falloff === 1 && index === 1
        ? profile.u2
        : profile.u1 * Math.pow(wavelength / profile.lambda1, falloff),
    );
  }
  const arcPhaseCache = new Map<number, Float64Array>();
  const arcWaveFor = (pair: number, arc: number): number => {
    let params = arcPhaseCache.get(pair);
    if (!params) {
      // Three numbers per harmonic: angular frequency, phase, amplitude. Every
      // seam draws its own, so no two edges are pressed from one template.
      params = new Float64Array(harmonicCount * 3);
      for (let index = 0; index < harmonicCount; index += 1) {
        // 0.1 is the stock +-10% wobble; full variation widens it to +-90%.
        const spread = Math.min(0.9, 0.1 + variation * 0.9);
        const wavelength =
          baseWavelengths[index] *
          (1 -
            spread +
            randomUnit(seed, `arc-len-${pair}-${index}`) * spread * 2);
        params[index * 3] = (Math.PI * 2) / Math.max(1e-6, wavelength);
        params[index * 3 + 1] =
          randomUnit(seed, `arc-phase-${pair}-${index}`) * Math.PI * 2;
        params[index * 3 + 2] =
          baseAmplitudes[index] *
          (1 -
            variation * 0.5 +
            randomUnit(seed, `arc-amp-${pair}-${index}`) * variation);
      }
      arcPhaseCache.set(pair, params);
    }
    let total = 0;
    for (let index = 0; index < harmonicCount; index += 1) {
      total +=
        params[index * 3 + 2] *
        Math.sin(params[index * 3] * arc + params[index * 3 + 1]);
    }
    return total;
  };

  const phis: Float32Array[] = [];
  const nextPhis: Float32Array[] = [];
  const temperatures: Float32Array[] = [];
  const nextTemperatures: Float32Array[] = [];
  const boxes = new Int32Array(phaseCount * 4);

  for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
    const phi = new Float32Array(pixelCount);
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;
    if (profile.nucleus) {
      // Coral mode: a small star-shaped nucleus at the piece's site. The
      // arms it grows are what carry the piece's mass out to its borders.
      const nucleusRadius = profile.nucleus.radius * numerics.samplesPerPiece;
      const centerX = seeds[phaseIndex].x * width;
      const centerY = seeds[phaseIndex].y * height;
      const phase1 = randomUnit(seed, `nucleus-a-${phaseIndex}`) * Math.PI * 2;
      const phase2 = randomUnit(seed, `nucleus-b-${phaseIndex}`) * Math.PI * 2;
      const reach =
        nucleusRadius *
          (1 + profile.nucleus.lobeAmplitude + profile.nucleus.lobeAmplitude2) +
        4;
      const loMinX = Math.max(0, Math.floor(centerX - reach));
      const loMaxX = Math.min(width - 1, Math.ceil(centerX + reach));
      const loMinY = Math.max(0, Math.floor(centerY - reach));
      const loMaxY = Math.min(height - 1, Math.ceil(centerY + reach));
      for (let y = loMinY; y <= loMaxY; y += 1) {
        const rowOffset = y * width;
        for (let x = loMinX; x <= loMaxX; x += 1) {
          const pixel = rowOffset + x;
          const dx = x + 0.5 - centerX;
          const dy = y + 0.5 - centerY;
          const distance = Math.hypot(dx, dy);
          const angle = Math.atan2(dy, dx);
          const rim =
            nucleusRadius *
            (1 +
              profile.nucleus.lobeAmplitude *
                Math.sin(profile.nucleus.lobes * angle + phase1) +
              profile.nucleus.lobeAmplitude2 *
                Math.sin(profile.nucleus.lobes2 * angle + phase2));
          const value = 0.5 * (1 + Math.tanh((rim - distance) / 2.2));
          if (value > numerics.activeThreshold) {
            phi[pixel] = value;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
    } else {
      for (let y = 0; y < height; y += 1) {
        const rowOffset = y * width;
        for (let x = 0; x < width; x += 1) {
          const pixel = rowOffset + x;
          const owner = warpedVoronoi[pixel];
          const low = seamField.pairLow[pixel];
          const high = seamField.pairHigh[pixel];
          const involved = low === phaseIndex || high === phaseIndex;
          let value = 0;
          if (involved && (owner === low || owner === high)) {
            const signed =
              owner === low
                ? seamField.distance[pixel]
                : -seamField.distance[pixel];
            const wave = arcWaveFor(
              seamField.pairKey[pixel],
              seamField.arcPosition[pixel],
            );
            value =
              phaseIndex === low
                ? 0.5 * (1 + Math.tanh((signed + wave) / 1.2))
                : 0.5 * (1 + Math.tanh((-signed - wave) / 1.2));
          } else if (owner === phaseIndex) {
            value = 1;
          }
          if (value > numerics.activeThreshold) {
            phi[pixel] = value;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
    }
    if (maxX < minX) {
      const centerX = Math.max(
        0,
        Math.min(width - 1, Math.round(seeds[phaseIndex].x * width)),
      );
      const centerY = Math.max(
        0,
        Math.min(height - 1, Math.round(seeds[phaseIndex].y * height)),
      );
      const pixel = centerY * width + centerX;
      phi[pixel] = 1;
      minX = centerX;
      maxX = centerX;
      minY = centerY;
      maxY = centerY;
    }
    phis.push(phi);
    nextPhis.push(new Float32Array(pixelCount));
    boxes[phaseIndex * 4] = Math.max(0, minX - numerics.boundingBoxMargin);
    boxes[phaseIndex * 4 + 1] = Math.min(
      width - 1,
      maxX + numerics.boundingBoxMargin,
    );
    boxes[phaseIndex * 4 + 2] = Math.max(0, minY - numerics.boundingBoxMargin);
    boxes[phaseIndex * 4 + 3] = Math.min(
      height - 1,
      maxY + numerics.boundingBoxMargin,
    );
  }

  if (rimSamples > 0) {
    for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
      const phi = phis[phaseIndex];
      for (let y = 0; y < height; y += 1) {
        const rowOffset = y * width;
        for (let x = 0; x < width; x += 1) {
          if (isMeltRim(x, y)) phi[rowOffset + x] = 0;
        }
      }
    }
  }

  if (!profile.nucleus) {
    // Normalize so the phases tile the board exactly (sum = 1 everywhere).
    // The melt rim is deliberately left at sum = 0: it is empty space, not an
    // unowned tile, and forcing it to sum to one would fill it back in.
    const sumPhi = new Float32Array(pixelCount);
    for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
      const phi = phis[phaseIndex];
      for (let pixel = 0; pixel < pixelCount; pixel += 1)
        sumPhi[pixel] += phi[pixel];
    }
    for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
      const phi = phis[phaseIndex];
      for (let pixel = 0; pixel < pixelCount; pixel += 1) {
        const x = pixel % width;
        const y = (pixel - x) / width;
        if (isMeltRim(x, y)) continue;
        if (sumPhi[pixel] > 0) phi[pixel] /= sumPhi[pixel];
        else if (warpedVoronoi[pixel] === phaseIndex) phi[pixel] = 1;
      }
    }
  }

  const projectConnectedTopology = createPhaseTopologyProjector(
    width,
    height,
    phaseCount,
    seeds,
  );
  projectConnectedTopology(phis, boxes, numerics.boundingBoxMargin);

  // A volume-preserving Allen-Cahn pressure can redistribute a piece's area
  // from its body into advancing branches instead of letting high-curvature
  // tips simply evaporate. A value of zero recovers the unconstrained model.
  const targetPhaseMass = new Float64Array(phaseCount);
  for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
    const phi = phis[phaseIndex];
    let mass = 0;
    for (let pixel = 0; pixel < pixelCount; pixel += 1) mass += phi[pixel];
    targetPhaseMass[phaseIndex] = mass;
  }

  const initialOwnerLabels = new Int16Array(pixelCount);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    let owner = 0;
    let strongest = -Infinity;
    for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
      const value = phis[phaseIndex][pixel];
      if (value > strongest) {
        strongest = value;
        owner = phaseIndex;
      }
    }
    // -1 marks melt. Every phase then reads it as "not mine", so the rim
    // initializes superheated for all of them and they all want to grow in.
    initialOwnerLabels[pixel] = strongest <= 0 ? -1 : owner;
  }
  const perturbedLabels = captureStages
    ? initialOwnerLabels.slice()
    : undefined;
  observer?.onFrame(0, initialOwnerLabels.slice());

  // Per-piece temperatures: supercooled where the piece is, superheated
  // where it is not — the paper's trick that makes both sides of every
  // seam grow into each other symmetrically.
  for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
    const phi = phis[phaseIndex];
    const temperature = new Float32Array(pixelCount);
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      // Initial temperature follows the already perturbed phase ownership,
      // matching the paper's ordering: Form Shapes -> Perturb Edges -> assign
      // phase and temperature -> Perform Simulation.
      temperature[pixel] =
        initialOwnerLabels[pixel] === phaseIndex
          ? -profile.supercooling
          : profile.supercooling;
    }
    temperatures.push(temperature);
    nextTemperatures.push(temperature.slice());
  }

  // Anisotropy scaffolding (coral mode): per-piece crystal orientation,
  // frozen tip noise, and scratch fields for epsilon(theta) terms.
  // Zero depth means the isotropic solver: skip the whole epsilon(theta) pass
  // rather than paying for a modulation that evaluates to a constant.
  const aniso =
    profile.anisotropy && profile.anisotropy.delta > 0
      ? profile.anisotropy
      : null;
  const aniA = aniso ? new Float32Array(pixelCount) : null;
  const aniBx = aniso ? new Float32Array(pixelCount) : null;
  const aniBy = aniso ? new Float32Array(pixelCount) : null;
  const cosSym = new Float64Array(phaseCount);
  const sinSym = new Float64Array(phaseCount);
  const tipNoise = profile.tipNoise ?? 0;
  const needsNoise = Boolean(aniso) || tipNoise > 0;
  const noiseField = needsNoise ? new Float32Array(pixelCount) : null;
  const noiseOffsets = new Int32Array(phaseCount);
  if (needsNoise && noiseField) {
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      noiseField[pixel] = randomSigned(seed, `chi-${pixel}`);
    }
    for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
      noiseOffsets[phaseIndex] =
        hashString(`${seed}:noise-offset-${phaseIndex}`) % pixelCount;
    }
  }
  // Each phase reads the disorder field through its own offset, so two
  // neighbours never get the same push at the same place.
  const noiseAt = (phaseIndex: number, pixel: number): number => {
    if (!noiseField || tipNoise <= 0) return 0;
    let sample = pixel + noiseOffsets[phaseIndex];
    if (sample >= pixelCount) sample -= pixelCount;
    return tipNoise * noiseField[sample];
  };
  if (aniso && noiseField) {
    for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
      const angle = randomUnit(seed, `grain-angle-${phaseIndex}`) * Math.PI * 2;
      cosSym[phaseIndex] = Math.cos(aniso.symmetry * angle);
      sinSym[phaseIndex] = Math.sin(aniso.symmetry * angle);
      noiseOffsets[phaseIndex] =
        hashString(`${seed}:noise-offset-${phaseIndex}`) % pixelCount;
    }
  }
  const inv2dx = 1 / (2 * numerics.dx);
  const bathCoupling = profile.bathCoupling ?? 0;

  // m(T) lookup: m = (alpha / pi) * atan(gamma * (T - Te)), Te = 0.
  const M_TABLE_SIZE = 4096;
  const mTable = new Float32Array(M_TABLE_SIZE);
  const mRange = profile.supercooling * 3;
  const mIndexScale = (M_TABLE_SIZE - 1) / (2 * mRange);
  for (let index = 0; index < M_TABLE_SIZE; index += 1) {
    const temperatureSample =
      -mRange + (2 * mRange * index) / (M_TABLE_SIZE - 1);
    mTable[index] =
      (profile.alpha / Math.PI) * Math.atan(profile.gamma * temperatureSample);
  }
  const mOf = (temperature: number): number => {
    let index = ((temperature + mRange) * mIndexScale) | 0;
    if (index < 0) index = 0;
    else if (index >= M_TABLE_SIZE) index = M_TABLE_SIZE - 1;
    return mTable[index];
  };

  const sumP = new Float32Array(pixelCount);
  const sumP2 = new Float32Array(pixelCount);
  const sumPM = new Float32Array(pixelCount);
  const nextSumP = new Float32Array(pixelCount);
  const areaBias = new Float32Array(phaseCount);
  const phaseMass = targetPhaseMass.slice();
  for (let iteration = 0; iteration < profile.iterations; iteration += 1) {
    const completedIterations = iteration + 1;
    sumP.fill(0);
    sumP2.fill(0);
    sumPM.fill(0);

    if (profile.areaConservation > 0) {
      for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
        const target = targetPhaseMass[phaseIndex];
        areaBias[phaseIndex] =
          target > 0
            ? profile.areaConservation *
              ((target - phaseMass[phaseIndex]) / target)
            : 0;
      }
    }

    for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
      const phi = phis[phaseIndex];
      const temperature = temperatures[phaseIndex];
      const minX = boxes[phaseIndex * 4];
      const maxX = boxes[phaseIndex * 4 + 1];
      const minY = boxes[phaseIndex * 4 + 2];
      const maxY = boxes[phaseIndex * 4 + 3];
      let mass = 0;
      for (let y = minY; y <= maxY; y += 1) {
        const rowOffset = y * width;
        for (let x = minX; x <= maxX; x += 1) {
          const pixel = rowOffset + x;
          const value = phi[pixel];
          if (value <= 0) continue;
          mass += value;
          sumP[pixel] += value;
          sumP2[pixel] += value * value;
          sumPM[pixel] +=
            value *
            (mOf(temperature[pixel]) +
              areaBias[phaseIndex] +
              noiseAt(phaseIndex, pixel));
        }
      }
      phaseMass[phaseIndex] = mass;
    }

    for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
      const phi = phis[phaseIndex];
      const nextPhi = nextPhis[phaseIndex];
      const temperature = temperatures[phaseIndex];
      const minX = boxes[phaseIndex * 4];
      const maxX = boxes[phaseIndex * 4 + 1];
      const minY = boxes[phaseIndex * 4 + 2];
      const maxY = boxes[phaseIndex * 4 + 3];
      let activeMinX = width;
      let activeMaxX = -1;
      let activeMinY = height;
      let activeMaxY = -1;

      if (aniso && aniA && aniBx && aniBy) {
        // Kobayashi's anisotropic surface energy: epsilon depends on the
        // interface normal's angle relative to the grain's orientation.
        const rotCos = cosSym[phaseIndex];
        const rotSin = sinSym[phaseIndex];
        const passMinX = Math.max(0, minX - 1);
        const passMaxX = Math.min(width - 1, maxX + 1);
        const passMinY = Math.max(0, minY - 1);
        const passMaxY = Math.min(height - 1, maxY + 1);
        for (let y = passMinY; y <= passMaxY; y += 1) {
          const rowOffset = y * width;
          for (let x = passMinX; x <= passMaxX; x += 1) {
            const pixel = rowOffset + x;
            const gradX =
              (phi[rightPixels[pixel]] - phi[leftPixels[pixel]]) * inv2dx;
            const gradY =
              (phi[downPixels[pixel]] - phi[upPixels[pixel]]) * inv2dx;
            const gradSquared = gradX * gradX + gradY * gradY;
            if (gradSquared < 1e-12) {
              aniA[pixel] = epsilonSquared;
              aniBx[pixel] = 0;
              aniBy[pixel] = 0;
              continue;
            }
            const invNorm = 1 / Math.sqrt(gradSquared);
            const unitCos = gradX * invNorm;
            const unitSin = gradY * invNorm;
            const cos2 = unitCos * unitCos - unitSin * unitSin;
            const sin2 = 2 * unitCos * unitSin;
            let cosJ = cos2 * cos2 - sin2 * sin2;
            let sinJ = 2 * cos2 * sin2;
            if (aniso.symmetry === 6) {
              const cos6 = cosJ * cos2 - sinJ * sin2;
              const sin6 = sinJ * cos2 + cosJ * sin2;
              cosJ = cos6;
              sinJ = sin6;
            }
            const cosRel = cosJ * rotCos + sinJ * rotSin;
            const sinRel = sinJ * rotCos - cosJ * rotSin;
            const epsilon =
              profile.interfaceEpsilon * (1 + aniso.delta * cosRel);
            const epsilonPrime =
              -profile.interfaceEpsilon * aniso.delta * aniso.symmetry * sinRel;
            aniA[pixel] = epsilon * epsilon;
            aniBx[pixel] = epsilon * epsilonPrime * gradX;
            aniBy[pixel] = epsilon * epsilonPrime * gradY;
          }
        }
      }

      for (let y = minY; y <= maxY; y += 1) {
        const rowOffset = y * width;
        for (let x = minX; x <= maxX; x += 1) {
          const pixel = rowOffset + x;
          const value = phi[pixel];
          const laplacian =
            (phi[leftPixels[pixel]] +
              phi[rightPixels[pixel]] +
              phi[upPixels[pixel]] +
              phi[downPixels[pixel]] -
              4 * value) *
            invdx2;
          let next = value;
          if (value > 0 || laplacian !== 0) {
            // Steinbach's pairwise potential folded into shared sums. Our
            // temperature convention is cold inside a phase and hot outside
            // it. The anti-symmetric contrast m(T_i) - m(T_j) therefore makes
            // i advance into j exactly where j advances into i on the other
            // side. Using the arithmetic mean here cancels complementary
            // fields and leaves only curvature-driven edge cleanup.
            const mi =
              mOf(temperature[pixel]) +
              areaBias[phaseIndex] +
              noiseAt(phaseIndex, pixel);
            const othersP = sumP[pixel] - value;
            const othersP2 = sumP2[pixel] - value * value;
            const othersPM = sumPM[pixel] - value * mi;
            const potentialContribution = value * (value * othersP - othersP2);
            const thermalContribution = value * 0.5 * (mi * othersP - othersPM);
            let pairwise = potentialContribution + thermalContribution;
            const liquidHere = 1 - sumP[pixel];
            if (liquidHere > 0.0001) {
              // Growth into open melt: the residual space acts as an
              // implicit liquid phase, recovering the classic Kobayashi
              // solid-liquid front so nuclei can actually spread. Frozen
              // noise on m seeds the tip-splitting instability.
              // mi already carries the frozen tip disorder.
              pairwise += value * liquidHere * (value - liquidHere + mi);
            }
            let diffusion: number;
            if (aniso && aniA && aniBx && aniBy) {
              const left = leftPixels[pixel];
              const right = rightPixels[pixel];
              const up = upPixels[pixel];
              const down = downPixels[pixel];
              const gradX = (phi[right] - phi[left]) * inv2dx;
              const gradY = (phi[down] - phi[up]) * inv2dx;
              diffusion =
                aniA[pixel] * laplacian +
                (aniA[right] - aniA[left]) * inv2dx * gradX +
                (aniA[down] - aniA[up]) * inv2dx * gradY +
                (aniBx[down] - aniBx[up]) * inv2dx -
                (aniBy[right] - aniBy[left]) * inv2dx;
            } else {
              diffusion = epsilonSquared * laplacian;
            }
            next = value + dtOverTau * (diffusion + pairwise);
            if (next < 0) next = 0;
            else if (next > 1) next = 1;
            else if (next < 0.001 && sumP[pixel] - value >= 0.9) {
              // Trace residue stranded inside another piece: melt it so
              // dead tails cannot keep the bounding boxes inflated.
              next = 0;
            }
          }
          nextPhi[pixel] = next;
          if (
            (next > numerics.activeThreshold && next < 0.999) ||
            next !== value
          ) {
            if (x < activeMinX) activeMinX = x;
            if (x > activeMaxX) activeMaxX = x;
            if (y < activeMinY) activeMinY = y;
            if (y > activeMaxY) activeMaxY = y;
          }
        }
      }

      if (activeMaxX >= activeMinX) {
        // Boxes may only grow: a temporarily quiet seam segment must not be
        // dropped from the solve, or it freezes with its raw perturbation.
        boxes[phaseIndex * 4] = Math.min(
          boxes[phaseIndex * 4],
          Math.max(0, activeMinX - numerics.boundingBoxMargin),
        );
        boxes[phaseIndex * 4 + 1] = Math.max(
          boxes[phaseIndex * 4 + 1],
          Math.min(width - 1, activeMaxX + numerics.boundingBoxMargin),
        );
        boxes[phaseIndex * 4 + 2] = Math.min(
          boxes[phaseIndex * 4 + 2],
          Math.max(0, activeMinY - numerics.boundingBoxMargin),
        );
        boxes[phaseIndex * 4 + 3] = Math.max(
          boxes[phaseIndex * 4 + 3],
          Math.min(height - 1, activeMaxY + numerics.boundingBoxMargin),
        );
      }
    }

    // Steinbach's multiphase field is constrained by sum_i(p_i) = 1.
    // Evolving every field independently and only choosing the largest one
    // afterwards lets the phase mass collapse into artificial "liquid". Do
    // the projection before latent heat is computed so enthalpy sees the
    // actual, constrained phase change.
    nextSumP.fill(0);
    for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
      const nextPhi = nextPhis[phaseIndex];
      const minX = boxes[phaseIndex * 4];
      const maxX = boxes[phaseIndex * 4 + 1];
      const minY = boxes[phaseIndex * 4 + 2];
      const maxY = boxes[phaseIndex * 4 + 3];
      for (let y = minY; y <= maxY; y += 1) {
        const rowOffset = y * width;
        for (let x = minX; x <= maxX; x += 1) {
          const pixel = rowOffset + x;
          nextSumP[pixel] += nextPhi[pixel];
        }
      }
    }
    for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
      const nextPhi = nextPhis[phaseIndex];
      const minX = boxes[phaseIndex * 4];
      const maxX = boxes[phaseIndex * 4 + 1];
      const minY = boxes[phaseIndex * 4 + 2];
      const maxY = boxes[phaseIndex * 4 + 3];
      for (let y = minY; y <= maxY; y += 1) {
        const rowOffset = y * width;
        for (let x = minX; x <= maxX; x += 1) {
          const pixel = rowOffset + x;
          const total = nextSumP[pixel];
          if (rimSamples > 0) {
            // With free melt on the board the constraint is sum <= 1, not
            // sum == 1: dividing everywhere would refill the melt the instant
            // any phase leaked a trace into it.
            if (total > 1) nextPhi[pixel] /= total;
          } else if (total > 1e-12) {
            nextPhi[pixel] /= total;
          } else {
            nextPhi[pixel] = initialOwnerLabels[pixel] === phaseIndex ? 1 : 0;
          }
        }
      }
    }

    if (
      completedIterations % numerics.topologyProjectionEvery === 0 ||
      completedIterations === profile.iterations
    ) {
      projectConnectedTopology(nextPhis, boxes, numerics.boundingBoxMargin);
    }

    for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
      const phi = phis[phaseIndex];
      const nextPhi = nextPhis[phaseIndex];
      const temperature = temperatures[phaseIndex];
      const nextTemperature = nextTemperatures[phaseIndex];
      const minX = boxes[phaseIndex * 4];
      const maxX = boxes[phaseIndex * 4 + 1];
      const minY = boxes[phaseIndex * 4 + 2];
      const maxY = boxes[phaseIndex * 4 + 3];

      // Heat diffuses substantially farther than the phase interface. This
      // separation of scales provides the local amplification / lateral
      // inhibition responsible for dendrite tip splitting.
      const thermalMinX = Math.max(0, minX - numerics.thermalBoxMargin);
      const thermalMaxX = Math.min(width - 1, maxX + numerics.thermalBoxMargin);
      const thermalMinY = Math.max(0, minY - numerics.thermalBoxMargin);
      const thermalMaxY = Math.min(
        height - 1,
        maxY + numerics.thermalBoxMargin,
      );
      for (let y = thermalMinY; y <= thermalMaxY; y += 1) {
        const rowOffset = y * width;
        for (let x = thermalMinX; x <= thermalMaxX; x += 1) {
          const pixel = rowOffset + x;
          // The board rim diffuses like everywhere else. The neighbour tables
          // already fold back on themselves at the edge, which is the zero-flux
          // condition an insulated board wants. Freezing a two-pixel rim instead
          // pinned it at its initial +-T0 forever, so every non-owner phase saw
          // a permanent maximum growth force along the whole perimeter --
          // invisible over a few hundred steps, fatal to the border pieces over
          // tens of thousands.
          const laplacian =
            (temperature[leftPixels[pixel]] +
              temperature[rightPixels[pixel]] +
              temperature[upPixels[pixel]] +
              temperature[downPixels[pixel]] -
              4 * temperature[pixel]) *
            invdx2;
          let relax = 0;
          if (bathCoupling > 0) {
            // The bath follows the CURRENT front, not the starting cell: this
            // phase is supercooled wherever it now is and superheated wherever
            // it is not. Anchoring it to initialOwnerLabels instead would keep
            // regenerating the driving force at the original Voronoi boundary,
            // pinning the seam there -- it would feed the fringe while
            // forbidding the outline to evolve. phi is a smooth 0..1 indicator
            // of "where this phase is", so it doubles as the bath profile.
            const bath = profile.supercooling * (1 - 2 * nextPhi[pixel]);
            relax = bathCoupling * (bath - temperature[pixel]);
          }
          nextTemperature[pixel] =
            temperature[pixel] +
            numerics.dt * (laplacian + relax) +
            // Latent heat must OPPOSE the growth that released it. m(T) rises
            // with temperature, so a phase advances into the hot surroundings;
            // subtracting K*dp there lowers m at the tip and, once the heat
            // diffuses sideways, at its neighbours too. That is the paper's
            // figure 2 loop: local amplification with lateral inhibition, which
            // is what makes a whole boundary sprout an even fringe. Adding the
            // term instead turns the loop positive and the pieces grow
            // winner-take-all -- one runaway lobe beside a stunted one.
            -profile.latentHeat * (nextPhi[pixel] - phi[pixel]);
        }
      }

      phis[phaseIndex] = nextPhi;
      nextPhis[phaseIndex] = phi;
      temperatures[phaseIndex] = nextTemperature;
      nextTemperatures[phaseIndex] = temperature;
    }

    if (
      observer &&
      (completedIterations % observer.captureEvery === 0 ||
        completedIterations === profile.iterations)
    ) {
      observer.onFrame(
        completedIterations,
        phaseFieldsToLabels(phis, width, height),
      );
    }
  }

  const labels = new Int16Array(pixelCount);
  labels.fill(-1);
  const bestPhi = new Float32Array(pixelCount);
  for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
    const phi = phis[phaseIndex];
    const minX = boxes[phaseIndex * 4];
    const maxX = boxes[phaseIndex * 4 + 1];
    const minY = boxes[phaseIndex * 4 + 2];
    const maxY = boxes[phaseIndex * 4 + 3];
    for (let y = minY; y <= maxY; y += 1) {
      const rowOffset = y * width;
      for (let x = minX; x <= maxX; x += 1) {
        const pixel = rowOffset + x;
        const value = phi[pixel];
        if (value > bestPhi[pixel]) {
          bestPhi[pixel] = value;
          if (value >= 0.2) labels[pixel] = phaseIndex;
        }
      }
    }
  }

  let liquid = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (labels[pixel] < 0) liquid += 1;
  }
  const liquidRatio = liquid / pixelCount;
  const rawLabels = captureStages ? labels.slice() : undefined;
  if (liquid > 0) {
    if (rimSamples > 0) {
      // Melt still connected to the board edge is the grown outer contour and
      // must survive. Melt sealed off inside the tiling is a hole, and gets
      // handed to the nearest front exactly as before.
      const outside = floodOuterMelt(labels, width, height);
      const trapped = labels.slice();
      for (let pixel = 0; pixel < pixelCount; pixel += 1) {
        if (labels[pixel] < 0 && outside[pixel] === 1) trapped[pixel] = 0;
      }
      assignLiquidToNearestFront(trapped, width, height);
      for (let pixel = 0; pixel < pixelCount; pixel += 1) {
        if (labels[pixel] < 0 && outside[pixel] !== 1) labels[pixel] = trapped[pixel];
      }
    } else {
      assignLiquidToNearestFront(labels, width, height);
    }
  }

  if (profile.nucleus && profile.polishIterations) {
    // Anneal: re-tile from the grown labels and relax the seams with the
    // same solver, isotropic and undriven — pure interface tension.
    for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
      const phi = phis[phaseIndex];
      phi.fill(0);
      nextPhis[phaseIndex].fill(0);
      let minX = width;
      let maxX = -1;
      let minY = height;
      let maxY = -1;
      for (let pixel = 0; pixel < pixelCount; pixel += 1) {
        if (labels[pixel] !== phaseIndex) continue;
        phi[pixel] = 1;
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (maxX < minX) {
        minX = 0;
        maxX = 0;
        minY = 0;
        maxY = 0;
      }
      boxes[phaseIndex * 4] = Math.max(0, minX - numerics.boundingBoxMargin);
      boxes[phaseIndex * 4 + 1] = Math.min(
        width - 1,
        maxX + numerics.boundingBoxMargin,
      );
      boxes[phaseIndex * 4 + 2] = Math.max(
        0,
        minY - numerics.boundingBoxMargin,
      );
      boxes[phaseIndex * 4 + 3] = Math.min(
        height - 1,
        maxY + numerics.boundingBoxMargin,
      );
    }

    for (
      let iteration = 0;
      iteration < profile.polishIterations;
      iteration += 1
    ) {
      sumP.fill(0);
      sumP2.fill(0);
      for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
        const phi = phis[phaseIndex];
        const minX = boxes[phaseIndex * 4];
        const maxX = boxes[phaseIndex * 4 + 1];
        const minY = boxes[phaseIndex * 4 + 2];
        const maxY = boxes[phaseIndex * 4 + 3];
        for (let y = minY; y <= maxY; y += 1) {
          const rowOffset = y * width;
          for (let x = minX; x <= maxX; x += 1) {
            const pixel = rowOffset + x;
            const value = phi[pixel];
            if (value <= 0) continue;
            sumP[pixel] += value;
            sumP2[pixel] += value * value;
          }
        }
      }
      for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
        const phi = phis[phaseIndex];
        const nextPhi = nextPhis[phaseIndex];
        const minX = boxes[phaseIndex * 4];
        const maxX = boxes[phaseIndex * 4 + 1];
        const minY = boxes[phaseIndex * 4 + 2];
        const maxY = boxes[phaseIndex * 4 + 3];
        let activeMinX = width;
        let activeMaxX = -1;
        let activeMinY = height;
        let activeMaxY = -1;
        for (let y = minY; y <= maxY; y += 1) {
          const rowOffset = y * width;
          for (let x = minX; x <= maxX; x += 1) {
            const pixel = rowOffset + x;
            const value = phi[pixel];
            const laplacian =
              (phi[leftPixels[pixel]] +
                phi[rightPixels[pixel]] +
                phi[upPixels[pixel]] +
                phi[downPixels[pixel]] -
                4 * value) *
              invdx2;
            let next = value;
            if (value > 0 || laplacian !== 0) {
              const othersP = sumP[pixel] - value;
              const othersP2 = sumP2[pixel] - value * value;
              const pairwise = value * (value * othersP - othersP2);
              const liquidHere = 1 - sumP[pixel];
              const solo =
                liquidHere > 0.0001
                  ? value * liquidHere * (value - liquidHere)
                  : 0;
              next =
                value +
                dtOverTau * (epsilonSquared * laplacian + pairwise + solo);
              if (next < 0) next = 0;
              else if (next > 1) next = 1;
              else if (next < 0.001 && sumP[pixel] - value >= 0.9) {
                next = 0;
              }
            }
            nextPhi[pixel] = next;
            if (
              (next > numerics.activeThreshold && next < 0.999) ||
              next !== value
            ) {
              if (x < activeMinX) activeMinX = x;
              if (x > activeMaxX) activeMaxX = x;
              if (y < activeMinY) activeMinY = y;
              if (y > activeMaxY) activeMaxY = y;
            }
          }
        }
        phis[phaseIndex] = nextPhi;
        nextPhis[phaseIndex] = phi;
        if (activeMaxX >= activeMinX) {
          boxes[phaseIndex * 4] = Math.min(
            boxes[phaseIndex * 4],
            Math.max(0, activeMinX - numerics.boundingBoxMargin),
          );
          boxes[phaseIndex * 4 + 1] = Math.max(
            boxes[phaseIndex * 4 + 1],
            Math.min(width - 1, activeMaxX + numerics.boundingBoxMargin),
          );
          boxes[phaseIndex * 4 + 2] = Math.min(
            boxes[phaseIndex * 4 + 2],
            Math.max(0, activeMinY - numerics.boundingBoxMargin),
          );
          boxes[phaseIndex * 4 + 3] = Math.max(
            boxes[phaseIndex * 4 + 3],
            Math.min(height - 1, activeMaxY + numerics.boundingBoxMargin),
          );
        }
      }
    }

    labels.fill(-1);
    bestPhi.fill(0);
    for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
      const phi = phis[phaseIndex];
      for (let pixel = 0; pixel < pixelCount; pixel += 1) {
        const value = phi[pixel];
        if (value > bestPhi[pixel]) {
          bestPhi[pixel] = value;
          if (value >= 0.2) labels[pixel] = phaseIndex;
        }
      }
    }
    let polishLiquid = 0;
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      if (labels[pixel] < 0) polishLiquid += 1;
    }
    if (polishLiquid > 0) assignLiquidToNearestFront(labels, width, height);
  }

  const voronoiLabels = captureStages ? voronoi : undefined;
  const unrepairedLabels = captureStages ? labels.slice() : undefined;
  labels.set(
    assignConnectedPhaseLabels(
      phis,
      width,
      height,
      seeds,
      numerics.connectivityRadius,
    ),
  );

  // Round off anything too thin to survive the plywood. This has to come after
  // assignConnectedPhaseLabels, which rebuilds the ownership map from the phase
  // fields and discards whatever the labels held before it -- every earlier
  // attempt at this pass ran above that line and was silently thrown away.
  const neckRadius = Math.round(
    ((profile.minNeck ?? 0) * numerics.samplesPerPiece) / 2,
  );
  if (neckRadius >= 1) {
    const neckSeedPixels = seeds.map((phaseSeed) => {
      const x = Math.max(
        0,
        Math.min(width - 1, Math.round(phaseSeed.x * width)),
      );
      const y = Math.max(
        0,
        Math.min(height - 1, Math.round(phaseSeed.y * height)),
      );
      return y * width + x;
    });
    roundPartition(labels, width, height, neckRadius, neckSeedPixels);
    repairPartitionConnectivity(labels, width, height, neckSeedPixels);
  }

  return {
    width,
    height,
    labels,
    seeds,
    liquidRatio,
    voronoiLabels,
    perturbedLabels,
    unrepairedLabels,
    rawLabels,
  };
}

/**
 * Converts overlapping simulated phase fields into a connected partition.
 *
 * A plain arg-max can award a high-valued island to a phase even when the
 * simulation has pinched off its neck. This maximum-bottleneck watershed
 * starts at each piece seed and expands through the strongest continuous
 * phase path. Every awarded sample therefore has an actual same-piece path
 * back to its seed; no hand-authored geometry or post-hoc lobe template is
 * introduced.
 */
function assignConnectedPhaseLabels(
  phis: readonly Float32Array[],
  width: number,
  height: number,
  seeds: readonly PhaseSeed[],
  connectivityRadius: number,
): Int16Array {
  const pixelCount = width * height;
  const labels = new Int16Array(pixelCount);
  labels.fill(-1);
  const heapPixels: number[] = [];
  const heapLabels: number[] = [];
  const heapPriorities: number[] = [];
  const connectedStrength = (label: number, pixel: number): number => {
    const centerX = pixel % width;
    const centerY = Math.floor(pixel / width);
    let strongest = phis[label][pixel];
    for (let dy = -connectivityRadius; dy <= connectivityRadius; dy += 1) {
      const y = centerY + dy;
      if (y < 0 || y >= height) continue;
      const extent = Math.floor(
        Math.sqrt(connectivityRadius * connectivityRadius - dy * dy),
      );
      for (let dx = -extent; dx <= extent; dx += 1) {
        const x = centerX + dx;
        if (x < 0 || x >= width) continue;
        const value = phis[label][y * width + x];
        if (value > strongest) strongest = value;
      }
    }
    return strongest;
  };

  const higherPriority = (first: number, second: number): boolean => {
    const priorityDifference = heapPriorities[first] - heapPriorities[second];
    if (Math.abs(priorityDifference) > 1e-12) return priorityDifference > 0;
    if (heapLabels[first] !== heapLabels[second]) {
      return heapLabels[first] < heapLabels[second];
    }
    return heapPixels[first] < heapPixels[second];
  };

  const swapHeap = (first: number, second: number): void => {
    [heapPixels[first], heapPixels[second]] = [
      heapPixels[second],
      heapPixels[first],
    ];
    [heapLabels[first], heapLabels[second]] = [
      heapLabels[second],
      heapLabels[first],
    ];
    [heapPriorities[first], heapPriorities[second]] = [
      heapPriorities[second],
      heapPriorities[first],
    ];
  };

  const push = (pixel: number, label: number, priority: number): void => {
    let index = heapPixels.length;
    heapPixels.push(pixel);
    heapLabels.push(label);
    heapPriorities.push(priority);
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!higherPriority(index, parent)) break;
      swapHeap(index, parent);
      index = parent;
    }
  };

  const pop = (): [number, number, number] => {
    const pixel = heapPixels[0];
    const label = heapLabels[0];
    const priority = heapPriorities[0];
    const lastPixel = heapPixels.pop()!;
    const lastLabel = heapLabels.pop()!;
    const lastPriority = heapPriorities.pop()!;
    if (heapPixels.length > 0) {
      heapPixels[0] = lastPixel;
      heapLabels[0] = lastLabel;
      heapPriorities[0] = lastPriority;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let best = index;
        if (left < heapPixels.length && higherPriority(left, best)) best = left;
        if (right < heapPixels.length && higherPriority(right, best))
          best = right;
        if (best === index) break;
        swapHeap(index, best);
        index = best;
      }
    }
    return [pixel, label, priority];
  };

  const pushNeighbors = (
    pixel: number,
    label: number,
    pathPriority: number,
  ): void => {
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const neighbors = [
      x > 0 ? pixel - 1 : -1,
      x + 1 < width ? pixel + 1 : -1,
      y > 0 ? pixel - width : -1,
      y + 1 < height ? pixel + width : -1,
    ];
    for (const neighbor of neighbors) {
      if (neighbor < 0 || labels[neighbor] >= 0) continue;
      push(
        neighbor,
        label,
        Math.min(pathPriority, connectedStrength(label, neighbor)),
      );
    }
  };

  seeds.forEach((seed, label) => {
    const x = Math.max(0, Math.min(width - 1, Math.round(seed.x * width)));
    const y = Math.max(0, Math.min(height - 1, Math.round(seed.y * height)));
    const pixel = y * width + x;
    if (labels[pixel] >= 0) {
      throw new Error("Biomorphic phase-field seeds collapsed onto one sample");
    }
    labels[pixel] = label;
  });
  seeds.forEach((seed, label) => {
    const x = Math.max(0, Math.min(width - 1, Math.round(seed.x * width)));
    const y = Math.max(0, Math.min(height - 1, Math.round(seed.y * height)));
    pushNeighbors(y * width + x, label, 1);
  });

  while (heapPixels.length > 0) {
    const [pixel, label, priority] = pop();
    if (labels[pixel] >= 0) continue;
    labels[pixel] = label;
    pushNeighbors(pixel, label, priority);
  }

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (labels[pixel] < 0) {
      throw new Error(
        "Connected phase-field watershed left an unassigned sample",
      );
    }
  }
  return labels;
}

/**
 * Freezes the residual melt onto the nearest solidified front (multi-source
 * BFS watershed). Fronts advance one sample per step in scan order, so the
 * fill is deterministic and preserves the interlocked arm geometry.
 */
function assignLiquidToNearestFront(
  labels: Int16Array,
  width: number,
  height: number,
): void {
  const pixelCount = width * height;
  const queue = new Int32Array(pixelCount);
  let queueLength = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (labels[pixel] >= 0) {
      queue[queueLength] = pixel;
      queueLength += 1;
    }
  }
  if (queueLength === 0) {
    throw new Error("Biomorphic phase-field simulation grew no solid at all");
  }

  for (let cursor = 0; cursor < queueLength; cursor += 1) {
    const pixel = queue[cursor];
    const label = labels[pixel];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const neighbors = [
      x > 0 ? pixel - 1 : -1,
      x + 1 < width ? pixel + 1 : -1,
      y > 0 ? pixel - width : -1,
      y + 1 < height ? pixel + width : -1,
    ];
    for (let side = 0; side < 4; side += 1) {
      const neighbor = neighbors[side];
      if (neighbor >= 0 && labels[neighbor] < 0) {
        labels[neighbor] = label;
        queue[queueLength] = neighbor;
        queueLength += 1;
      }
    }
  }
}

type SeamField = {
  /** BFS distance to the nearest internal seam, in samples. */
  distance: Int16Array;
  /** Arc-length position along that seam, in samples. */
  arcPosition: Float32Array;
  /** Encoded owner pair of that seam; -1 where no seam exists. */
  pairKey: Int32Array;
  /** Lower owner id of that seam pair (or -2 for the board frame). */
  pairLow: Int16Array;
  /** Higher owner id of that seam pair (or -2 for the board frame). */
  pairHigh: Int16Array;
};

/**
 * Parameterizes every internal seam by arc length (the paper's Perturb
 * Edges step displaces boundaries along their normal as a function of arc
 * position). Each pixel learns which seam is nearest, how far along that
 * seam its foot point sits, and which owner is the "low" side, so a
 * displacement wave can be applied antisymmetrically to the two sides.
 */
function seedKeyFor(pair: number, fragment: number): string {
  return `seam-${pair}-${fragment}`;
}

function computeSeamField(
  labels: Int16Array,
  width: number,
  height: number,
): SeamField {
  const pixelCount = width * height;
  const distance = new Int16Array(pixelCount);
  distance.fill(-1);
  const arcPosition = new Float32Array(pixelCount);
  const pairKey = new Int32Array(pixelCount);
  pairKey.fill(-1);
  const pairLow = new Int16Array(pixelCount);
  pairLow.fill(-2);
  const pairHigh = new Int16Array(pixelCount);
  pairHigh.fill(-2);
  const queue = new Int32Array(pixelCount);
  let queueLength = 0;

  // Boundary pixels grouped by owner pair.
  const groups = new Map<number, number[]>();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const label = labels[pixel];
      let neighborLabel = label;
      if (x > 0 && labels[pixel - 1] !== label)
        neighborLabel = labels[pixel - 1];
      else if (x + 1 < width && labels[pixel + 1] !== label)
        neighborLabel = labels[pixel + 1];
      else if (y > 0 && labels[pixel - width] !== label)
        neighborLabel = labels[pixel - width];
      else if (y + 1 < height && labels[pixel + width] !== label)
        neighborLabel = labels[pixel + width];
      if (neighborLabel === label) continue;
      const low = Math.min(label, neighborLabel);
      const high = Math.max(label, neighborLabel);
      const key = (low + 1) * 32768 + (high + 1);
      const group = groups.get(key);
      if (group) group.push(pixel);
      else groups.set(key, [pixel]);
    }
  }

  // Arc positions: BFS along each seam's own pixels, started from an
  // endpoint (a seam pixel with the fewest seam neighbors).
  const inGroup = new Set<number>();
  groups.forEach((group, key) => {
    inGroup.clear();
    group.forEach((pixel) => inGroup.add(pixel));
    const neighborCounts = group.map((pixel) => {
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          if (inGroup.has(ny * width + nx)) count += 1;
        }
      }
      return count;
    });
    const low = Math.floor(key / 32768) - 1;
    const high = (key % 32768) - 1;
    const visited = new Set<number>();
    // A pair's seam may consist of several disconnected fragments (split by
    // junctions); every fragment must get its own arc parameterization or
    // its displacement wave degenerates to a constant.
    while (visited.size < group.length) {
      let start = -1;
      let best = Infinity;
      group.forEach((pixel, index) => {
        if (visited.has(pixel)) return;
        if (
          neighborCounts[index] < best ||
          (neighborCounts[index] === best && (start < 0 || pixel < start))
        ) {
          best = neighborCounts[index];
          start = pixel;
        }
      });
      if (start < 0) break;
      const chainQueue: number[] = [start];
      visited.add(start);
      distance[start] = 0;
      arcPosition[start] =
        randomUnit(seedKeyFor(key, visited.size), "arc-origin") * 40;
      pairKey[start] = key;
      pairLow[start] = low;
      pairHigh[start] = high;
      queue[queueLength] = start;
      queueLength += 1;
      for (let cursor = 0; cursor < chainQueue.length; cursor += 1) {
        const pixel = chainQueue[cursor];
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            const neighbor = ny * width + nx;
            if (!inGroup.has(neighbor) || visited.has(neighbor)) continue;
            visited.add(neighbor);
            chainQueue.push(neighbor);
            distance[neighbor] = 0;
            arcPosition[neighbor] =
              arcPosition[pixel] + (dx !== 0 && dy !== 0 ? 1.41421356 : 1);
            pairKey[neighbor] = key;
            pairLow[neighbor] = low;
            pairHigh[neighbor] = high;
            queue[queueLength] = neighbor;
            queueLength += 1;
          }
        }
      }
    }
  });

  for (let cursor = 0; cursor < queueLength; cursor += 1) {
    const pixel = queue[cursor];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const nextDistance = distance[pixel] + 1;
    const neighbors = [
      x > 0 ? pixel - 1 : -1,
      x + 1 < width ? pixel + 1 : -1,
      y > 0 ? pixel - width : -1,
      y + 1 < height ? pixel + width : -1,
    ];
    for (let side = 0; side < 4; side += 1) {
      const neighbor = neighbors[side];
      if (neighbor >= 0 && distance[neighbor] < 0) {
        distance[neighbor] = nextDistance;
        arcPosition[neighbor] = arcPosition[pixel];
        pairKey[neighbor] = pairKey[pixel];
        pairLow[neighbor] = pairLow[pixel];
        pairHigh[neighbor] = pairHigh[pixel];
        queue[queueLength] = neighbor;
        queueLength += 1;
      }
    }
  }

  return { distance, arcPosition, pairKey, pairLow, pairHigh };
}

/**
 * BFS distance from each sample to the nearest internal region boundary.
 * The board edge is not a boundary: cells must stay flush with the frame.
 */
function distanceToOwnBoundary(
  labels: Int16Array,
  width: number,
  height: number,
): Int16Array {
  const pixelCount = width * height;
  const distances = new Int16Array(pixelCount);
  distances.fill(-1);
  const queue = new Int32Array(pixelCount);
  let queueLength = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const label = labels[pixel];
      const isBoundary =
        (x > 0 && labels[pixel - 1] !== label) ||
        (x + 1 < width && labels[pixel + 1] !== label) ||
        (y > 0 && labels[pixel - width] !== label) ||
        (y + 1 < height && labels[pixel + width] !== label);
      if (isBoundary) {
        distances[pixel] = 0;
        queue[queueLength] = pixel;
        queueLength += 1;
      }
    }
  }

  for (let cursor = 0; cursor < queueLength; cursor += 1) {
    const pixel = queue[cursor];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const nextDistance = distances[pixel] + 1;
    const neighbors = [
      x > 0 ? pixel - 1 : -1,
      x + 1 < width ? pixel + 1 : -1,
      y > 0 ? pixel - width : -1,
      y + 1 < height ? pixel + width : -1,
    ];
    for (let side = 0; side < 4; side += 1) {
      const neighbor = neighbors[side];
      if (neighbor >= 0 && distances[neighbor] < 0) {
        distances[neighbor] = nextDistance;
        queue[queueLength] = neighbor;
        queueLength += 1;
      }
    }
  }
  return distances;
}

function nearestSeedLabels(
  width: number,
  height: number,
  seeds: readonly PhaseSeed[],
): Int16Array {
  const labels = new Int16Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const normalizedY = (y + 0.5) / height;
    for (let x = 0; x < width; x += 1) {
      const normalizedX = (x + 0.5) / width;
      let winner = 0;
      let best = Infinity;
      seeds.forEach((phaseSeed, phaseIndex) => {
        const dx = normalizedX - phaseSeed.x;
        const dy = normalizedY - phaseSeed.y;
        const distance = dx * dx + dy * dy;
        if (distance < best) {
          best = distance;
          winner = phaseIndex;
        }
      });
      labels[y * width + x] = winner;
    }
  }
  return labels;
}

function countChangedLabels(first: Int16Array, second: Int16Array): number {
  let changed = 0;
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) changed += 1;
  }
  return changed;
}

function countInternalBoundaryUnits(
  labels: Int16Array,
  width: number,
  height: number,
): number {
  let total = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (x + 1 < width && labels[pixel] !== labels[pixel + 1]) total += 1;
      if (y + 1 < height && labels[pixel] !== labels[pixel + width]) total += 1;
    }
  }
  return total;
}

function measureGrowthPenetration(
  before: Int16Array,
  after: Int16Array,
  width: number,
  height: number,
): { maximum: number; deepRatio: number } {
  const pixelCount = width * height;
  const distances = new Int16Array(pixelCount);
  distances.fill(-1);
  const queue = new Int32Array(pixelCount);
  let queueLength = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const label = before[pixel];
      const isBoundary =
        (x > 0 && before[pixel - 1] !== label) ||
        (x + 1 < width && before[pixel + 1] !== label) ||
        (y > 0 && before[pixel - width] !== label) ||
        (y + 1 < height && before[pixel + width] !== label);
      if (isBoundary) {
        distances[pixel] = 0;
        queue[queueLength] = pixel;
        queueLength += 1;
      }
    }
  }

  for (let cursor = 0; cursor < queueLength; cursor += 1) {
    const pixel = queue[cursor];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const nextDistance = distances[pixel] + 1;
    const neighbors = [
      x > 0 ? pixel - 1 : -1,
      x + 1 < width ? pixel + 1 : -1,
      y > 0 ? pixel - width : -1,
      y + 1 < height ? pixel + width : -1,
    ];
    neighbors.forEach((neighbor) => {
      if (neighbor >= 0 && distances[neighbor] < 0) {
        distances[neighbor] = nextDistance;
        queue[queueLength] = neighbor;
        queueLength += 1;
      }
    });
  }

  let changed = 0;
  let deep = 0;
  let maximum = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    if (before[pixel] === after[pixel]) continue;
    changed += 1;
    maximum = Math.max(maximum, distances[pixel]);
    if (distances[pixel] >= 3) deep += 1;
  }
  return { maximum, deepRatio: changed === 0 ? 0 : deep / changed };
}

function latticePointKey(point: LatticePoint): string {
  return `${point.x},${point.y}`;
}

function boundaryRecordKey(start: LatticePoint, end: LatticePoint): string {
  const first = latticePointKey(start);
  const second = latticePointKey(end);
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

function sameLatticePoint(first: LatticePoint, second: LatticePoint): boolean {
  return first.x === second.x && first.y === second.y;
}

function addBoundaryUnit(
  owner: number,
  start: LatticePoint,
  end: LatticePoint,
  orientedByOwner: OrientedBoundaryUnit[][],
  records: Map<string, BoundaryRecord>,
): void {
  const key = boundaryRecordKey(start, end);
  const firstKey = latticePointKey(start);
  const secondKey = latticePointKey(end);
  const record = records.get(key) ?? {
    key,
    start: firstKey < secondKey ? start : end,
    end: firstKey < secondKey ? end : start,
    owners: new Set<number>(),
  };
  record.owners.add(owner);
  records.set(key, record);
  orientedByOwner[owner].push({ recordKey: key, start, end });
}

function collectBoundaries(
  labels: Int16Array,
  width: number,
  height: number,
  phaseCount: number,
): {
  orientedByOwner: OrientedBoundaryUnit[][];
  records: Map<string, BoundaryRecord>;
} {
  const orientedByOwner = Array.from(
    { length: phaseCount },
    () => [] as OrientedBoundaryUnit[],
  );
  const records = new Map<string, BoundaryRecord>();

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const owner = labels[pixel];
      if (y === 0 || labels[pixel - width] !== owner) {
        addBoundaryUnit(
          owner,
          { x, y },
          { x: x + 1, y },
          orientedByOwner,
          records,
        );
      }
      if (x === width - 1 || labels[pixel + 1] !== owner) {
        addBoundaryUnit(
          owner,
          { x: x + 1, y },
          { x: x + 1, y: y + 1 },
          orientedByOwner,
          records,
        );
      }
      if (y === height - 1 || labels[pixel + width] !== owner) {
        addBoundaryUnit(
          owner,
          { x: x + 1, y: y + 1 },
          { x, y: y + 1 },
          orientedByOwner,
          records,
        );
      }
      if (x === 0 || labels[pixel - 1] !== owner) {
        addBoundaryUnit(
          owner,
          { x, y: y + 1 },
          { x, y },
          orientedByOwner,
          records,
        );
      }
    }
  }

  return { orientedByOwner, records };
}

function exteriorSide(
  record: BoundaryRecord,
  width: number,
  height: number,
): string | null {
  if (record.start.y === 0 && record.end.y === 0) return "top";
  if (record.start.x === width && record.end.x === width) return "right";
  if (record.start.y === height && record.end.y === height) return "bottom";
  if (record.start.x === 0 && record.end.x === 0) return "left";
  return null;
}

function ownerPairKey(
  record: BoundaryRecord,
  width: number,
  height: number,
): string {
  const owners = [...record.owners].sort((first, second) => first - second);
  if (owners.length === 2) return `shared-${owners[0]}-${owners[1]}`;
  if (owners.length !== 1) {
    throw new Error(`Invalid phase-field seam ownership for ${record.key}`);
  }
  const side = exteriorSide(record, width, height);
  if (!side)
    throw new Error(`Open phase-field seam inside the board at ${record.key}`);
  return `exterior-${owners[0]}-${side}`;
}

function connectedRecordComponents(
  recordKeys: readonly string[],
  records: ReadonlyMap<string, BoundaryRecord>,
): string[][] {
  const byPoint = new Map<string, string[]>();
  recordKeys.forEach((recordKey) => {
    const record = records.get(recordKey)!;
    [record.start, record.end].forEach((point) => {
      const key = latticePointKey(point);
      byPoint.set(key, [...(byPoint.get(key) ?? []), recordKey]);
    });
  });
  const remaining = new Set(recordKeys);
  const components: string[][] = [];

  while (remaining.size > 0) {
    const first = [...remaining].sort()[0];
    const component: string[] = [];
    const queue = [first];
    remaining.delete(first);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const recordKey = queue[cursor];
      component.push(recordKey);
      const record = records.get(recordKey)!;
      [record.start, record.end].forEach((point) => {
        (byPoint.get(latticePointKey(point)) ?? []).forEach((neighborKey) => {
          if (remaining.delete(neighborKey)) queue.push(neighborKey);
        });
      });
    }
    components.push(component);
  }
  return components;
}

function traceRecordChain(
  recordKeys: readonly string[],
  records: ReadonlyMap<string, BoundaryRecord>,
): { points: LatticePoint[]; orderedRecordKeys: string[] } {
  const byPoint = new Map<string, string[]>();
  recordKeys.forEach((recordKey) => {
    const record = records.get(recordKey)!;
    [record.start, record.end].forEach((point) => {
      const key = latticePointKey(point);
      byPoint.set(key, [...(byPoint.get(key) ?? []), recordKey]);
    });
  });
  const branching = [...byPoint.values()].some(
    (incident) => incident.length > 2,
  );
  if (branching)
    throw new Error("A phase-field seam branched between the same owners");
  const endpoints = [...byPoint.entries()]
    .filter(([, incident]) => incident.length === 1)
    .map(([key]) => key)
    .sort();
  if (endpoints.length !== 2) {
    throw new Error("A phase-field seam formed a closed loop");
  }

  let currentKey = endpoints[0];
  const used = new Set<string>();
  const points: LatticePoint[] = [];
  const orderedRecordKeys: string[] = [];
  while (used.size < recordKeys.length) {
    const candidate = (byPoint.get(currentKey) ?? [])
      .filter((recordKey) => !used.has(recordKey))
      .sort()[0];
    if (!candidate)
      throw new Error("Unable to trace a complete phase-field seam");
    const record = records.get(candidate)!;
    const current =
      record.start.x + "," + record.start.y === currentKey
        ? record.start
        : record.end;
    const next = sameLatticePoint(current, record.start)
      ? record.end
      : record.start;
    if (points.length === 0) points.push(current);
    points.push(next);
    orderedRecordKeys.push(candidate);
    used.add(candidate);
    currentKey = latticePointKey(next);
  }
  return { points, orderedRecordKeys };
}

function pointLineDistance(
  point: LatticePoint,
  start: LatticePoint,
  end: LatticePoint,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0)
    return Math.hypot(point.x - start.x, point.y - start.y);
  const progress = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  );
  return Math.hypot(
    point.x - (start.x + dx * progress),
    point.y - (start.y + dy * progress),
  );
}

function simplifyPolyline(
  points: readonly LatticePoint[],
  tolerance: number,
): LatticePoint[] {
  if (points.length <= 2) return [...points];
  let maximumDistance = 0;
  let splitIndex = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = pointLineDistance(
      points[index],
      points[0],
      points[points.length - 1],
    );
    if (distance > maximumDistance) {
      maximumDistance = distance;
      splitIndex = index;
    }
  }
  if (maximumDistance <= tolerance)
    return [points[0], points[points.length - 1]];
  const left = simplifyPolyline(points.slice(0, splitIndex + 1), tolerance);
  const right = simplifyPolyline(points.slice(splitIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}

function chaikin(points: readonly LatticePoint[]): LatticePoint[] {
  if (points.length <= 2) return [...points];
  const result: LatticePoint[] = [points[0]];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    result.push(
      { x: start.x * 0.75 + end.x * 0.25, y: start.y * 0.75 + end.y * 0.25 },
      { x: start.x * 0.25 + end.x * 0.75, y: start.y * 0.25 + end.y * 0.75 },
    );
  }
  result.push(points[points.length - 1]);
  return result;
}

function normalizedPoint(
  point: LatticePoint,
  width: number,
  height: number,
): BiomorphicPoint {
  return { x: point.x / width, y: point.y / height };
}

function smoothSegments(
  rawPoints: readonly LatticePoint[],
  width: number,
  height: number,
  exterior: boolean,
  smoothingPasses: number,
): BiomorphicPathSegment[] {
  if (exterior) {
    return [
      {
        kind: "line",
        start: normalizedPoint(rawPoints[0], width, height),
        end: normalizedPoint(rawPoints[rawPoints.length - 1], width, height),
      },
    ];
  }
  let points = simplifyPolyline(rawPoints, 1.1);
  for (let pass = 0; pass < smoothingPasses; pass += 1)
    points = chaikin(points);
  points = simplifyPolyline(points, 0.5);
  const normalized = points.map((point) =>
    normalizedPoint(point, width, height),
  );

  return normalized.slice(0, -1).map((start, index) => {
    const end = normalized[index + 1];
    const previous = normalized[Math.max(0, index - 1)];
    const next = normalized[Math.min(normalized.length - 1, index + 2)];
    const tension = smoothingPasses === 0 ? 0 : 0.52;
    return {
      kind: "cubic" as const,
      start,
      control1: {
        x: Math.max(
          0,
          Math.min(1, start.x + ((end.x - previous.x) * tension) / 6),
        ),
        y: Math.max(
          0,
          Math.min(1, start.y + ((end.y - previous.y) * tension) / 6),
        ),
      },
      control2: {
        x: Math.max(0, Math.min(1, end.x - ((next.x - start.x) * tension) / 6)),
        y: Math.max(0, Math.min(1, end.y - ((next.y - start.y) * tension) / 6)),
      },
      end,
    };
  });
}

function buildExtractedEdges(
  records: ReadonlyMap<string, BoundaryRecord>,
  seeds: readonly PhaseSeed[],
  width: number,
  height: number,
  smoothingPasses: number,
): { edges: ExtractedEdge[]; byRecord: Map<string, ExtractedEdge> } {
  const grouped = new Map<string, string[]>();
  records.forEach((record) => {
    const key = ownerPairKey(record, width, height);
    grouped.set(key, [...(grouped.get(key) ?? []), record.key]);
  });
  const edges: ExtractedEdge[] = [];
  const byRecord = new Map<string, ExtractedEdge>();

  [...grouped.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .forEach(([pairKey, recordKeys]) => {
      connectedRecordComponents(recordKeys, records).forEach(
        (component, componentIndex) => {
          const { points, orderedRecordKeys } = traceRecordChain(
            component,
            records,
          );
          const firstRecord = records.get(orderedRecordKeys[0])!;
          const owners = [...firstRecord.owners].sort(
            (first, second) => first - second,
          );
          const exterior = owners.length === 1;
          const edge: BiomorphicEdge = {
            id: `${pairKey}-${componentIndex}`,
            exterior,
            ownerIds: owners.map((owner) => seeds[owner].id),
            segments: smoothSegments(
              points,
              width,
              height,
              exterior,
              smoothingPasses,
            ),
          };
          const recordDirections = new Map<
            string,
            { start: LatticePoint; end: LatticePoint }
          >();
          orderedRecordKeys.forEach((recordKey, index) => {
            recordDirections.set(recordKey, {
              start: points[index],
              end: points[index + 1],
            });
          });
          const extracted = { edge, recordDirections };
          edges.push(extracted);
          orderedRecordKeys.forEach((recordKey) =>
            byRecord.set(recordKey, extracted),
          );
        },
      );
    });

  return { edges, byRecord };
}

function directionIndex(start: LatticePoint, end: LatticePoint): number {
  if (end.x > start.x) return 0;
  if (end.y > start.y) return 1;
  if (end.x < start.x) return 2;
  return 3;
}

function traceOwnerLoop(
  units: readonly OrientedBoundaryUnit[],
): OrientedBoundaryUnit[] {
  const byStart = new Map<string, OrientedBoundaryUnit[]>();
  units.forEach((unit) => {
    const key = latticePointKey(unit.start);
    byStart.set(key, [...(byStart.get(key) ?? []), unit]);
  });
  const start = [...units].sort((first, second) =>
    latticePointKey(first.start).localeCompare(latticePointKey(second.start)),
  )[0];
  const result: OrientedBoundaryUnit[] = [];
  const used = new Set<string>();
  let current = start;

  while (result.length < units.length) {
    const directedKey = `${current.recordKey}:${latticePointKey(current.start)}`;
    if (used.has(directedKey)) break;
    used.add(directedKey);
    result.push(current);
    const candidates = (byStart.get(latticePointKey(current.end)) ?? []).filter(
      (candidate) =>
        !used.has(`${candidate.recordKey}:${latticePointKey(candidate.start)}`),
    );
    if (candidates.length === 0) break;
    const incoming = directionIndex(current.start, current.end);
    current = [...candidates].sort((first, second) => {
      const firstTurn =
        (directionIndex(first.start, first.end) - incoming + 4) % 4;
      const secondTurn =
        (directionIndex(second.start, second.end) - incoming + 4) % 4;
      const priority = (turn: number): number => [1, 0, 3, 2].indexOf(turn);
      return priority(firstTurn) - priority(secondTurn);
    })[0];
  }

  if (
    result.length !== units.length ||
    !sameLatticePoint(result[result.length - 1].end, result[0].start)
  ) {
    throw new Error(
      "A biomorphic phase did not extract to one connected outline",
    );
  }
  return result;
}

function buildCells(
  orientedByOwner: readonly OrientedBoundaryUnit[][],
  byRecord: ReadonlyMap<string, ExtractedEdge>,
  seeds: readonly PhaseSeed[],
): BiomorphicCell[] {
  return seeds.map((phaseSeed) => {
    let loop = traceOwnerLoop(orientedByOwner[phaseSeed.index]);
    const edgeAt = (unit: OrientedBoundaryUnit): BiomorphicEdge => {
      const extracted = byRecord.get(unit.recordKey);
      if (!extracted)
        throw new Error(`Missing extracted edge for ${unit.recordKey}`);
      return extracted.edge;
    };
    const rotation = loop.findIndex(
      (unit, index) =>
        edgeAt(unit) !== edgeAt(loop[(index - 1 + loop.length) % loop.length]),
    );
    if (rotation > 0)
      loop = [...loop.slice(rotation), ...loop.slice(0, rotation)];
    const traversals: BiomorphicCell["edgeTraversals"][number][] = [];

    loop.forEach((unit, index) => {
      const extracted = byRecord.get(unit.recordKey)!;
      if (index > 0 && edgeAt(loop[index - 1]) === extracted.edge) return;
      const canonical = extracted.recordDirections.get(unit.recordKey)!;
      const direction =
        sameLatticePoint(unit.start, canonical.start) &&
        sameLatticePoint(unit.end, canonical.end)
          ? (1 as const)
          : (-1 as const);
      traversals.push({ edge: extracted.edge, direction });
    });
    const neighborIds = [
      ...new Set(
        traversals
          .flatMap(({ edge }) => edge.ownerIds)
          .filter((ownerId) => ownerId !== phaseSeed.id),
      ),
    ].sort((first, second) => {
      const firstIndex = seeds.findIndex(({ id }) => id === first);
      const secondIndex = seeds.findIndex(({ id }) => id === second);
      return firstIndex - secondIndex;
    });
    const vertices = traversals.map(({ edge, direction }) => {
      const segment =
        direction === 1
          ? edge.segments[0]
          : edge.segments[edge.segments.length - 1];
      return direction === 1 ? segment.start : segment.end;
    });

    return {
      id: phaseSeed.id,
      index: phaseSeed.index,
      row: phaseSeed.row,
      col: phaseSeed.col,
      site: { x: phaseSeed.x, y: phaseSeed.y },
      vertices,
      edgeTraversals: traversals,
      neighborIds,
    };
  });
}

function extractTopology(
  rows: number,
  columns: number,
  simulation: PhaseFieldSimulation,
  smoothingPasses: number,
): BiomorphicTopology {
  const { orientedByOwner, records } = collectBoundaries(
    simulation.labels,
    simulation.width,
    simulation.height,
    simulation.seeds.length,
  );
  const extracted = buildExtractedEdges(
    records,
    simulation.seeds,
    simulation.width,
    simulation.height,
    smoothingPasses,
  );
  return {
    rows,
    columns,
    cells: buildCells(orientedByOwner, extracted.byRecord, simulation.seeds),
    edges: extracted.edges.map(({ edge }) => edge),
  };
}

/** Differential diagnostics of the simulated growth against plain Voronoi. */
export function measureBiomorphicPhaseFieldGrowth(
  rows: number,
  columns: number,
  seed: string,
  style: BiomorphicPhaseFieldStyle = "dendrite",
): BiomorphicPhaseFieldDiagnostics {
  assertDimensions(rows, columns);
  const simulation = simulatePhaseField(
    rows,
    columns,
    seed,
    SIMULATION_PROFILES[style],
    true,
  );
  const voronoi = simulation.voronoiLabels;
  const perturbed = simulation.perturbedLabels;
  const unrepaired = simulation.unrepairedLabels;
  if (!voronoi || !perturbed || !unrepaired) {
    throw new Error("Biomorphic phase-field diagnostics were not captured");
  }
  const sampleCount = simulation.width * simulation.height;
  const penetration = measureGrowthPenetration(
    voronoi,
    unrepaired,
    simulation.width,
    simulation.height,
  );
  const simulationPenetration = measureGrowthPenetration(
    perturbed,
    unrepaired,
    simulation.width,
    simulation.height,
  );
  const perturbedBoundary = countInternalBoundaryUnits(
    perturbed,
    simulation.width,
    simulation.height,
  );
  let safeAfterSimulation = false;
  for (const smoothingPasses of [1, 0, 2]) {
    try {
      if (
        isBiomorphicTopologySafe(
          extractTopology(rows, columns, simulation, smoothingPasses),
        )
      ) {
        safeAfterSimulation = true;
        break;
      }
    } catch {
      // A diagnostic must report safety without changing the retry behavior.
    }
  }
  return {
    changedLabelRatio: countChangedLabels(voronoi, unrepaired) / sampleCount,
    cleanupChangedLabelRatio:
      countChangedLabels(unrepaired, simulation.labels) / sampleCount,
    boundaryAmplification:
      countInternalBoundaryUnits(
        unrepaired,
        simulation.width,
        simulation.height,
      ) /
      Math.max(
        1,
        countInternalBoundaryUnits(
          voronoi,
          simulation.width,
          simulation.height,
        ),
      ),
    simulationChangedLabelRatio:
      countChangedLabels(perturbed, unrepaired) / sampleCount,
    simulationBoundaryAmplification:
      countInternalBoundaryUnits(
        unrepaired,
        simulation.width,
        simulation.height,
      ) / Math.max(1, perturbedBoundary),
    simulationMaximumPenetrationSamples: simulationPenetration.maximum,
    maximumPenetrationSamples: penetration.maximum,
    deepGrowthRatio: penetration.deepRatio,
    liquidRatio: simulation.liquidRatio,
    safeAfterSimulation,
  };
}

/**
 * Runs a deterministic multiphase solidification simulation and vectorizes
 * its shared interfaces. Smoothing may retry, but the physical simulation
 * profile never silently falls back to a less detailed cut.
 */
export function createBiomorphicPhaseFieldTopology(
  rows: number,
  columns: number,
  seed: string,
  style: BiomorphicPhaseFieldStyle = "dendrite",
): BiomorphicTopology {
  assertDimensions(rows, columns);
  const simulation = simulatePhaseField(
    rows,
    columns,
    seed,
    SIMULATION_PROFILES[style],
  );
  let lastError: unknown;
  for (const smoothingPasses of [1, 0, 2]) {
    try {
      const topology = extractTopology(
        rows,
        columns,
        simulation,
        smoothingPasses,
      );
      if (isBiomorphicTopologySafe(topology)) return topology;
    } catch (error) {
      lastError = error;
    }
  }

  const detail = lastError instanceof Error ? `: ${lastError.message}` : "";
  throw new Error(`Unable to generate a safe phase-field puzzle${detail}`);
}

/**
 * Runs the real cutter engine at editor-selected settings and captures its
 * ownership field over time. This is intentionally synchronous and
 * deterministic: the web lab schedules it off the button event so the UI can
 * paint its busy state, while production baking can call it directly.
 */
export function runBiomorphicPhaseFieldLab(
  input: BiomorphicPhaseFieldLabSettings,
): BiomorphicPhaseFieldLabResult {
  const settings = parsePhaseFieldLabSettings(input);
  const frames: BiomorphicPhaseFieldLabFrame[] = [];
  let initialLabels: Int16Array | undefined;
  const width = settings.columns * settings.numerics.samplesPerPiece;
  const height = settings.rows * settings.numerics.samplesPerPiece;
  const startedAt = Date.now();
  const simulation = simulatePhaseField(
    settings.rows,
    settings.columns,
    settings.seed,
    settings.profile,
    false,
    settings.numerics,
    {
      captureEvery: settings.captureEvery,
      onFrame: (iteration, labels) => {
        initialLabels ??= labels.slice();
        const penetration = measureGrowthPenetration(
          initialLabels,
          labels,
          width,
          height,
        );
        frames.push({
          iteration,
          svg: labelsToBoundarySvg(labels, width, height),
          componentCounts: countLabelComponents(
            labels,
            width,
            height,
            settings.rows * settings.columns,
          ),
          holeCounts: countLabelHoles(
            labels,
            width,
            height,
            settings.rows * settings.columns,
          ),
          boundaryUnits: countInternalBoundaryUnits(labels, width, height),
          changedFromInitialRatio:
            countChangedLabels(initialLabels, labels) / labels.length,
          maximumPenetrationFromInitial: penetration.maximum,
        });
      },
    },
  );
  const thickness = measureCutThickness(
    simulation.labels,
    simulation.width,
    simulation.height,
    settings.rows * settings.columns,
    Math.max(2, Math.round(settings.numerics.samplesPerPiece * 0.12)),
  );
  let vectorizationError: string | undefined;
  let finalSvg: string;
  try {
    finalSvg = topologyToBoundarySvg(
      extractTopology(
        settings.rows,
        settings.columns,
        simulation,
        settings.numerics.smoothingPasses,
      ),
    );
  } catch (error) {
    vectorizationError =
      error instanceof Error ? error.message : "Vector extraction failed";
    // Keep the raw ownership field visible for diagnosis, but report this
    // downgrade explicitly to the lab UI rather than silently claiming a
    // production-ready SVG.
    finalSvg = labelsToBoundarySvg(
      simulation.labels,
      simulation.width,
      simulation.height,
    );
  }
  const finalFrame: BiomorphicPhaseFieldLabFrame = {
    iteration: settings.profile.iterations,
    svg: finalSvg,
    componentCounts: countLabelComponents(
      simulation.labels,
      simulation.width,
      simulation.height,
      settings.rows * settings.columns,
    ),
    holeCounts: countLabelHoles(
      simulation.labels,
      simulation.width,
      simulation.height,
      settings.rows * settings.columns,
    ),
    boundaryUnits: countInternalBoundaryUnits(
      simulation.labels,
      simulation.width,
      simulation.height,
    ),
    changedFromInitialRatio: initialLabels
      ? countChangedLabels(initialLabels, simulation.labels) /
        simulation.labels.length
      : 0,
    maximumPenetrationFromInitial: initialLabels
      ? measureGrowthPenetration(
          initialLabels,
          simulation.labels,
          simulation.width,
          simulation.height,
        ).maximum
      : 0,
  };
  if (
    frames.length > 0 &&
    frames[frames.length - 1].iteration === finalFrame.iteration
  ) {
    frames[frames.length - 1] = finalFrame;
  } else {
    frames.push(finalFrame);
  }
  return {
    settings,
    frames,
    finalSvg,
    elapsedMs: Date.now() - startedAt,
    liquidRatio: simulation.liquidRatio,
    thinnest: { ...thickness, fraction: thickness.narrowestSamples / settings.numerics.samplesPerPiece },
    vectorizationError,
  };
}

export function generateBiomorphicPhaseFieldPieces(
  rows: number,
  columns: number,
  boardWidth: number,
  boardHeight: number,
  seed: string,
  style: BiomorphicPhaseFieldStyle = "dendrite",
): PuzzlePieceDefinition[] {
  const topology = createBiomorphicPhaseFieldTopology(
    rows,
    columns,
    seed,
    style,
  );
  return generateBiomorphicPiecesFromTopology(
    topology,
    boardWidth,
    boardHeight,
  );
}
