import { Image, Platform } from 'react-native';
import { DISCOVERY_IMAGE } from './discovery';

export const DISCOVERY_ASSET = require('../../assets/discover/coastal-morning.png');
export function displayImageUri(uri: string): string {
  if (uri !== DISCOVERY_IMAGE.uri) return uri;
  if (Platform.OS === 'web')
    return typeof DISCOVERY_ASSET === 'string'
      ? DISCOVERY_ASSET
      : DISCOVERY_ASSET.uri;
  return Image.resolveAssetSource(DISCOVERY_ASSET).uri;
}
