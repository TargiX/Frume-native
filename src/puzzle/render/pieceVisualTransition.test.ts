import { describe, expect, it } from 'vitest';

import { shouldAnimateProgrammaticTrayExit } from './pieceVisualTransition';

describe('piece visual transitions', () => {
  it('animates a tray piece to engine coordinates when Assist removes it programmatically', () => {
    expect(
      shouldAnimateProgrammaticTrayExit({
        engineInTray: true,
        runtimeInTray: false,
        trayAttached: true,
      }),
    ).toBe(true);
  });

  it('keeps the finger-owned visual position during a normal drag from the tray', () => {
    expect(
      shouldAnimateProgrammaticTrayExit({
        engineInTray: true,
        runtimeInTray: false,
        trayAttached: false,
      }),
    ).toBe(false);
  });
});
