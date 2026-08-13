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
const MAX_FILENAME_COLLISIONS = 1_000;
const MANAGED_OWN_PHOTO_URI =
  /\/frume-own-photos\/own-\d+(?:-\d+)?\.(?:heic|jpeg|jpg|png)$/i;
const activeCandidateUris = new Set<string>();
let ownershipReconciliationQueue: Promise<void> = Promise.resolve();

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

export function isManagedOwnPhotoUri(uri: string | undefined): uri is string {
  return typeof uri === 'string' &&
    uri.startsWith('file://') &&
    MANAGED_OWN_PHOTO_URI.test(uri);
}

/**
 * Produces a stable, duplicate-free deletion plan for the managed library.
 * Unknown files are never treated as Frume-owned and therefore never deleted.
 */
export function resolveOwnPhotoPrunePlan(
  libraryUris: readonly string[],
  ownedUris: readonly (string | undefined)[],
): string[] {
  const owned = new Set(ownedUris.filter(isManagedOwnPhotoUri));
  return [...new Set(libraryUris.filter(isManagedOwnPhotoUri))]
    .filter((uri) => !owned.has(uri))
    .sort();
}

function destinationFilename(
  now: number,
  extension: string,
  collision: number,
): string {
  return `own-${now}${collision === 0 ? '' : `-${collision}`}.${extension}`;
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

  if (!Number.isSafeInteger(now) || now < 0) {
    throw new Error('The photograph could not be saved on this device');
  }
  const extension = extensionFor(sourceUri);
  let collision = 0;
  let destination = new File(
    directory,
    destinationFilename(now, extension, collision),
  );
  while (destination.exists && collision < MAX_FILENAME_COLLISIONS) {
    collision += 1;
    destination = new File(
      directory,
      destinationFilename(now, extension, collision),
    );
  }
  if (destination.exists) {
    throw new Error('The photograph could not be saved on this device');
  }

  try {
    source.copy(destination);
    const sizeBytes = destination.size;
    if (!destination.exists || sizeBytes === null || sizeBytes <= 0) {
      throw new Error('The photograph could not be saved on this device');
    }
    if (sizeBytes > MAX_OWN_PHOTO_BYTES) {
      throw new Error('That photograph is too large to keep for offline play');
    }
    // Register before resolving to the caller. Any older asynchronous global
    // reconciliation must see this staging owner before it can inspect files.
    activeCandidateUris.add(destination.uri);
    return { uri: destination.uri, sizeBytes };
  } catch (caught) {
    // The destination was proven absent above, so cleanup can only remove the
    // candidate created by this attempt, never the currently owned photograph.
    if (destination.exists) {
      try {
        destination.delete();
      } catch {
        // Preserve the actionable copy/validation error. Reconciliation after
        // the next session transaction will retry this managed orphan.
      }
    }
    throw caught;
  }
}

/**
 * Reconciles physical files only after the caller has committed its durable
 * session transaction. Pass every saved slot's image URI; pass an empty array
 * after clear. Provider URLs are ignored, so replacing an own photo with a
 * provider photo releases the old file.
 */
export async function reconcileOwnPhotoOwnership(
  ownedUris: readonly (string | undefined)[],
): Promise<void> {
  const reconcile = async () => {
    const { Directory, Paths } = await fileSystem();
    const directory = new Directory(Paths.document, DIRECTORY_NAME);
    if (!directory.exists) {
      return;
    }

    const filesByUri = new Map(
      directory
        .list()
        .filter((entry) => 'size' in entry)
        .map((entry) => [entry.uri, entry] as const),
    );
    const prunePlan = resolveOwnPhotoPrunePlan(
      [...filesByUri.keys()],
      [...ownedUris, ...activeCandidateUris],
    );
    for (const uri of prunePlan) {
      filesByUri.get(uri)?.delete();
    }
  };

  const result = ownershipReconciliationQueue.then(reconcile, reconcile);
  ownershipReconciliationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** Releases the staging lease only after the exact candidate is durably owned. */
export function commitManagedOwnPhotoCandidate(
  uri: string | undefined,
): boolean {
  return isManagedOwnPhotoUri(uri) && activeCandidateUris.delete(uri);
}

/** Removes one known staging candidate without making assumptions about any
 * other active, optimistic, or durable owner. */
export async function discardManagedOwnPhotoCandidate(
  uri: string | undefined,
): Promise<boolean> {
  if (!isManagedOwnPhotoUri(uri)) {
    return false;
  }
  activeCandidateUris.delete(uri);
  try {
    const { File } = await fileSystem();
    const candidate = new File(uri);
    if (candidate.exists) {
      candidate.delete();
    }
    return true;
  } catch {
    // Candidate cleanup is retryable during later global reconciliation and
    // must never damage the prior saved puzzle or block navigation.
    return false;
  }
}

/** @deprecated Prefer the transaction-named API at new call sites. */
export async function pruneOwnPhotos(
  keepUris: readonly (string | undefined)[],
): Promise<void> {
  return reconcileOwnPhotoOwnership(keepUris);
}
