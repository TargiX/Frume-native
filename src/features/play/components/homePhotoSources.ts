import { Image, Platform, type ImageSourcePropType } from 'react-native';

import { CATEGORY_COVERS } from '../screens/categoryCovers';

/**
 * Stand-ins for the photograph Home is really about, used before a first
 * puzzle exists. These are the bundled theme covers, so Home costs no request,
 * survives a cold offline launch, and stays inside the credits already listed
 * in About & Support.
 */
export const HOME_FALLBACK_PHOTOS: readonly ImageSourcePropType[] = [
  CATEGORY_COVERS.nature,
  CATEGORY_COVERS.ocean,
  CATEGORY_COVERS.city,
  CATEGORY_COVERS.travel,
];

/** Landscape default: only reached if an asset somehow resolves without size. */
const FALLBACK_ASPECT = 3 / 2;

export function assetAspectRatio(source: ImageSourcePropType): number {
  // react-native-web does not implement resolveAssetSource, so the bundled
  // cover falls back to its landscape ratio there.
  if (Platform.OS === 'web') {
    return FALLBACK_ASPECT;
  }
  const resolved = Image.resolveAssetSource(source);
  return resolved?.width && resolved?.height
    ? resolved.width / resolved.height
    : FALLBACK_ASPECT;
}
