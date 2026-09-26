import {
  buildPhotoApiUrl,
  withPhotoApiRequestDeadline,
} from '../../../services/unsplash/photoApi';
import type { BakedCut } from './bakedCut';
import type { RemoteCutLoader } from './bakedCutSource';
import { sha256Hex } from './sha256';

/** Where verified payloads are kept between launches. */
export type CutFileStore = {
  read(name: string): Promise<string | null>;
  write(name: string, contents: string): Promise<void>;
};

type Dependencies = {
  store: CutFileStore;
  fetchText: (url: string, signal: AbortSignal) => Promise<string>;
};

/**
 * Loads a remote cut from the device, or downloads it once.
 *
 * Files are named by their hash, so a catalog that shares a payload with an
 * older one reuses the same file, and a file can never hold the wrong cut: one
 * whose contents no longer match its name is discarded and fetched again. The
 * store is the documents directory, not the cache, because a saved puzzle on
 * a big board must reopen without a network.
 */
export function createRemoteCutLoader({
  store,
  fetchText,
}: Dependencies): RemoteCutLoader {
  return async ({ key, sha256 }) => {
    const name = `${sha256}.json`;
    const local = await store.read(name).catch(() => null);
    if (local !== null && sha256Hex(local) === sha256) {
      return JSON.parse(local) as BakedCut;
    }
    const raw = await withPhotoApiRequestDeadline((signal) =>
      fetchText(buildPhotoApiUrl(`cuts/${key}`), signal),
    );
    if (sha256Hex(raw) !== sha256) {
      throw new Error(`Downloaded cut ${key} failed its integrity check`);
    }
    const cut = JSON.parse(raw) as BakedCut;
    // A failed write only costs a second download later.
    await store.write(name, raw).catch(() => undefined);
    return cut;
  };
}

const DIRECTORY_NAME = 'frume-cuts';

/** The production store: `Documents/frume-cuts/<sha256>.json`. */
export const expoCutFileStore: CutFileStore = {
  async read(name) {
    const { Directory, File, Paths } = await import('expo-file-system');
    const file = new File(new Directory(Paths.document, DIRECTORY_NAME), name);
    return file.exists ? await file.text() : null;
  },
  async write(name, contents) {
    const { Directory, File, Paths } = await import('expo-file-system');
    const directory = new Directory(Paths.document, DIRECTORY_NAME);
    if (!directory.exists) directory.create({ intermediates: true });
    const file = new File(directory, name);
    if (file.exists) file.delete();
    file.create();
    file.write(contents);
  },
};

export async function fetchCutText(
  url: string,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Cut download failed with HTTP ${response.status}`);
  }
  return response.text();
}
