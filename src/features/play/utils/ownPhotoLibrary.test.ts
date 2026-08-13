import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakeFileSystem = vi.hoisted(() => ({
  files: new Map<string, number>(),
  copiedSize: null as number | null,
  failAfterCopy: false,
}));

vi.mock('expo-file-system', () => {
  const join = (base: string, name?: string) =>
    name ? `${base.replace(/\/$/, '')}/${name}` : base;

  class FakeFile {
    readonly uri: string;

    constructor(base: string | { uri: string }, name?: string) {
      this.uri = join(typeof base === 'string' ? base : base.uri, name);
    }

    get exists() {
      return fakeFileSystem.files.has(this.uri);
    }

    get size() {
      return fakeFileSystem.files.get(this.uri) ?? null;
    }

    copy(destination: FakeFile) {
      fakeFileSystem.files.set(
        destination.uri,
        fakeFileSystem.copiedSize ?? this.size ?? 0,
      );
      if (fakeFileSystem.failAfterCopy) {
        throw new Error('copy failed');
      }
    }

    delete() {
      fakeFileSystem.files.delete(this.uri);
    }
  }

  class FakeDirectory {
    readonly uri: string;

    constructor(base: string | { uri: string }, name?: string) {
      this.uri = join(typeof base === 'string' ? base : base.uri, name);
    }

    get exists() {
      return true;
    }

    create() {}

    list() {
      const prefix = `${this.uri}/`;
      return [...fakeFileSystem.files.keys()]
        .filter((uri) => uri.startsWith(prefix))
        .map((uri) => new FakeFile(uri));
    }
  }

  return {
    Directory: FakeDirectory,
    File: FakeFile,
    Paths: { document: 'file:///documents' },
  };
});

import {
  MAX_OWN_PHOTO_BYTES,
  commitManagedOwnPhotoCandidate,
  isManagedOwnPhotoUri,
  discardManagedOwnPhotoCandidate,
  reconcileOwnPhotoOwnership,
  resolveOwnPhotoPrunePlan,
  storeOwnPhoto,
} from './ownPhotoLibrary';

const root = 'file:///documents/frume-own-photos';

describe('own-photo ownership', () => {
  beforeEach(() => {
    fakeFileSystem.files.clear();
    fakeFileSystem.copiedSize = null;
    fakeFileSystem.failAfterCopy = false;
  });

  it('recognizes only files created inside the managed library', () => {
    expect(isManagedOwnPhotoUri(`${root}/own-123.jpg`)).toBe(true);
    expect(isManagedOwnPhotoUri(`${root}/own-123-2.heic`)).toBe(true);
    expect(isManagedOwnPhotoUri(`${root}/own-123.png?edited=1`)).toBe(false);
    expect(isManagedOwnPhotoUri('file:///documents/own-123.jpg')).toBe(false);
    expect(isManagedOwnPhotoUri(`${root}/notes.txt`)).toBe(false);
    expect(isManagedOwnPhotoUri('https://example.com/own-123.jpg')).toBe(false);
  });

  it('keeps every explicitly owned file and returns a stable prune order', () => {
    const current = `${root}/own-300.jpg`;
    const staged = `${root}/own-400.png`;
    const firstOrphan = `${root}/own-100.jpeg`;
    const secondOrphan = `${root}/own-200.heic`;

    expect(
      resolveOwnPhotoPrunePlan(
        [secondOrphan, staged, firstOrphan, current, secondOrphan],
        [staged, current],
      ),
    ).toEqual([firstOrphan, secondOrphan]);
  });

  it('clears all managed files when no saved session owns one', () => {
    const ownedByNoSession = [
      'https://images.unsplash.com/photo-1',
      undefined,
    ];

    expect(
      resolveOwnPhotoPrunePlan(
        [`${root}/own-2.jpg`, `${root}/own-1.jpg`, `${root}/unrelated.json`],
        ownedByNoSession,
      ),
    ).toEqual([`${root}/own-1.jpg`, `${root}/own-2.jpg`]);
  });

  it('does not let an arbitrary keep URI protect a different managed file', () => {
    expect(
      resolveOwnPhotoPrunePlan(
        [`${root}/own-1.jpg`],
        ['file:///elsewhere/own-1.jpg'],
      ),
    ).toEqual([`${root}/own-1.jpg`]);
  });

  it('reconciles the physical library without touching unknown files', async () => {
    const kept = `${root}/own-1.jpg`;
    const orphan = `${root}/own-2.jpg`;
    const unknown = `${root}/notes.txt`;
    fakeFileSystem.files.set(kept, 100);
    fakeFileSystem.files.set(orphan, 100);
    fakeFileSystem.files.set(unknown, 100);

    await reconcileOwnPhotoOwnership([kept]);

    expect([...fakeFileSystem.files.keys()].sort()).toEqual(
      [kept, unknown].sort(),
    );
  });

  it('protects a newly staged candidate from delayed global cleanup until commit', async () => {
    const source = 'file:///picker/new-photo.jpg';
    const oldOrphan = `${root}/own-1.jpg`;
    fakeFileSystem.files.set(source, 500);
    fakeFileSystem.files.set(oldOrphan, 400);

    const staged = await storeOwnPhoto(source, 2);
    await reconcileOwnPhotoOwnership([]);

    expect(fakeFileSystem.files.has(oldOrphan)).toBe(false);
    expect(fakeFileSystem.files.has(staged.uri)).toBe(true);

    expect(commitManagedOwnPhotoCandidate(staged.uri)).toBe(true);
    await reconcileOwnPhotoOwnership([]);
    expect(fakeFileSystem.files.has(staged.uri)).toBe(false);
  });

  it('discards only the exact managed staging candidate', async () => {
    const durable = `${root}/own-1.jpg`;
    const candidate = `${root}/own-2.jpg`;
    fakeFileSystem.files.set(durable, 100);
    fakeFileSystem.files.set(candidate, 100);

    await expect(discardManagedOwnPhotoCandidate(candidate)).resolves.toBe(
      true,
    );
    expect(fakeFileSystem.files.has(candidate)).toBe(false);
    expect(fakeFileSystem.files.has(durable)).toBe(true);
  });
});

describe('storeOwnPhoto', () => {
  beforeEach(() => {
    fakeFileSystem.files.clear();
    fakeFileSystem.copiedSize = null;
    fakeFileSystem.failAfterCopy = false;
  });

  it('uses a collision suffix instead of overwriting an owned photo', async () => {
    const source = 'file:///picker/photo.jpg';
    const current = `${root}/own-123.jpg`;
    fakeFileSystem.files.set(source, 500);
    fakeFileSystem.files.set(current, 400);

    await expect(storeOwnPhoto(source, 123)).resolves.toEqual({
      uri: `${root}/own-123-1.jpg`,
      sizeBytes: 500,
    });
    expect(fakeFileSystem.files.get(current)).toBe(400);
    commitManagedOwnPhotoCandidate(`${root}/own-123-1.jpg`);
  });

  it('removes only its new candidate when a copy fails', async () => {
    const source = 'file:///picker/photo.jpg';
    const current = `${root}/own-123.jpg`;
    fakeFileSystem.files.set(source, 500);
    fakeFileSystem.files.set(current, 400);
    fakeFileSystem.failAfterCopy = true;

    await expect(storeOwnPhoto(source, 124)).rejects.toThrow('copy failed');
    expect(fakeFileSystem.files.get(current)).toBe(400);
    expect(fakeFileSystem.files.has(`${root}/own-124.jpg`)).toBe(false);
  });

  it('checks copied size and removes an unexpectedly oversized candidate', async () => {
    const source = 'file:///picker/photo.jpg';
    fakeFileSystem.files.set(source, 500);
    fakeFileSystem.copiedSize = MAX_OWN_PHOTO_BYTES + 1;

    await expect(storeOwnPhoto(source, 125)).rejects.toThrow(
      'too large to keep',
    );
    expect(fakeFileSystem.files.has(`${root}/own-125.jpg`)).toBe(false);
  });
});
