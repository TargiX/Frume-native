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
    // The waiting row closes the gap the assisted piece left.
    expect(engine.getState().pieces['piece-b']).toEqual({
      ...before.pieces['piece-b'],
      traySlot: 0,
      position: getTraySlotPosition(puzzleLayout, 0, puzzleLayout.pieces[1]),
      rotation: 1.6,
    });
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

    engine.takeFromTray('piece-a', { x: 10, y: 10 });
    engine.releasePiece('piece-a');
    engine.takeFromTray('piece-b', { x: 88, y: 32 });
    engine.releasePiece('piece-b');
    // Released pieces keep the slot the compacted row gave them.
    const looseTraySlot = engine.getState().pieces['piece-b'].traySlot;

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
    engine.takeFromTray('piece-a', { x: 65, y: 55 });
    engine.releasePiece('piece-a');
    const traySlot = engine.getState().pieces['piece-a'].traySlot;
    const waitingTraySlot = engine.getState().pieces['piece-b'].traySlot;

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

describe('PuzzleEngine tray filter', () => {
  function gridPiece(
    row: number,
    col: number,
    columns: number,
  ): PuzzlePieceDefinition {
    const x = col * 30;
    const y = row * 20;
    return {
      id: `p-${row}-${col}`,
      index: row * columns + col,
      row,
      col,
      path: `M ${x} ${y} L ${x + 30} ${y} L ${x + 30} ${y + 20} L ${x} ${y + 20} Z`,
      bounds: { x, y, width: 30, height: 20 },
      clipRegion: { x: 0, y: 0, width: 0.3, height: 0.25 },
      correctPosition: { x, y },
      correctRotation: 0,
      neighborIds: [],
    };
  }

  function gridLayout(rows = 3, columns = 3): PuzzleLayout {
    const pieces: PuzzlePieceDefinition[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        pieces.push(gridPiece(row, col, columns));
      }
    }
    return {
      cutterId: 'classic',
      image: {
        uri: 'https://example.test/puzzle.jpg',
        width: 1200,
        height: 800,
      },
      boardSize: { width: columns * 30, height: rows * 20 },
      pieces,
    };
  }

  function sortedSlots(engine: PuzzleEngine): number[] {
    return Object.values(engine.getState().pieces)
      .map((piece) => piece.traySlot)
      .sort((a, b) => a - b);
  }

  it('gathers edge pieces ahead of interior ones without losing slots', () => {
    const puzzleLayout = gridLayout();
    const engine = new PuzzleEngine(puzzleLayout);

    engine.setTrayFilter('edges');

    const state = engine.getState();
    expect(state.trayFilter).toBe('edges');
    const centre = state.pieces['p-1-1'];
    expect(centre.traySlot).toBe(8);
    puzzleLayout.pieces.forEach((definition) => {
      const piece = state.pieces[definition.id];
      expect(piece.inTray).toBe(true);
      expect(piece.position).toEqual(
        getTraySlotPosition(puzzleLayout, piece.traySlot, definition),
      );
      if (definition.id !== 'p-1-1') {
        expect(piece.traySlot).toBeLessThan(8);
      }
    });
    expect(sortedSlots(engine)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('leaves the dealt order untouched when the filter is cleared', () => {
    const engine = new PuzzleEngine(gridLayout());
    engine.setTrayFilter('edges');
    const filtered = engine.getState().pieces;

    engine.setTrayFilter('all');

    expect(engine.getState().trayFilter).toBe('all');
    expect(engine.getState().pieces).toEqual(filtered);
  });

  it('rejoins a returned edge piece into the gathered run', () => {
    const puzzleLayout = gridLayout();
    const engine = new PuzzleEngine(puzzleLayout);
    engine.setTrayFilter('edges');
    // The centre is filtered to the last slot; an edge piece leaves the tray.
    engine.takeFromTray('p-0-0', { x: 60, y: 40 });

    engine.returnToTray('p-0-0');

    const state = engine.getState();
    expect(state.pieces['p-0-0'].inTray).toBe(true);
    expect(state.pieces['p-0-0'].traySlot).toBeLessThan(8);
    expect(state.pieces['p-1-1'].traySlot).toBe(8);
    expect(sortedSlots(engine)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('keeps the visible run ahead of hidden pieces when loose pieces return', () => {
    const engine = new PuzzleEngine(gridLayout());
    engine.setTrayFilter('edges');
    engine.takeFromTray('p-1-1', { x: 45, y: 30 });
    engine.takeFromTray('p-0-0', { x: 60, y: 40 });

    engine.returnAllLoosePiecesToTray();

    const state = engine.getState();
    expect(state.pieces['p-1-1'].traySlot).toBe(8);
    expect(sortedSlots(engine)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('restores a filtered session showing every remaining piece', () => {
    const engine = new PuzzleEngine(gridLayout());
    engine.setTrayFilter('edges');

    const restored = PuzzleEngine.fromSnapshot(engine.getSnapshot());

    expect(restored.getState().trayFilter).toBe('all');
    expect(restored.getState().pieces).toEqual(engine.getSnapshot().pieces);
  });

  it('clears the filter when the puzzle resets', () => {
    const engine = new PuzzleEngine(gridLayout());
    engine.setTrayFilter('edges');

    engine.reset();

    expect(engine.getState().trayFilter).toBe('all');
    expect(
      Object.values(engine.getState().pieces).every((piece) => piece.inTray),
    ).toBe(true);
  });
});

describe('PuzzleEngine piece rotation', () => {
  function rotatableLayout(): PuzzleLayout {
    return { ...layout(), piecesRotatable: true };
  }

  it('deals pieces upright when the layout is not rotatable', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const engine = new PuzzleEngine(layout());

    engine.takeFromTray('piece-a', { x: 40, y: 40 });
    engine.rotatePiece('piece-a');

    expect(engine.getState().pieces['piece-a'].rotation).toBe(0);
    random.mockRestore();
  });

  it('deals a quarter turn on tray exit and rotates a loose piece by 90°', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const engine = new PuzzleEngine(rotatableLayout());

    engine.takeFromTray('piece-a', { x: 40, y: 40 });
    expect(engine.getState().pieces['piece-a'].rotation).toBe(270);

    engine.rotatePiece('piece-a');
    expect(engine.getState().pieces['piece-a'].rotation).toBe(0);
    engine.rotatePiece('piece-a');
    expect(engine.getState().pieces['piece-a'].rotation).toBe(90);
    random.mockRestore();
  });

  it('refuses to seat a sideways piece inside the snap radius until upright', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.75);
    const engine = new PuzzleEngine(rotatableLayout());
    const target = layout().pieces[0].correctPosition;

    engine.takeFromTray('piece-a', { x: target.x, y: target.y });
    expect(engine.getState().pieces['piece-a'].rotation).toBe(270);

    const refused = engine.releasePiece('piece-a');
    expect(refused.snapped).toBe(false);
    expect(engine.getState().pieces['piece-a'].locked).toBe(false);

    engine.rotatePiece('piece-a');
    const seated = engine.releasePiece('piece-a');
    expect(seated.snapped).toBe(true);
    expect(engine.getState().pieces['piece-a']).toMatchObject({
      locked: true,
      rotation: 0,
      position: target,
    });
    random.mockRestore();
  });

  it('does not let a sideways piece join a loose group', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const puzzleLayout = layout(100, 80, [
      { ...piece('piece-a', 0, 10, 10), neighborIds: ['piece-b'] },
      { ...piece('piece-b', 1, 55, 10), neighborIds: ['piece-a'] },
    ]);
    const engine = new PuzzleEngine({
      ...puzzleLayout,
      piecesRotatable: true,
    });

    // piece-b waits loose on the table — never released, so it does not seat.
    // Both pieces rest at the same offset from their targets, which is how a
    // release recognizes they are neighbours; piece-a is too far from its own
    // target to seat on its own.
    engine.takeFromTray('piece-b', { x: 59, y: 40 });
    engine.takeFromTray('piece-a', { x: 14, y: 40 });
    expect(engine.getState().pieces['piece-a'].rotation).toBe(180);

    const result = engine.releasePiece('piece-a');

    expect(result.snapped).toBe(false);
    expect(engine.getState().pieces['piece-a'].groupId).toBeUndefined();
    expect(engine.getState().pieces['piece-b'].groupId).toBeUndefined();

    // The same release joins once both pieces face the right way: the deal
    // turned each of them 180°, so each needs two quarter turns.
    engine.rotatePiece('piece-a');
    engine.rotatePiece('piece-a');
    engine.rotatePiece('piece-b');
    engine.rotatePiece('piece-b');
    expect(engine.getState().pieces['piece-b'].rotation).toBe(0);
    const joined = engine.releasePiece('piece-a');
    expect(joined.connectedWithNeighbor).toBe(true);
    const groupId = engine.getState().pieces['piece-a'].groupId;
    expect(groupId).toBeDefined();
    expect(engine.getState().pieces['piece-b'].groupId).toBe(groupId);
    random.mockRestore();
  });

  it('does not pull a sideways neighbour into a group and square it', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const puzzleLayout = layout(100, 80, [
      { ...piece('piece-a', 0, 10, 10), neighborIds: ['piece-b'] },
      { ...piece('piece-b', 1, 55, 10), neighborIds: ['piece-a'] },
    ]);
    const engine = new PuzzleEngine({
      ...puzzleLayout,
      piecesRotatable: true,
    });

    // Both pieces rest at the same offset from their targets, so a release
    // recognises them as neighbours. piece-b comes out turned (random 0 ->
    // no extra turn; rotate it once by hand instead of relying on the deal).
    engine.takeFromTray('piece-b', { x: 59, y: 40 });
    engine.takeFromTray('piece-a', { x: 14, y: 40 });
    engine.rotatePiece('piece-b');
    expect(engine.getState().pieces['piece-b'].rotation).toBe(90);
    expect(engine.getState().pieces['piece-a'].rotation).toBe(0);

    const result = engine.releasePiece('piece-a');

    // The dragged piece is upright but its neighbour is not: turning the
    // neighbour upright is part of the solve, so no join may happen and the
    // neighbour must keep the rotation the player left it with.
    expect(result.connectedWithNeighbor).toBe(false);
    expect(engine.getState().pieces['piece-a'].groupId).toBeUndefined();
    expect(engine.getState().pieces['piece-b'].groupId).toBeUndefined();
    expect(engine.getState().pieces['piece-b'].rotation).toBe(90);
    random.mockRestore();
  });

  it('cannot rotate a piece once it has joined a group', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const puzzleLayout = layout(100, 80, [
      { ...piece('piece-a', 0, 10, 10), neighborIds: ['piece-b'] },
      { ...piece('piece-b', 1, 55, 10), neighborIds: ['piece-a'] },
    ]);
    const engine = new PuzzleEngine({
      ...puzzleLayout,
      piecesRotatable: true,
    });

    engine.takeFromTray('piece-b', { x: 59, y: 40 });
    engine.takeFromTray('piece-a', { x: 14, y: 40 });
    engine.releasePiece('piece-a');
    expect(engine.getState().pieces['piece-a'].groupId).toBeDefined();

    engine.rotatePiece('piece-a');
    expect(engine.getState().pieces['piece-a'].rotation).toBe(0);
    random.mockRestore();
  });

  it('never rotates a tray piece, a grouped piece, or a locked one', () => {
    const engine = new PuzzleEngine(rotatableLayout());

    engine.rotatePiece('piece-a');
    expect(engine.getState().pieces['piece-a'].inTray).toBe(true);
    expect(Math.abs(engine.getState().pieces['piece-a'].rotation)).toBe(1.6);

    engine.assistPiece('piece-a');
    engine.rotatePiece('piece-a');
    expect(engine.getState().pieces['piece-a'].rotation).toBe(0);
  });

  it('seats a sideways piece through Assist without leaving it rotated', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const engine = new PuzzleEngine(rotatableLayout());

    engine.takeFromTray('piece-a', { x: 40, y: 40 });
    expect(engine.getState().pieces['piece-a'].rotation).toBe(180);

    const result = engine.assistPiece('piece-a');

    expect(result?.snapped).toBe(true);
    expect(engine.getState().pieces['piece-a']).toMatchObject({
      locked: true,
      rotation: 0,
    });
    random.mockRestore();
  });

  it('keeps the rotation challenge across a reset', () => {
    const engine = new PuzzleEngine(rotatableLayout());

    engine.reset();

    expect(engine.getState().layout.piecesRotatable).toBe(true);
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    engine.takeFromTray('piece-a', { x: 40, y: 40 });
    expect(engine.getState().pieces['piece-a'].rotation).toBe(180);
    random.mockRestore();
  });
});
