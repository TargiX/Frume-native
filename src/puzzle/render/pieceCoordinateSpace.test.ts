import { describe, expect, it } from 'vitest';

import {
  boardPointToViewport,
  piecePointToViewport,
  viewportPointToBoard,
} from '../interaction/pieceCoordinateSpace';

const camera = { scale: 2, x: -120, y: -80 };
const surfaceOrigin = { x: 24, y: 18 };

describe('piece coordinate spaces', () => {
  it('keeps tray pieces fixed while the board camera zooms and pans', () => {
    expect(
      piecePointToViewport({
        point: { x: 140, y: 520 },
        trayAttached: true,
        trayOffset: { x: -36, y: 0 },
        camera,
        surfaceOrigin,
      }),
    ).toEqual({ x: 128, y: 538 });
  });

  it('applies the camera only after a piece leaves the tray', () => {
    expect(
      piecePointToViewport({
        point: { x: 140, y: 520 },
        trayAttached: false,
        trayOffset: { x: -36, y: 0 },
        camera,
        surfaceOrigin,
      }),
    ).toEqual(boardPointToViewport({ x: 140, y: 520 }, camera, surfaceOrigin));
  });

  it('converts a lifted tray piece into board space without a visual jump', () => {
    const fixedViewportPoint = { x: 128, y: 538 };
    const boardPoint = viewportPointToBoard(
      fixedViewportPoint,
      camera,
      surfaceOrigin,
    );

    expect(boardPointToViewport(boardPoint, camera, surfaceOrigin)).toEqual(
      fixedViewportPoint,
    );
  });
});
