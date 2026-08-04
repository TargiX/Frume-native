/**
 * How thin the cut gets, measured on the sample lattice rather than on the
 * extracted curve.
 *
 * Connectivity and hole counts both pass on a piece that carries a hair: it is
 * still one simply connected region, it is just about to snap out of the
 * plywood. Two shapes of defect matter, and both reduce to the same question --
 * how far can the piece be eroded before it stops being the piece:
 *
 *  - an isthmus, where eroding by r splits the piece in two;
 *  - an appendage, where eroding and dilating back loses a chunk entirely.
 *
 * The answer is reported as a width in samples, so `2 * r` for the smallest r
 * that triggers either. An earlier attempt measured this on the smoothed vector
 * outline instead and spent three rounds reporting the geometry of triple
 * junctions, where a piece's outline legitimately doubles back on itself. The
 * lattice has no such trap: a junction is not thin, it is a corner.
 */

export type CutThickness = {
  /** Narrowest isthmus or appendage over all pieces, in samples. */
  narrowestSamples: number;
  /** Index of the piece carrying it, or -1 when nothing was found. */
  piece: number;
  /** What was found: a piece splitting in two, or a chunk falling off. */
  kind: "isthmus" | "appendage" | "none";
};

function erodeOnce(
  source: Uint8Array,
  target: Uint8Array,
  width: number,
  height: number,
): void {
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      const pixel = rowOffset + x;
      // Off the board counts as solid: a piece resting against the board edge
      // is not thin there, it is simply cut off by the frame.
      target[pixel] =
        source[pixel] &&
        (x === 0 || source[pixel - 1]) &&
        (x + 1 === width || source[pixel + 1]) &&
        (y === 0 || source[pixel - width]) &&
        (y + 1 === height || source[pixel + width])
          ? 1
          : 0;
    }
  }
}

function dilateOnce(
  source: Uint8Array,
  target: Uint8Array,
  width: number,
  height: number,
): void {
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      const pixel = rowOffset + x;
      target[pixel] =
        source[pixel] ||
        (x > 0 && source[pixel - 1]) ||
        (x + 1 < width && source[pixel + 1]) ||
        (y > 0 && source[pixel - width]) ||
        (y + 1 < height && source[pixel + width])
          ? 1
          : 0;
    }
  }
}

type Component = { area: number; longSide: number; shortSide: number };

/** The 4-connected components of a mask with their bounding boxes. */
function components(
  mask: Uint8Array,
  width: number,
  height: number,
): Component[] {
  const seen = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const found: Component[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    seen[start] = 1;
    queue[0] = start;
    let length = 1;
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;
    for (let cursor = 0; cursor < length; cursor += 1) {
      const pixel = queue[cursor];
      const x = pixel % width;
      const y = (pixel - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
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
    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    found.push({
      area: length,
      longSide: Math.max(boxWidth, boxHeight),
      shortSide: Math.min(boxWidth, boxHeight),
    });
  }
  return found.sort((first, second) => second.area - first.area);
}

export function measureCutThickness(
  labels: Int16Array,
  width: number,
  height: number,
  phaseCount: number,
  maxRadius = 12,
): CutThickness {
  const pixelCount = width * height;
  const mask = new Uint8Array(pixelCount);
  const scratch = new Uint8Array(pixelCount);
  const eroded = new Uint8Array(pixelCount);
  const opened = new Uint8Array(pixelCount);
  const lost = new Uint8Array(pixelCount);
  let best = Number.POSITIVE_INFINITY;
  let bestPiece = -1;
  let bestKind: CutThickness["kind"] = "none";

  for (let phaseIndex = 0; phaseIndex < phaseCount; phaseIndex += 1) {
    let area = 0;
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const owned = labels[pixel] === phaseIndex ? 1 : 0;
      mask[pixel] = owned;
      area += owned;
    }
    if (area === 0) continue;

    eroded.set(mask);
    for (let radius = 1; radius <= maxRadius; radius += 1) {
      const width2 = 2 * radius;
      if (width2 >= best) break;

      erodeOnce(eroded, scratch, width, height);
      eroded.set(scratch);

      const remaining = components(eroded, width, height);
      if (remaining.length !== 1) {
        // Zero components means the whole piece is thinner than this; two or
        // more means it pinched apart. Either way the narrowest part is 2r.
        best = width2;
        bestPiece = phaseIndex;
        bestKind = "isthmus";
        break;
      }

      // Dilate the survivor back and see what never came home. Any sharp corner
      // also fails to come home -- a 45 degree tip cannot hold the diamond used
      // to erode it -- so size alone cannot tell a whisker from a taper. Shape
      // can: measured on known figures, a corner's leftover is always about
      // twice as long as it is wide and grows with the radius, while a whisker
      // is many times longer than it is wide and does not change with it.
      opened.set(eroded);
      for (let step = 0; step < radius; step += 1) {
        dilateOnce(opened, scratch, width, height);
        opened.set(scratch);
      }
      let lostAny = false;
      for (let pixel = 0; pixel < pixelCount; pixel += 1) {
        const missing = mask[pixel] && !opened[pixel] ? 1 : 0;
        lost[pixel] = missing;
        if (missing) lostAny = true;
      }
      if (!lostAny) continue;
      const lostParts = components(lost, width, height);
      const whisker = lostParts.find(
        (part) =>
          part.area >= 4 * radius &&
          part.longSide >= 4 * radius &&
          part.longSide >= 3 * Math.max(1, part.shortSide),
      );
      if (whisker) {
        best = width2;
        bestPiece = phaseIndex;
        bestKind = "appendage";
        break;
      }
    }
  }

  return Number.isFinite(best)
    ? { narrowestSamples: best, piece: bestPiece, kind: bestKind }
    : { narrowestSamples: 2 * maxRadius, piece: -1, kind: "none" };
}
