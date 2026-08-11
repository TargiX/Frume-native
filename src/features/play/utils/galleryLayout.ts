type GalleryViewport = {
  width: number;
  height: number;
  fontScale: number;
  horizontalSafeArea?: number;
};

export type GalleryLayout = {
  columns: 2 | 3;
  compactLandscape: boolean;
  cardWidth: number | null;
};

export function resolveGalleryLayout({
  width,
  height,
  fontScale,
  horizontalSafeArea = 0,
}: GalleryViewport): GalleryLayout {
  const compactLandscape = width > height && fontScale < 1.4;
  const contentWidth = Math.min(
    1_080,
    width - horizontalSafeArea - 48,
  );
  return {
    columns: compactLandscape ? 3 : 2,
    compactLandscape,
    cardWidth: compactLandscape
      ? Math.floor((contentWidth - 16) / 3)
      : null,
  };
}
