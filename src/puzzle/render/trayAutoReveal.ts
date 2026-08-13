type TrayExtent = {
  min: number;
  max: number;
};

type TrayAutoRevealInput = {
  scroll: number;
  extent: TrayExtent | null;
  viewportExtent: number;
  minScroll: number;
  maxScroll: number;
};

const VISIBILITY_MARGIN = 8;
const REVEAL_INSET = 24;

function clampScroll(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Keeps at least one remaining tray piece inside the visible shelf window. */
export function resolveTrayAutoRevealScroll({
  scroll,
  extent,
  viewportExtent,
  minScroll,
  maxScroll,
}: TrayAutoRevealInput): number {
  if (!extent) {
    return clampScroll(scroll, minScroll, maxScroll);
  }

  const windowLeading = -scroll;
  const windowTrailing = windowLeading + viewportExtent;
  const anyVisible =
    extent.max > windowLeading + VISIBILITY_MARGIN &&
    extent.min < windowTrailing - VISIBILITY_MARGIN;

  if (anyVisible) {
    return clampScroll(scroll, minScroll, maxScroll);
  }

  const target =
    extent.min >= windowTrailing
      ? -extent.min + REVEAL_INSET
      : viewportExtent - extent.max - REVEAL_INSET;
  return clampScroll(target, minScroll, maxScroll);
}
