import { describe, expect, it } from 'vitest';

import {
  CLIENT_DIAGNOSTICS_STORAGE_KEY,
  ClientDiagnosticsStore,
  MAX_CLIENT_DIAGNOSTICS,
  buildClientDiagnosticsReport,
  deserializeClientDiagnostics,
  extractComponentNames,
  type ClientDiagnosticsStorage,
} from './clientDiagnostics';

class MemoryStorage implements ClientDiagnosticsStorage {
  value: string | null = null;

  async getItem(key: string): Promise<string | null> {
    expect(key).toBe(CLIENT_DIAGNOSTICS_STORAGE_KEY);
    return this.value;
  }

  async setItem(key: string, value: string): Promise<void> {
    expect(key).toBe(CLIENT_DIAGNOSTICS_STORAGE_KEY);
    this.value = value;
  }

  async removeItem(key: string): Promise<void> {
    expect(key).toBe(CLIENT_DIAGNOSTICS_STORAGE_KEY);
    this.value = null;
  }
}

describe('client diagnostics', () => {
  it('records only redacted fields and a bounded component breadcrumb', async () => {
    const storage = new MemoryStorage();
    const store = new ClientDiagnosticsStore(storage);
    const secretMessage =
      'Photo https://images.example/private.jpg failed for ilya@example.test';

    expect(
      await store.record({
        kind: 'render_error',
        error: new TypeError(secretMessage),
        fatal: true,
        componentStack:
          '\n    in PuzzleBoard (created by GameScreen)\n    at GameScreen\n    at PuzzleBoard',
        occurredAt: 1_700_000_000_000,
      }),
    ).toBe(true);

    expect(storage.value).not.toContain(secretMessage);
    expect(storage.value).not.toContain('images.example');
    expect(await store.load()).toEqual([
      expect.objectContaining({
        version: 1,
        occurredAt: 1_700_000_000_000,
        kind: 'render_error',
        fatal: true,
        errorName: 'TypeError',
        componentNames: ['PuzzleBoard', 'GameScreen'],
      }),
    ]);
  });

  it('serializes concurrent writes and retains only the newest records', async () => {
    const storage = new MemoryStorage();
    const store = new ClientDiagnosticsStore(storage);

    await Promise.all(
      Array.from({ length: MAX_CLIENT_DIAGNOSTICS + 4 }, (_, index) =>
        store.record({
          kind: 'global_js_error',
          error: new Error(`private-${index}`),
          occurredAt: 1_700_000_000_000 + index,
        }),
      ),
    );

    const diagnostics = await store.load();
    expect(diagnostics).toHaveLength(MAX_CLIENT_DIAGNOSTICS);
    expect(diagnostics[0]?.occurredAt).toBe(1_700_000_000_004);
    expect(storage.value).not.toContain('private-');
  });

  it('stores a haptic failure as an explicit redacted nonfatal diagnostic', async () => {
    const storage = new MemoryStorage();
    const store = new ClientDiagnosticsStore(storage);

    await store.record({
      kind: 'haptic_error',
      error: { name: 'HapticsError' },
      componentStack: '\n at HapticFeedback',
      occurredAt: 1_700_000_000_020,
    });

    expect(await store.load()).toEqual([
      expect.objectContaining({
        kind: 'haptic_error',
        fatal: false,
        errorName: 'HapticsError',
        componentNames: ['HapticFeedback'],
      }),
    ]);
  });

  it('rejects hostile records and builds a deliberately redacted report', async () => {
    expect(
      deserializeClientDiagnostics(
        JSON.stringify([
          { version: 1, id: '../../../secret', errorName: '<script>' },
        ]),
      ),
    ).toEqual([]);
    expect(extractComponentNames('\n at Good_Name\n at Bad-Name')).toEqual([
      'Good_Name',
      'Bad',
    ]);

    const storage = new MemoryStorage();
    const store = new ClientDiagnosticsStore(storage);
    await store.record({
      kind: 'render_error',
      error: new Error('do not share this'),
      occurredAt: 1_700_000_000_000,
    });
    const report = buildClientDiagnosticsReport(
      await store.load(),
      '1.0.0',
      '3',
    );
    expect(report).toContain('App 1.0.0 (3)');
    expect(report).toContain('render_error nonfatal Error');
    expect(report).not.toContain('do not share this');
    expect(report).toContain('No photos, URLs, exception messages');
  });

  it('can be cleared explicitly', async () => {
    const storage = new MemoryStorage();
    const store = new ClientDiagnosticsStore(storage);
    await store.record({ kind: 'render_error', error: new Error('hidden') });
    expect(await store.clear()).toBe(true);
    expect(await store.load()).toEqual([]);
  });
});
