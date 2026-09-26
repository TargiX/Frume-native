import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { sha256Hex } from './sha256';

const reference = (text: string) =>
  createHash('sha256').update(text, 'utf8').digest('hex');

describe('sha256Hex', () => {
  it('matches the standard test vectors', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('agrees with node across block boundaries and non-ASCII text', () => {
    for (const text of [
      'a'.repeat(55),
      'a'.repeat(56),
      'a'.repeat(64),
      'a'.repeat(119),
      'Пазл — «Frume» 🧩',
    ]) {
      expect(sha256Hex(text)).toBe(reference(text));
    }
  });

  it('matches the hash a catalog pins for a real payload', () => {
    const catalog = JSON.parse(
      readFileSync('assets/cut-catalogs/2.json', 'utf8'),
    ) as { entries: Record<string, { file: string; sha256: string }[]> };
    const entry = catalog.entries['living-fringe/14x14'][1];
    expect(sha256Hex(readFileSync(entry.file, 'utf8'))).toBe(entry.sha256);
  });
});
