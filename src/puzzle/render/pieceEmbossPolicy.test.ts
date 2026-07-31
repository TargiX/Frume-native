import { describe, expect, it } from 'vitest';

import {
  LOCKED_PIECE_SEAM_UNDERPAINT_WIDTH,
  shouldRenderPieceEmboss,
} from './pieceEmbossPolicy';

describe('piece emboss policy', () => {
  it('does not draw a second contour after a piece is seated', () => {
    expect(
      shouldRenderPieceEmboss({ locked: true, showSeams: true }),
    ).toBe(false);
  });

  it('keeps physical edge depth on loose pieces only', () => {
    expect(
      shouldRenderPieceEmboss({ locked: false, showSeams: true }),
    ).toBe(true);
    expect(
      shouldRenderPieceEmboss({ locked: false, showSeams: false }),
    ).toBe(false);
  });

  it('underpaints seated contours enough to cover Skia anti-alias hairlines', () => {
    expect(LOCKED_PIECE_SEAM_UNDERPAINT_WIDTH).toBeGreaterThanOrEqual(1);
  });
});
