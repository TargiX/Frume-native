type TrayExtent = {
  min: number;
  max: number;
};

type TrayAutoRevealInput = {
  scroll: number;
  extent: TrayExtent | null;
  /**
   * Leading edge of the shelf's visible window in tray-content coordinates.
   * The shelf is centred on the board but runs the whole table, so it starts
   * before the board's origin — on a tablet this start sits far below zero,
   * and every scroll decision measured from zero is off by that amount.
   */
  viewportStart: number;
  viewportExtent: number;
  minScroll: number;
  maxScroll: number;
};

const VISIBILITY_MARGIN = 8;
const REVEAL_INSET = 24;
/** Clearance the scroll bounds keep between the extreme piece and the edge. */
const TRAY_SCROLL_EDGE_INSET = 12;

function clampScroll(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Farthest the shelf may be dragged while the pieces still waiting in it
 * remain the thing being scrolled. Bounds are measured from the shelf's
 * window start — the tray content does not begin at coordinate zero, so
 * bounding by zero alone leaves a dead band of shelf the last pieces can
 * never be scrolled into.
 */
export function resolveTrayScrollBounds(
  extent: TrayExtent | null,
  viewportStart: number,
  viewportExtent: number,
): { minScroll: number; maxScroll: number } {
  if (!extent) {
    return { minScroll: 0, maxScroll: 0 };
  }
  return {
    minScroll: Math.min(
      0,
      viewportStart + viewportExtent - extent.max - TRAY_SCROLL_EDGE_INSET,
    ),
    maxScroll: Math.max(
      0,
      viewportStart + TRAY_SCROLL_EDGE_INSET - extent.min,
    ),
  };
}

/** Keeps at least one remaining tray piece inside the visible shelf window. */
export function resolveTrayAutoRevealScroll({
  scroll,
  extent,
  viewportStart,
  viewportExtent,
  minScroll,
  maxScroll,
}: TrayAutoRevealInput): number {
  if (!extent) {
    return clampScroll(scroll, minScroll, maxScroll);
  }

  const windowLeading = viewportStart - scroll;
  const windowTrailing = windowLeading + viewportExtent;
  const anyVisible =
    extent.max > windowLeading + VISIBILITY_MARGIN &&
    extent.min < windowTrailing - VISIBILITY_MARGIN;

  if (anyVisible) {
    return clampScroll(scroll, minScroll, maxScroll);
  }

  const target =
    extent.min >= windowTrailing
      ? viewportStart + REVEAL_INSET - extent.min
      : viewportStart + viewportExtent - extent.max - REVEAL_INSET;
  return clampScroll(target, minScroll, maxScroll);
}
