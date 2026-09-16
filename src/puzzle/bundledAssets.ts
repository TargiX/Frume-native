import { Image, Platform } from 'react-native';
import { DISCOVERY_IMAGE } from './discovery';
import { bundledPhotoByUri } from './bundledPhotos';

/**
 * Metro needs every `require` written out literally, so the asset map stays
 * in one place. `displayImageUri` resolves any bundled URI — the discovery
 * study's legacy `frume://coastal-morning` and the offline collection's
 * `frume://bundled/<id>` — to the packaged file; anything else falls through
 * to the network path unchanged.
 */
const BUNDLED_ASSETS = {
  'coastal-morning': require('../../assets/discover/coastal-morning.png'),
  'blue-fjord': require('../../assets/bundled/blue-fjord.jpg'),
  'canyon-falls': require('../../assets/bundled/canyon-falls.jpg'),
  'matterhorn': require('../../assets/bundled/matterhorn.jpg'),
  'valley-light': require('../../assets/bundled/valley-light.jpg'),
  'northern-lights': require('../../assets/bundled/northern-lights.jpg'),
  'morning-tide': require('../../assets/bundled/morning-tide.jpg'),
  'lake-canoe': require('../../assets/bundled/lake-canoe.jpg'),
  'blanket-pug': require('../../assets/bundled/blanket-pug.jpg'),
  'forest-fawn': require('../../assets/bundled/forest-fawn.jpg'),
  'central-park-air': require('../../assets/bundled/central-park-air.jpg'),
  'strawberries': require('../../assets/bundled/strawberries.jpg'),
  'slow-coffee': require('../../assets/bundled/slow-coffee.jpg'),
} as const;

type BundledAssetId = keyof typeof BUNDLED_ASSETS;

export const DISCOVERY_ASSET = BUNDLED_ASSETS['coastal-morning'];

/** Packaged asset for gallery thumbnails; undefined only for a stale id. */
export function bundledAssetForId(id: string) {
  return BUNDLED_ASSETS[id as BundledAssetId];
}

function bundledAssetIdForUri(uri: string): BundledAssetId | undefined {
  if (uri === DISCOVERY_IMAGE.uri) return 'coastal-morning';
  const photo = bundledPhotoByUri(uri);
  return photo && photo.id in BUNDLED_ASSETS
    ? (photo.id as BundledAssetId)
    : undefined;
}

export function displayImageUri(uri: string): string {
  const id = bundledAssetIdForUri(uri);
  if (!id) return uri;
  const asset = BUNDLED_ASSETS[id];
  if (Platform.OS === 'web') {
    return typeof asset === 'string' ? asset : asset.uri;
  }
  return Image.resolveAssetSource(asset).uri;
}
