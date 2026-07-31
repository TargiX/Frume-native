type PieceEmbossPolicyInput = {
  locked: boolean;
  showSeams: boolean;
};

/** Photo-colored stroke drawn underneath a seated path to hide AA cracks. */
export const LOCKED_PIECE_SEAM_UNDERPAINT_WIDTH = 1.5;

/**
 * Loose pieces keep a cardboard bevel; seated pieces merge into one photograph.
 * Drawing both neighboring bevels after seating creates a false dark gap.
 */
export function shouldRenderPieceEmboss({
  locked,
  showSeams,
}: PieceEmbossPolicyInput): boolean {
  return showSeams && !locked;
}
