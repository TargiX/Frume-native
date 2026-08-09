import { getCutter } from '../../../puzzle/cutters';
import type { PuzzleCutterId } from '../../../puzzle/types';

/**
 * A real cut, small enough to be an icon.
 *
 * The previews used to be hand-drawn impressions of each style, and they were
 * wrong in the way a sketch of a signature is wrong: close enough to recognise,
 * never the actual shape. Every cut can produce its smallest grid cheaply —
 * the procedural ones solve in milliseconds, and the simulated ones are read
 * from the baked library rather than solved — so the picker can show the seams
 * the player will actually get.
 */
export const PREVIEW_WIDTH = 64;
export const PREVIEW_HEIGHT = 50;

/**
 * Inset so the outer edge of the sample is not shaved off by the frame. The
 * cut is generated at the smaller size and then sits centred in the icon.
 */
const PREVIEW_MARGIN = 3;

const PREVIEW_IMAGE = {
  uri: 'preview://cut-sample',
  width: PREVIEW_WIDTH,
  height: PREVIEW_HEIGHT,
};

export type CutPreviewSample = {
  paths: readonly string[];
  /** Maps the sample into the icon: apply the translation, then the scale. */
  transform: { translateX: number; translateY: number; scale: number };
};

/**
 * How much of the icon the middle piece fills. A whole 3x3 grid shrinks a
 * fine-toothed cut into scribble; framing the middle piece instead shows the
 * teeth at a size where the styles are actually told apart, while its
 * neighbours still show how the seams meet.
 */
const FOCUS_FILL = 0.72;

const cache = new Map<PuzzleCutterId, CutPreviewSample>();
const pending = new Map<PuzzleCutterId, Promise<CutPreviewSample>>();

async function buildSample(
  cutterId: PuzzleCutterId,
): Promise<CutPreviewSample> {
  const layout = await getCutter(cutterId).generate(PREVIEW_IMAGE, {
    difficulty: '3x3',
    boardMaxWidth: PREVIEW_WIDTH,
    boardMaxHeight: PREVIEW_HEIGHT,
    // Fixed, so an icon does not change shape between visits to the screen.
    seed: `preview-${cutterId}`,
  });

  const paths = layout.pieces.map((piece) => piece.path);
  const middle =
    layout.pieces.find((piece) => piece.row === 1 && piece.col === 1) ??
    layout.pieces[Math.floor(layout.pieces.length / 2)];
  const bounds = middle?.bounds;
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return {
      paths,
      transform: { translateX: PREVIEW_MARGIN, translateY: PREVIEW_MARGIN, scale: 1 },
    };
  }

  const scale = Math.min(
    (PREVIEW_WIDTH * FOCUS_FILL) / bounds.width,
    (PREVIEW_HEIGHT * FOCUS_FILL) / bounds.height,
  );
  const centreX = bounds.x + bounds.width / 2;
  const centreY = bounds.y + bounds.height / 2;

  return {
    paths,
    transform: {
      translateX: PREVIEW_WIDTH / 2 - centreX * scale,
      translateY: PREVIEW_HEIGHT / 2 - centreY * scale,
      scale,
    },
  };
}

/** Cached: the picker mounts these eight icons together, and often. */
export function cutPreviewSample(
  cutterId: PuzzleCutterId,
): CutPreviewSample | Promise<CutPreviewSample> {
  const ready = cache.get(cutterId);
  if (ready) {
    return ready;
  }
  const existing = pending.get(cutterId);
  if (existing) {
    return existing;
  }
  const request = buildSample(cutterId)
    .then((sample) => {
      cache.set(cutterId, sample);
      pending.delete(cutterId);
      return sample;
    })
    .catch((error) => {
      pending.delete(cutterId);
      throw error;
    });
  pending.set(cutterId, request);
  return request;
}
