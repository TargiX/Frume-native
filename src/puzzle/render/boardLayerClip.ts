type Size = { width: number; height: number };
type Frame = { left: number; top: number; width: number; height: number };

export type LayerClip = { x: number; y: number; width: number; height: number };

/** The camera-controlled field ends exactly where the fixed shelf begins. */
export function resolveBoardLayerClip(
  viewport: Size,
  shelf: Frame,
  placement: 'bottom' | 'right',
): LayerClip {
  return {
    x: 0,
    y: 0,
    width:
      placement === 'right'
        ? Math.max(0, Math.min(viewport.width, shelf.left))
        : viewport.width,
    height:
      placement === 'bottom'
        ? Math.max(0, Math.min(viewport.height, shelf.top))
        : viewport.height,
  };
}
