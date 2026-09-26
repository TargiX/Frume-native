import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { BakedCut } from './bakedCut';
import { isRemoteBakedCut, type BakedCutEntry } from './bakedCutLibrary';
import { sha256Hex } from './sha256';

/**
 * Node-only: the payload behind a catalog entry, read from the checkout.
 * Remote entries live in `assets/<key>` locally, so tests and offline tools
 * can walk a whole catalog without a network. Never import from app code.
 */
export function bakedCutOnDisk(entry: BakedCutEntry, root = '.'): BakedCut {
  if (!isRemoteBakedCut(entry)) return entry;
  const raw = readFileSync(resolve(root, 'assets', entry.remote.key), 'utf8');
  if (sha256Hex(raw) !== entry.remote.sha256) {
    throw new Error(`Local payload ${entry.remote.key} does not match its hash`);
  }
  return JSON.parse(raw) as BakedCut;
}
