import type {
  PuzzleImageCacheSlot,
  PuzzleImageFileStore,
} from './PuzzleImageCache';

const DIRECTORY_NAME = 'frume-saved-puzzle';
const SLOT_FILE_NAMES: Record<PuzzleImageCacheSlot, string> = {
  a: 'puzzle-a.jpg',
  b: 'puzzle-b.jpg',
};

async function fileSystem() {
  return import('expo-file-system');
}

/** Removes legacy locally downloaded Unsplash files; it never creates them. */
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
