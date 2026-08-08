import * as ImagePicker from 'expo-image-picker';

import { pruneOwnPhotos, storeOwnPhoto } from './ownPhotoLibrary';
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
 * `keepUris` are photographs still in use — typically the saved session's —
 * which must survive the cleanup that follows an import.
 */
export async function pickOwnPhoto(
  keepUris: readonly (string | undefined)[] = [],
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

  try {
    const stored = await storeOwnPhoto(candidate.uri);
    // Only after the new copy exists: a failed import must not delete the
    // photograph the saved puzzle is still using.
    await pruneOwnPhotos([...keepUris, stored.uri]).catch(() => undefined);
    return {
      status: 'picked',
      photo: { ...candidate, uri: stored.uri },
    };
  } catch (caught) {
    return {
      status: 'rejected',
      message:
        caught instanceof Error
          ? caught.message
          : 'That photograph could not be saved on this device.',
    };
  }
}
