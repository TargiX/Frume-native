import * as ImagePicker from 'expo-image-picker';

import { storeOwnPhoto } from './ownPhotoLibrary';
import {
  discardTemporaryOwnPhoto,
  normalizeOwnPhotoCandidate,
} from './ownPhotoNormalization';
import {
  resolveOwnPhotoRejection,
  type OwnPhotoCandidate,
} from './ownPhotoSelection';

export type PickOwnPhotoResult =
  | { status: 'cancelled' }
  | { status: 'rejected'; message: string }
  | { status: 'picked'; photo: OwnPhotoCandidate };

/**
 * Opens the system photo picker and returns a photograph Frume can keep.
 *
 * On iOS this is `PHPickerViewController`: the app never gains access to the
 * library, only to the single file the player hands over, so there is no
 * permission prompt to manage. The file is copied into the app's own storage
 * before it is returned, because the picker's copy lives in the cache.
 *
 * `_currentlyOwnedUris` remains in the signature for callers that already
 * supply the saved session. Import is deliberately non-destructive now: the
 * session owner calls `reconcileOwnPhotoOwnership` only after commit/rollback.
 */
export async function pickOwnPhoto(
  _currentlyOwnedUris: readonly (string | undefined)[] = [],
): Promise<PickOwnPhotoResult> {
  let picked: ImagePicker.ImagePickerResult;
  try {
    picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      // The original file: Frume cuts what the player actually shot.
      quality: 1,
      exif: false,
    });
  } catch {
    return {
      status: 'rejected',
      message: 'The photo library could not be opened.',
    };
  }

  if (picked.canceled) {
    return { status: 'cancelled' };
  }
  const asset = picked.assets?.[0];
  if (!asset) {
    return { status: 'cancelled' };
  }

  const candidate: OwnPhotoCandidate = {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
  };
  const rejection = resolveOwnPhotoRejection(candidate);
  if (rejection) {
    return { status: 'rejected', message: rejection };
  }

  let normalized;
  try {
    normalized = await normalizeOwnPhotoCandidate(candidate);
  } catch {
    return {
      status: 'rejected',
      message:
        'That photograph could not be resized safely. Try a smaller or standard-resolution copy.',
    };
  }

  try {
    const stored = await storeOwnPhoto(normalized.photo.uri);
    return {
      status: 'picked',
      photo: { ...normalized.photo, uri: stored.uri },
    };
  } catch (caught) {
    return {
      status: 'rejected',
      message:
        caught instanceof Error
          ? caught.message
          : 'That photograph could not be saved on this device.',
    };
  } finally {
    await discardTemporaryOwnPhoto(normalized.temporaryUri);
  }
}
