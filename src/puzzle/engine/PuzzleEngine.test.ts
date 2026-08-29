import { describe, expect, it, vi } from 'vitest';

import type { PuzzleLayout, PuzzlePieceDefinition } from '../types';
import { PuzzleEngine } from './PuzzleEngine';
import { getTraySlotPosition } from './tray';

function piece(
  id: string,
  index: number,
  x: number,
  y: number,
): PuzzlePieceDefinition {
  return {
    id,
    index,
    row: 0,
    col: index,
    path: `M ${x} ${y} L ${x + 30} ${y} L ${x + 30} ${y + 20} L ${x} ${y + 20} Z`,
    bounds: { x, y, width: 30, height: 20 },
    clipRegion: {
      x: x / 100,
      y: y / 80,
      width: 0.3,
      height: 0.25,
    },
    correctPosition: { x, y },
    correctRotation: 0,
    neighborIds: [],
  };
}

function layout(
  width = 100,
  height = 80,
  pieces: readonly PuzzlePieceDefinition[] = [
    piece('piece-a', 0, 10, 10),
    piece('piece-b', 1, 55, 10),
  ],
): PuzzleLayout {
  return {
    cutterId: 'classic',
    image: { uri: 'https://example.test/puzzle.jpg', width: 1200, height: 800 },
    boardSize: { width, height },
    pieces,
  };
}

describe('PuzzleEngine recoverability', () => {
  it('assists exactly one loose piece through the normal snap path', () => {
    const puzzleLayout = layout();
    const engine = new PuzzleEngine(puzzleLayout);
    const before = engine.getSnapshot();

    const result = engine.assistPiece();

    expect(result).toMatchObject({
      snapped: true,
      locked: true,
    });
    expect(result).not.toBeNull();
    const assistedId = result?.pieceId;
    expect(assistedId).toBe('piece-a');
    expect(engine.getState()).toMatchObject({
      status: 'playing',
      moveCount: 1,
      selectedPieceId: null,
      snapFeedback: {
        pieceId: assistedId,
        kind: 'seat',
      },
    });
    expect(engine.getState().pieces[assistedId!]).toMatchObject({
      locked: true,
      inTray: false,
      position: puzzleLayout.pieces[0].correctPosition,
      rotation: puzzleLayout.pieces[0].correctRotation,
    });
    expect(engine.getState().pieces['piece-b']).toEqual(
      before.pieces['piece-b'],
    );
  });

  it('uses the same assist method for a requested loose piece and no-ops once placed', () => {
    const engine = new PuzzleEngine(layout());

    expect(engine.assistPiece('piece-b')?.pieceId).toBe('piece-b');
    const afterFirstAssist = engine.getSnapshot();

    expect(engine.assistPiece('piece-b')).toBeNull();
    expect(engine.getSnapshot()).toEqual(afterFirstAssist);
  });

  it('preserves a reachable partial overhang when a loose piece is released', () => {
    const engine = new PuzzleEngine(layout());

    engine.takeFromTray('piece-a', { x: -12, y: 68 });
    const result = engine.releasePiece('piece-a');

    expect(result.snapped).toBe(false);
    expect(result.position).toEqual({ x: -12, y: 68 });
    expect(engine.getState().pieces['piece-a'].position).toEqual({
      x: -12,
      y: 68,
    });
  });

  it('keeps the centre of a loose piece reachable instead of allowing full disappearance', () => {
    const engine = new PuzzleEngine(layout());

    engine.takeFromTray('piece-a', { x: -500, y: 500 });
    expect(engine.releasePiece('piece-a').position).toEqual({ x: -15, y: 70 });

    engine.movePiece('piece-a', { x: 500, y: -500 });
    expect(engine.releasePiece('piece-a').position).toEqual({ x: 85, y: -10 });
  });

  it('snaps an edge-overhanging piece exactly and keeps the locked piece immovable', () => {
    // piece-a's correct position sits on the board edge so a release that
    // still overhangs can be inside the piece-scaled snap radius.
    const engine = new PuzzleEngine(
      layout(100, 80, [piece('piece-a', 0, 0, 10), piece('piece-b', 1, 55, 10)]),
    );

    engine.takeFromTray('piece-a', { x: -6, y: 10 });
    const snapped = engine.releasePiece('piece-a');

    expect(snapped).toMatchObject({
      snapped: true,
      locked: true,
      position: { x: 0, y: 10 },
    });

    engine.movePiece('piece-a', { x: -500, y: 500 });
    const lockedRelease = engine.releasePiece('piece-a');

    expect(lockedRelease).toMatchObject({
      snapped: true,
      locked: true,
      position: { x: 0, y: 10 },
    });
    expect(engine.getState().pieces['piece-a']).toMatchObject({
      locked: true,
      position: { x: 0, y: 10 },
    });
  });

  it('recovers fully offscreen loose pieces while restoring a snapshot', () => {
    const initial = new PuzzleEngine(layout());
    const snapshot = initial.getSnapshot();
    snapshot.pieces['piece-a'] = {
      ...snapshot.pieces['piece-a'],
      inTray: false,
      position: { x: -100, y: 900 },
    };

    const restored = PuzzleEngine.fromSnapshot(snapshot);

    expect(restored.getState().pieces['piece-a'].position).toEqual({
      x: -15,
      y: 70,
    });
    expect(restored.getState().selectedPieceId).toBeNull();
    expect(restored.getState().snapFeedback).toBeNull();
  });

  it('returns every loose piece to its stable tray slot without moving locked pieces', () => {
    const puzzleLayout = layout();
    const engine = new PuzzleEngine(puzzleLayout);
    const looseTraySlot = engine.getState().pieces['piece-b'].traySlot;

    engine.takeFromTray('piece-a', { x: 10, y: 10 });
    engine.releasePiece('piece-a');
    engine.takeFromTray('piece-b', { x: 88, y: 32 });
    engine.releasePiece('piece-b');

    engine.returnAllLoosePiecesToTray();

    const state = engine.getState();
    expect(state.pieces['piece-a']).toMatchObject({
      locked: true,
      inTray: false,
      position: { x: 10, y: 10 },
    });
    expect(state.pieces['piece-b']).toMatchObject({
      locked: false,
      inTray: true,
      traySlot: looseTraySlot,
      position: getTraySlotPosition(
        puzzleLayout,
        looseTraySlot,
        puzzleLayout.pieces[1],
      ),
    });
    expect(state.selectedPieceId).toBeNull();
    expect(state.snapFeedback).toBeNull();
  });

  it('preserves piece IDs, tray slots, and recoverable positions across resize', () => {
    const cutDescriptor = {
      cutterId: 'classic' as const,
      version: 1,
      seed: 'stable-cut',
      rows: 1,
      columns: 2,
    };
    const initialLayout = { ...layout(), cutDescriptor };
    const engine = new PuzzleEngine(initialLayout);
    const traySlot = engine.getState().pieces['piece-a'].traySlot;
    const waitingTraySlot = engine.getState().pieces['piece-b'].traySlot;
    engine.takeFromTray('piece-a', { x: 65, y: 55 });
    engine.releasePiece('piece-a');

    const resizedPieces = initialLayout.pieces.map((definition) => ({
      ...definition,
      path: definition.path,
      bounds: {
        x: definition.bounds.x * 2,
        y: definition.bounds.y * 2,
        width: definition.bounds.width * 2,
        height: definition.bounds.height * 2,
      },
      correctPosition: {
        x: definition.correctPosition.x * 2,
        y: definition.correctPosition.y * 2,
      },
    }));
    const resizedLayout = {
      ...layout(200, 160, resizedPieces),
      cutDescriptor: { ...cutDescriptor },
    };
    engine.relayout(resizedLayout);

    const state = engine.getState();
    expect(Object.keys(state.pieces)).toEqual(['piece-a', 'piece-b']);
    expect(state.pieces['piece-a'].traySlot).toBe(traySlot);
    expect(state.pieces['piece-a'].position).toEqual({ x: 130, y: 110 });
    expect(state.pieces['piece-b'].traySlot).toBe(waitingTraySlot);
    expect(state.pieces['piece-b'].position).toEqual(
      getTraySlotPosition(
        resizedLayout,
        waitingTraySlot,
        resizedLayout.pieces[1],
      ),
    );
    expect(state.layout.cutDescriptor).toEqual(cutDescriptor);
    expect(state).toMatchObject({ status: 'playing', moveCount: 1 });
  });

  it('counts only active foreground intervals and freezes time at completion', () => {
    vi.useFakeTimers();
    const engine = new PuzzleEngine(
      layout(100, 80, [piece('piece-a', 0, 10, 10)]),
    );

    engine.start(1_000);
    expect(engine.getElapsedMs(3_000)).toBe(2_000);

    engine.pause(3_000);
    expect(engine.getElapsedMs(30_000)).toBe(2_000);
    expect(engine.getState().activeStartedAt).toBeNull();

    engine.resume(8_000);
    expect(engine.getElapsedMs(9_500)).toBe(3_500);

    vi.setSystemTime(10_000);
    engine.assistPiece();

    expect(engine.getState()).toMatchObject({
      status: 'completed',
      completedAt: 10_000,
      activeElapsedMs: 4_000,
      activeStartedAt: null,
    });
    expect(engine.getElapsedMs(50_000)).toBe(4_000);
    vi.useRealTimers();
  });
});
