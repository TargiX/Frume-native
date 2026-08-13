import type { OwnPhotoCandidate } from './ownPhotoSelection';
import { resolveOwnPhotoResize } from './ownPhotoSelection';

export type NormalizedOwnPhoto = {
  photo: OwnPhotoCandidate;
  /** Cache file created by ImageManipulator; remove after the durable copy. */
  temporaryUri: string | null;
};

export type OwnPhotoResizeOperation = (
  uri: string,
  width: number,
  height: number,
) => Promise<OwnPhotoCandidate>;

async function resizeOwnPhoto(
  uri: string,
  width: number,
  height: number,
): Promise<OwnPhotoCandidate> {
  const { ImageManipulator, SaveFormat } = await import(
    'expo-image-manipulator'
  );
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width, height });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    // Puzzle photographs do not need an alpha channel. JPEG keeps the
    // normalized durable copy well below the separate 20 MB file ceiling.
    format: SaveFormat.JPEG,
    compress: 0.92,
  });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

export async function normalizeOwnPhotoCandidate(
  candidate: OwnPhotoCandidate,
  resize: OwnPhotoResizeOperation = resizeOwnPhoto,
): Promise<NormalizedOwnPhoto> {
  const target = resolveOwnPhotoResize(candidate);
  if (!target) {
    return { photo: candidate, temporaryUri: null };
  }

  const photo = await resize(
    candidate.uri,
    target.width,
    target.height,
  );
  if (
    !photo.uri ||
    !Number.isSafeInteger(photo.width) ||
    !Number.isSafeInteger(photo.height) ||
    photo.width <= 0 ||
    photo.height <= 0 ||
    photo.width * photo.height > target.width * target.height
  ) {
    await discardTemporaryOwnPhoto(photo.uri || null);
    throw new Error('The resized photograph was invalid');
  }
  return { photo, temporaryUri: photo.uri };
}

export async function discardTemporaryOwnPhoto(
  temporaryUri: string | null,
): Promise<void> {
  if (!temporaryUri) {
    return;
  }
  try {
    const { File } = await import('expo-file-system');
    const temporary = new File(temporaryUri);
    if (temporary.exists) {
      temporary.delete();
    }
  } catch {
    // This is an app-cache file, not the durable session owner. The operating
    // system may reclaim it later; never turn successful import into failure.
  }
}
