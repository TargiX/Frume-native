import { describe, expect, it } from 'vitest';
import {
  BUNDLED_PHOTOS,
  bundledPhotoById,
  bundledPhotoByUri,
} from './bundledPhotos';

describe('bundled photo registry', () => {
  it('gives every photograph a unique id and a stable bundled URI', () => {
    const ids = BUNDLED_PHOTOS.map((photo) => photo.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const photo of BUNDLED_PHOTOS) {
      expect(photo.id).toMatch(/^[a-z0-9-]+$/);
      expect(photo.uri).toBe(`frume://bundled/${photo.id}`);
      expect(photo.file).toMatch(/\.(jpg|png)$/);
      expect(photo.width).toBeGreaterThan(0);
      expect(photo.height).toBeGreaterThan(0);
      expect(photo.title.length).toBeGreaterThan(0);
      expect(photo.accessibilityLabel.length).toBeGreaterThan(0);
    }
  });

  it('credits every photograph to a named photographer on Unsplash', () => {
    for (const photo of BUNDLED_PHOTOS) {
      expect(photo.attribution.photographerName.length).toBeGreaterThan(0);
      expect(photo.attribution.sourceName).toBe('Unsplash');
      expect(photo.attribution.photographerUrl).toMatch(
        /^https:\/\/unsplash\.com\/photos\//,
      );
      expect(photo.attribution.sourceUrl).toMatch(
        /^https:\/\/unsplash\.com\/photos\//,
      );
    }
  });

  it('round-trips between uri and registry entry', () => {
    for (const photo of BUNDLED_PHOTOS) {
      expect(bundledPhotoByUri(photo.uri)).toBe(photo);
      expect(bundledPhotoById(photo.id)).toBe(photo);
    }
  });

  it('leaves the discovery study and network URIs alone', () => {
    expect(bundledPhotoByUri('frume://coastal-morning')).toBeUndefined();
    expect(
      bundledPhotoByUri('https://images.unsplash.com/photo-1'),
    ).toBeUndefined();
    expect(bundledPhotoByUri('file:///documents/own.jpg')).toBeUndefined();
    expect(bundledPhotoById('not-a-photo')).toBeUndefined();
  });
});
