import type {
  CachedPuzzleImageFile,
  PuzzleImageCacheSlot,
  PuzzleImageFileStore,
} from './PuzzleImageCache';

const DIRECTORY_NAME = 'frume-saved-puzzle';
const SLOT_FILE_NAMES: Record<PuzzleImageCacheSlot, string> = {
  a: 'puzzle-a.jpg',
  b: 'puzzle-b.jpg',
};
const DOWNLOAD_TIMEOUT_MS = 20_000;

async function fileSystem() {
  return import('expo-file-system');
}

/**
 * Native document-directory adapter. Dynamic loading keeps the pure cache
 * policy independently testable in Node without an Expo native runtime.
 */
export class ExpoPuzzleImageFileStore implements PuzzleImageFileStore {
  async slotForUri(uri: string): Promise<PuzzleImageCacheSlot | null> {
    const { Directory, File, Paths } = await fileSystem();
    const directory = new Directory(Paths.document, DIRECTORY_NAME);
    for (const slot of ['a', 'b'] as const) {
      if (new File(directory, SLOT_FILE_NAMES[slot]).uri === uri) {
        return slot;
      }
    }
    return null;
  }

  async exists(uri: string): Promise<boolean> {
    if ((await this.slotForUri(uri)) === null) {
      return false;
    }
    const { File } = await fileSystem();
    return new File(uri).exists;
  }

  async replaceFromRemote(
    slot: PuzzleImageCacheSlot,
    remoteUri: string,
    maximumBytes: number,
  ): Promise<CachedPuzzleImageFile> {
    const { Directory, File, Paths } = await fileSystem();
    const { fetch } = await import('expo/fetch');
    const directory = new Directory(Paths.document, DIRECTORY_NAME);
    directory.create({ idempotent: true, intermediates: true });
    const destination = new File(directory, SLOT_FILE_NAMES[slot]);
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error('Puzzle image download timed out')),
      DOWNLOAD_TIMEOUT_MS,
    );

    try {
      const response = await fetch(remoteUri, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(
          `Puzzle image download failed with HTTP ${response.status}`,
        );
      }
      const declaredSize = Number(
        response.headers.get('content-length') ?? Number.NaN,
      );
      if (Number.isFinite(declaredSize) && declaredSize > maximumBytes) {
        throw new Error('Puzzle image exceeds the offline cache limit');
      }
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Puzzle image response has no readable body');
      }

      destination.create({ overwrite: true });
      const handle = destination.open();
      let sizeBytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          sizeBytes += value.byteLength;
          if (sizeBytes > maximumBytes) {
            await reader.cancel(
              'Puzzle image exceeds the offline cache limit',
            );
            throw new Error('Puzzle image exceeds the offline cache limit');
          }
          handle.writeBytes(value);
        }
      } finally {
        handle.close();
      }

      if (!destination.exists || sizeBytes <= 0) {
        throw new Error('Downloaded puzzle image is unavailable');
      }
      return { uri: destination.uri, sizeBytes };
    } finally {
      clearTimeout(timer);
    }
  }

  async remove(slot: PuzzleImageCacheSlot): Promise<void> {
    const { Directory, File, Paths } = await fileSystem();
    const file = new File(
      new Directory(Paths.document, DIRECTORY_NAME),
      SLOT_FILE_NAMES[slot],
    );
    if (file.exists) {
      file.delete();
    }
  }

  async clear(): Promise<void> {
    const { Directory, Paths } = await fileSystem();
    const directory = new Directory(Paths.document, DIRECTORY_NAME);
    if (directory.exists) {
      directory.delete();
    }
  }
}
