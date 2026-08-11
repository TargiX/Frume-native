import { describe, expect, it } from 'vitest';

import { resolvePieceRenderTranslation } from './pieceRenderPosition';

describe('piece render position', () => {
  it('renders a locked piece at the exact target even while its spring is stale', () => {
    expect(
      resolvePieceRenderTranslation({
        locked: true,
        visualX: 142,
        visualY: 91,
        correctX: 120,
        correctY: 80,
        trayOffsetX: 9,
        trayOffsetY: 0,
      }),
    ).toEqual({ x: 0, y: 0 });
  });

  it('keeps loose pieces attached to their live visual and tray position', () => {
    expect(
      resolvePieceRenderTranslation({
        locked: false,
        visualX: 142,
        visualY: 91,
        correctX: 120,
        correctY: 80,
        trayOffsetX: 9,
        trayOffsetY: 0,
      }),
    ).toEqual({ x: 31, y: 11 });
  });
});
