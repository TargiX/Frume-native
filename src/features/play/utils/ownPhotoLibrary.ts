/**
 * Durable storage for photographs the player brings themselves.
 *
 * The picker hands back a file in the app's *cache*, which iOS is free to
 * delete whenever it wants space back — a saved puzzle would come back with a
 * missing photograph. Frume copies the chosen file into its own document
 * directory instead, and prunes everything it is no longer using.
 *
 * Nothing here leaves the device: an imported photograph is never uploaded,
 * never sent to the photo proxy, and carries no attribution because it is the
 * player's own.
 */

const DIRECTORY_NAME = 'frume-own-photos';

/** Matches the offline cache ceiling for provider photographs. */
export const MAX_OWN_PHOTO_BYTES = 20 * 1024 * 1024;

async function fileSystem() {
  return import('expo-file-system');
}

export type OwnPhotoFile = {
  uri: string;
  sizeBytes: number;
};

function extensionFor(uri: string): string {
  const match = /\.([A-Za-z0-9]{2,5})(?:\?|#|$)/.exec(uri);
  const extension = match?.[1]?.toLowerCase();
  return extension === 'png' || extension === 'heic' || extension === 'jpeg'
    ? extension
    : 'jpg';
}

/**
 * Copies a picked photograph into the app's own storage.
 *
 * `now` is injected so the caller can keep file names deterministic in tests.
 */
export async function storeOwnPhoto(
  sourceUri: string,
  now: number = Date.now(),
): Promise<OwnPhotoFile> {
  const { Directory, File, Paths } = await fileSystem();
  const directory = new Directory(Paths.document, DIRECTORY_NAME);
  directory.create({ idempotent: true, intermediates: true });

  const source = new File(sourceUri);
  if (!source.exists) {
    throw new Error('The chosen photograph is no longer available');
  }
  if ((source.size ?? 0) > MAX_OWN_PHOTO_BYTES) {
    throw new Error('That photograph is too large to keep for offline play');
  }

  const destination = new File(
    directory,
    `own-${now}.${extensionFor(sourceUri)}`,
  );
  source.copy(destination);
  if (!destination.exists) {
    throw new Error('The photograph could not be saved on this device');
  }
  return { uri: destination.uri, sizeBytes: destination.size ?? 0 };
}

/**
 * Deletes every imported photograph except the ones still spoken for — the one
 * just chosen and whatever the saved session is using.
 */
export async function pruneOwnPhotos(
  keepUris: readonly (string | undefined)[],
): Promise<void> {
  const { Directory, Paths } = await fileSystem();
  const directory = new Directory(Paths.document, DIRECTORY_NAME);
  if (!directory.exists) {
    return;
  }
  const kept = new Set(keepUris.filter((uri): uri is string => !!uri));
  for (const entry of directory.list()) {
    if ('size' in entry && !kept.has(entry.uri)) {
      entry.delete();
    }
  }
}
