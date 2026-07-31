import { describe, expect, it } from 'vitest';

import { resolveGalleryLayout } from './galleryLayout';

describe('gallery layout', () => {
  it('fits six themes into a 3 by 2 landscape grid', () => {
    expect(
      resolveGalleryLayout({
        width: 844,
        height: 390,
        fontScale: 1,
        horizontalSafeArea: 118,
      }),
    ).toMatchObject({
      columns: 3,
      compactLandscape: true,
      cardWidth: 220,
    });
  });

  it('keeps the familiar two-column portrait grid', () => {
    expect(
      resolveGalleryLayout({ width: 390, height: 844, fontScale: 1 }),
    ).toMatchObject({ columns: 2, compactLandscape: false, cardWidth: null });
  });

  it('does not compress landscape controls with large Dynamic Type', () => {
    expect(
      resolveGalleryLayout({ width: 844, height: 390, fontScale: 1.5 }),
    ).toMatchObject({ columns: 2, compactLandscape: false });
  });
});
