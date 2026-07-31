import { describe, expect, it } from 'vitest';

import { PuzzleEngine } from '../engine';
import { getTrayMetrics, getTraySlotPosition } from '../engine/tray';
import type { PuzzleLayout, PuzzlePieceDefinition } from '../types';
import { beginPieceDrag, completePieceDrag } from './dragLifecycle';
import { isPieceCenterOverTray } from './dropTarget';

const tallPiece: PuzzlePieceDefinition = {
  id: 'piece-a',
  index: 0,
  row: 0,
  col: 0,
  path: 'M 0 0 L 120 0 L 120 110 L 0 110 Z',
  bounds: { x: 0, y: 0, width: 120, height: 110 },
  clipRegion: { x: 0, y: 0, width: 1, height: 1 },
  correctPosition: { x: 0, y: 0 },
  correctRotation: 0,
  neighborIds: [],
};

const layout: PuzzleLayout = {
  cutterId: 'classic',
  image: { uri: 'https://example.test/photo.jpg', width: 1200, height: 900 },
  boardSize: { width: 360, height: 270 },
  pieces: [tallPiece],
};

describe('tray drop targeting', () => {
  it('classifies a visually centred scaled tray piece by its stable centre', () => {
    const metrics = getTrayMetrics(layout);
    const slot = getTraySlotPosition(layout, 0, tallPiece);

    expect(slot.y).toBeLessThan(metrics.top);
    expect(
      isPieceCenterOverTray(slot.y, tallPiece.bounds.height, metrics.top),
    ).toBe(true);
    expect(
      isPieceCenterOverTray(
        metrics.top - tallPiece.bounds.height / 2 - 1,
        tallPiece.bounds.height,
        metrics.top,
      ),
    ).toBe(false);
  });

  it('keeps a no-move tray tap in its slot without counting a move', () => {
    const engine = new PuzzleEngine(layout);
    const before = engine.getState().pieces[tallPiece.id];
    const metrics = getTrayMetrics(layout);

    engine.takeFromTray(tallPiece.id, before.position);
    if (
      isPieceCenterOverTray(
        before.position.y,
        tallPiece.bounds.height,
        metrics.top,
      )
    ) {
      engine.returnToTray(tallPiece.id);
    }

    expect(engine.getState().pieces[tallPiece.id]).toMatchObject({
      inTray: true,
      position: before.position,
      traySlot: before.traySlot,
    });
    expect(engine.getState().moveCount).toBe(0);
  });

  it('keeps one recognizer alive from the first tray touch through a board drop', () => {
    const engine = new PuzzleEngine(layout);
    const start = engine.getState().pieces[tallPiece.id].position;
    const metrics = getTrayMetrics(layout);

    beginPieceDrag(engine, tallPiece.id);

    // Changing inTray while the native Pan recognizer is active causes React
    // to replace the tray gesture and turns the first drag into a selection.
    expect(engine.getState().pieces[tallPiece.id].inTray).toBe(true);

    completePieceDrag(
      engine,
      tallPiece.id,
      { x: 180, y: 80 },
      {
        placement: 'bottom',
        start: metrics.top,
        pieceWidth: tallPiece.bounds.width,
        pieceHeight: tallPiece.bounds.height,
      },
    );

    expect(engine.getState().pieces[tallPiece.id]).toMatchObject({
      inTray: false,
      position: { x: 180, y: 80 },
    });
    expect(engine.getState().moveCount).toBe(1);
    expect(engine.getState().selectedPieceId).toBeNull();
  });

  it('lets a loose piece be grabbed again after it is dropped in the wrong cell', () => {
    const engine = new PuzzleEngine(layout);
    const metrics = getTrayMetrics(layout);
    const wrongCell = { x: 180, y: 80 };

    beginPieceDrag(engine, tallPiece.id);
    completePieceDrag(engine, tallPiece.id, wrongCell, {
      placement: 'bottom',
      start: metrics.top,
      pieceWidth: tallPiece.bounds.width,
      pieceHeight: tallPiece.bounds.height,
    });
    expect(engine.getState().pieces[tallPiece.id]).toMatchObject({
      locked: false,
      inTray: false,
      position: wrongCell,
    });

    beginPieceDrag(engine, tallPiece.id);
    completePieceDrag(engine, tallPiece.id, { x: 60, y: 50 }, {
      placement: 'bottom',
      start: metrics.top,
      pieceWidth: tallPiece.bounds.width,
      pieceHeight: tallPiece.bounds.height,
    });

    expect(engine.getState().pieces[tallPiece.id]).toMatchObject({
      locked: false,
      inTray: false,
      position: { x: 60, y: 50 },
    });
    expect(engine.getState().moveCount).toBe(2);
  });
});
