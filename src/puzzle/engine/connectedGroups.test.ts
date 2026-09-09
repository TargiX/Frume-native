import { describe, expect, it } from 'vitest';
import { OrganicCutter } from '../cutters/organic/OrganicCutter';
import { ClassicCutter } from '../cutters/classic/ClassicCutter';
import { PuzzleEngine } from './PuzzleEngine';
import {
  deserializePuzzleSession,
  serializePuzzleSession,
} from '../persistence/PuzzleSessionPersistence';

async function setup() {
  const layout = await ClassicCutter.generate(
    { uri: 'file:///photo.jpg', width: 600, height: 600 },
    { difficulty: '3x3', boardMaxWidth: 300, boardMaxHeight: 300 },
  );
  const engine = new PuzzleEngine(layout);
  const [a, b] = layout.pieces;
  const offset = { x: 40, y: 70 };
  engine.takeFromTray(a.id, {
    x: a.correctPosition.x + offset.x,
    y: a.correctPosition.y + offset.y,
  });
  engine.takeFromTray(b.id, {
    x: b.correctPosition.x + offset.x + 3,
    y: b.correctPosition.y + offset.y + 2,
  });
  return { engine, layout, a, b };
}
describe('connected loose pieces', () => {
  it('joins adjacent pieces away from the target and seats the whole group later', async () => {
    const { engine, a, b } = await setup();
    expect(engine.releasePiece(b.id)).toMatchObject({
      snapped: true,
      locked: false,
      connectedWithNeighbor: true,
    });
    expect(engine.getConnectedPieceIds(a.id)).toEqual([a.id, b.id]);
    engine.movePiece(a.id, a.correctPosition);
    expect(engine.getState().pieces[b.id].position).toEqual(b.correctPosition);
    engine.releasePiece(a.id);
    expect(engine.getState().pieces[a.id].locked).toBe(true);
    expect(engine.getState().pieces[b.id].locked).toBe(true);
  });
  it('round-trips the connection through durable storage and keeps it on relayout', async () => {
    const { engine, a, b, layout } = await setup();
    engine.releasePiece(b.id);
    engine.pause();
    const saved = deserializePuzzleSession(
      serializePuzzleSession({
        cutterId: 'classic',
        difficulty: '3x3',
        engine: engine.getSnapshot(),
      }),
    );
    expect(saved).not.toBeNull();
    const restored = PuzzleEngine.fromSnapshot(saved!.engine);
    const bigger = await ClassicCutter.generate(layout.image, {
      difficulty: '3x3',
      boardMaxWidth: 450,
      boardMaxHeight: 450,
    });
    restored.relayout(bigger);
    expect(restored.getConnectedPieceIds(a.id)).toEqual([a.id, b.id]);
    restored.movePiece(a.id, bigger.pieces[0].correctPosition);
    restored.releasePiece(a.id);
    expect(restored.getState().pieces[b.id].locked).toBe(true);
  });
  it('rejects a saved connection whose pieces no longer share an aligned offset', async () => {
    const { engine, b } = await setup();
    engine.releasePiece(b.id);
    const snapshot = engine.getSnapshot();
    snapshot.pieces[b.id] = {
      ...snapshot.pieces[b.id],
      position: {
        x: snapshot.pieces[b.id].position.x + 20,
        y: snapshot.pieces[b.id].position.y,
      },
    };
    expect(
      deserializePuzzleSession(
        serializePuzzleSession({
          cutterId: 'classic',
          difficulty: '3x3',
          engine: snapshot,
        }),
      ),
    ).toBeNull();
  });
  it('rejects a dangling group instead of restoring an unmovable connection', async () => {
    const { engine, a } = await setup();
    const snapshot = engine.getSnapshot();
    snapshot.pieces[a.id] = { ...snapshot.pieces[a.id], groupId: a.id };
    expect(
      deserializePuzzleSession(
        serializePuzzleSession({
          cutterId: 'classic',
          difficulty: '3x3',
          engine: snapshot,
        }),
      ),
    ).toBeNull();
  });
  it('keeps the relative positions when rescuing an off-screen group', async () => {
    const { engine, a, b } = await setup();
    engine.releasePiece(b.id);
    engine.movePiece(a.id, { x: -1000, y: 1000 });
    engine.recoverLoosePieces();
    const first = engine.getState().pieces[a.id],
      second = engine.getState().pieces[b.id];
    expect(second.position.x - first.position.x).toBeCloseTo(
      b.correctPosition.x - a.correctPosition.x,
    );
    expect(second.position.y - first.position.y).toBeCloseTo(
      b.correctPosition.y - a.correctPosition.y,
    );
  });
  it('returns a group to separate permanent tray slots', async () => {
    const { engine, a, b } = await setup();
    engine.releasePiece(b.id);
    engine.returnToTray(a.id);
    for (const id of [a.id, b.id])
      expect(engine.getState().pieces[id]).toMatchObject({
        inTray: true,
        locked: false,
        groupId: undefined,
      });
  });
  it.each([ClassicCutter, OrganicCutter])(
    'keeps every piece recoverable through repeated moves, joins and rotation with $meta.id',
    async (cutter) => {
      let layout = await cutter.generate(
        { uri: 'file:///roundtrip.jpg', width: 900, height: 600 },
        { difficulty: '4x4', boardMaxWidth: 360, boardMaxHeight: 240 },
      );
      let engine = new PuzzleEngine(layout);
      for (let step = 0; step < 48; step += 1) {
        const piece = layout.pieces[(step * 7) % layout.pieces.length];
        const state = engine.getState().pieces[piece.id];
        if (!state.locked) {
          const position = {
            x: piece.correctPosition.x + 45,
            y: piece.correctPosition.y + 45,
          };
          if (state.inTray) engine.takeFromTray(piece.id, position);
          else engine.movePiece(piece.id, position);
          engine.releasePiece(piece.id);
          if (step % 5 === 0) engine.returnToTray(piece.id);
        }
        if (step % 8 === 0) {
          layout = await cutter.generate(layout.image, {
            difficulty: '4x4',
            boardMaxWidth: step % 16 === 0 ? 480 : 360,
            boardMaxHeight: 320,
            cutDescriptor: layout.cutDescriptor,
          });
          engine.relayout(layout);
        }
        const saved = deserializePuzzleSession(
          serializePuzzleSession({
            cutterId: cutter.meta.id,
            difficulty: '4x4',
            engine: engine.getSnapshot(),
          }),
        );
        expect(saved, `step ${step}`).not.toBeNull();
        engine = PuzzleEngine.fromSnapshot(saved!.engine);
        const pieces = Object.values(engine.getState().pieces);
        expect(pieces).toHaveLength(16);
        expect(new Set(pieces.map((item) => item.traySlot)).size).toBe(16);
        expect(
          pieces.every(
            (item) =>
              Number.isFinite(item.position.x) &&
              Number.isFinite(item.position.y) &&
              !(item.locked && item.inTray),
          ),
        ).toBe(true);
      }
    },
  );
  it('does not connect matching offsets when the pieces are not neighbors', async () => {
    const { engine, layout, a, b } = await setup();
    engine.returnToTray(b.id);
    const far = layout.pieces[8];
    engine.takeFromTray(far.id, {
      x: far.correctPosition.x + 40,
      y: far.correctPosition.y + 70,
    });
    engine.releasePiece(a.id);
    expect(engine.getConnectedPieceIds(a.id)).toEqual([a.id]);
  });
});
