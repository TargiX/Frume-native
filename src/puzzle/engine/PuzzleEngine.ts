import type {
  PieceRuntimeState,
  PuzzleEngineListener,
  PuzzleEngineSnapshot,
  PuzzleEngineState,
  SnapResult,
} from '../types/engine';
import type { Point } from '../types/geometry';
import type { PuzzleLayout, PuzzlePieceDefinition } from '../types/layout';
import { resolveSnapPosition, shouldSnap } from './snap';
import { buildShuffledPieceStates } from './shuffle';
import { getTraySlotPosition } from './tray';

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Keeps a loose piece's centre on the logical play surface. This lets as much
 * as half the piece rest naturally beyond a board edge while ensuring it can
 * never disappear completely. Gesture coordinates can briefly travel much
 * farther, especially when a drag is interrupted by an OS gesture or app
 * backgrounding, so non-finite input falls back to the piece's target first.
 */
function recoverablePosition(
  layout: PuzzleLayout,
  definition: PuzzlePieceDefinition,
  position: Point,
): Point {
  const fallback = definition.correctPosition;
  const x = Number.isFinite(position.x) ? position.x : fallback.x;
  const y = Number.isFinite(position.y) ? position.y : fallback.y;
  const halfWidth = Math.max(0, definition.bounds.width) / 2;
  const halfHeight = Math.max(0, definition.bounds.height) / 2;

  return {
    x: clamp(x, -halfWidth, Math.max(-halfWidth, layout.boardSize.width - halfWidth)),
    y: clamp(
      y,
      -halfHeight,
      Math.max(-halfHeight, layout.boardSize.height - halfHeight),
    ),
  };
}

function clonePieces(
  pieces: Record<string, PieceRuntimeState>,
): Record<string, PieceRuntimeState> {
  return Object.fromEntries(
    Object.entries(pieces).map(([pieceId, piece]) => [
      pieceId,
      {
        ...piece,
        position: { ...piece.position },
      },
    ]),
  );
}

export class PuzzleEngine {
  private state: PuzzleEngineState;
  private readonly listeners = new Set<PuzzleEngineListener>();

  constructor(layout: PuzzleLayout, snapshot?: PuzzleEngineSnapshot) {
    const freshPieces = buildShuffledPieceStates(layout);
    const pieces = snapshot
      ? this.normalizeRestoredPieces(layout, snapshot.pieces, freshPieces)
      : freshPieces;

    this.state = {
      status: snapshot?.status ?? 'ready',
      layout,
      pieces,
      selectedPieceId: null,
      moveCount: snapshot?.moveCount ?? 0,
      startedAt: snapshot?.startedAt ?? null,
      completedAt: snapshot?.completedAt ?? null,
      activeElapsedMs: snapshot?.activeElapsedMs ?? 0,
      activeStartedAt: snapshot?.activeStartedAt ?? null,
      snapFeedback: null,
    };
  }

  /** Rebuilds an engine from already validated durable state. */
  static fromSnapshot(snapshot: PuzzleEngineSnapshot): PuzzleEngine {
    return new PuzzleEngine(snapshot.layout, snapshot);
  }

  clearSnapFeedback(): void {
    if (this.state.snapFeedback) {
      this.patch({ snapFeedback: null });
    }
  }

  getState(): Readonly<PuzzleEngineState> {
    return this.state;
  }

  /** Produces a detached snapshot safe to queue for asynchronous persistence. */
  getSnapshot(): PuzzleEngineSnapshot {
    return {
      status: this.state.status,
      layout: this.state.layout,
      pieces: clonePieces(this.state.pieces),
      moveCount: this.state.moveCount,
      startedAt: this.state.startedAt,
      completedAt: this.state.completedAt,
      activeElapsedMs: this.state.activeElapsedMs,
      activeStartedAt: this.state.activeStartedAt,
    };
  }

  subscribe(listener: PuzzleEngineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(now = Date.now()): void {
    if (this.state.status !== 'ready') {
      return;
    }
    this.patch({
      status: 'playing',
      startedAt: now,
      activeStartedAt: now,
    });
  }

  /** Stops active-time accounting without changing puzzle progress. */
  pause(now = Date.now()): void {
    if (
      this.state.status !== 'playing' ||
      this.state.activeStartedAt === null
    ) {
      return;
    }
    this.patch({
      activeElapsedMs:
        this.state.activeElapsedMs +
        Math.max(0, now - this.state.activeStartedAt),
      activeStartedAt: null,
    });
  }

  /** Continues active-time accounting when a paused game returns foreground. */
  resume(now = Date.now()): void {
    if (
      this.state.status !== 'playing' ||
      this.state.activeStartedAt !== null
    ) {
      return;
    }
    this.patch({ activeStartedAt: now });
  }

  /** Active solve duration at a supplied wall-clock instant. */
  getElapsedMs(now = Date.now()): number {
    return (
      this.state.activeElapsedMs +
      (this.state.status === 'playing' &&
      this.state.activeStartedAt !== null
        ? Math.max(0, now - this.state.activeStartedAt)
        : 0)
    );
  }

  selectPiece(pieceId: string | null): void {
    if (this.state.status === 'completed') {
      return;
    }
    this.patch({ selectedPieceId: pieceId });
  }

  /**
   * Lifts a piece out of the tray onto the play surface. The tray slot is kept
   * so the piece can be dropped back, and no other piece is touched — the row
   * never closes the gap.
   */
  takeFromTray(pieceId: string, position: Point): void {
    const pieceState = this.state.pieces[pieceId];
    if (!pieceState || !pieceState.inTray || pieceState.locked) {
      return;
    }

    if (this.state.status === 'ready') {
      this.start();
    }

    this.updatePiece(pieceId, { inTray: false, position, rotation: 0 });
  }

  /** Returns a piece to its own slot when it is dropped back over the tray. */
  returnToTray(pieceId: string): void {
    const pieceState = this.state.pieces[pieceId];
    const definition = this.getPieceDefinition(pieceId);
    if (!pieceState || !definition || pieceState.locked) {
      return;
    }

    this.patch({
      pieces: {
        ...this.state.pieces,
        [pieceId]: {
          ...pieceState,
          inTray: true,
          position: getTraySlotPosition(
            this.state.layout,
            pieceState.traySlot,
            definition,
          ),
          rotation: pieceState.traySlot % 2 === 0 ? 1.6 : -1.6,
        },
      },
      selectedPieceId: null,
      snapFeedback: null,
    });
  }

  /**
   * Rescue action for a cluttered or interrupted game. Solved pieces stay
   * seated; every loose piece returns to the permanent slot assigned at deal.
   */
  returnAllLoosePiecesToTray(): void {
    let changed = false;
    const pieces = { ...this.state.pieces };

    this.state.layout.pieces.forEach((definition) => {
      const current = pieces[definition.id];
      if (!current || current.locked) {
        return;
      }

      const position = getTraySlotPosition(
        this.state.layout,
        current.traySlot,
        definition,
      );
      pieces[definition.id] = {
        ...current,
        inTray: true,
        position,
        rotation: current.traySlot % 2 === 0 ? 1.6 : -1.6,
      };
      changed = true;
    });

    if (
      changed ||
      this.state.selectedPieceId !== null ||
      this.state.snapFeedback !== null
    ) {
      this.patch({
        pieces,
        selectedPieceId: null,
        snapFeedback: null,
      });
    }
  }

  /**
   * Places one loose piece without requiring a drag. Passing an ID supports
   * assistive-technology activation on a specific piece; omitting it lets the
   * puzzle menu place the next loose piece in stable cut order.
   */
  assistPiece(pieceId?: string): SnapResult | null {
    if (this.state.status === 'completed') {
      return null;
    }

    const definition = pieceId
      ? this.getPieceDefinition(pieceId)
      : this.state.layout.pieces.find((candidate) => {
          const pieceState = this.state.pieces[candidate.id];
          return pieceState && !pieceState.locked;
        });
    if (!definition) {
      return null;
    }

    const pieceState = this.state.pieces[definition.id];
    if (!pieceState || pieceState.locked) {
      return null;
    }

    if (pieceState.inTray) {
      this.takeFromTray(definition.id, definition.correctPosition);
    } else {
      this.movePiece(definition.id, definition.correctPosition);
    }

    return this.releasePiece(definition.id);
  }

  bringToFront(pieceId: string): void {
    const maxZ = Math.max(...Object.values(this.state.pieces).map((p) => p.zIndex));
    this.updatePiece(pieceId, { zIndex: maxZ + 1 });
  }

  movePiece(pieceId: string, position: Point): void {
    const pieceState = this.state.pieces[pieceId];
    const definition = this.getPieceDefinition(pieceId);
    if (!pieceState || pieceState.locked || !definition) {
      return;
    }

    if (this.state.status === 'ready') {
      this.start();
    }

    this.updatePiece(pieceId, { position });
  }

  releasePiece(pieceId: string): SnapResult {
    const pieceState = this.state.pieces[pieceId];
    const definition = this.getPieceDefinition(pieceId);
    if (!pieceState || !definition) {
      return {
        pieceId,
        snapped: false,
        locked: false,
        position: { x: 0, y: 0 },
        connectedWithNeighbor: false,
      };
    }

    if (pieceState.locked) {
      return {
        pieceId,
        snapped: true,
        locked: true,
        position: pieceState.position,
        connectedWithNeighbor: false,
      };
    }

    const snapped = shouldSnap(definition, pieceState.position);
    const position = snapped
      ? resolveSnapPosition(definition, pieceState.position)
      : recoverablePosition(this.state.layout, definition, pieceState.position);
    const connectedWithNeighbor =
      snapped && definition.neighborIds.some((id) => this.state.pieces[id]?.locked === true);

    this.updatePiece(pieceId, {
      position,
      rotation: snapped ? definition.correctRotation : pieceState.rotation,
      locked: snapped ? true : pieceState.locked,
      zIndex: snapped ? definition.index + 1 : pieceState.zIndex,
    });

    if (snapped) {
      // Nothing else moves when a piece is seated. Re-packing the remaining
      // pieces to close the gap makes every other piece jump mid-game, which
      // is disorienting and makes a piece you were about to reach for vanish.
      this.patch({
        moveCount: this.state.moveCount + 1,
        snapFeedback: {
          pieceId,
          kind: connectedWithNeighbor ? 'connect' : 'seat',
        },
      });
      this.checkCompletion();
    } else {
      this.patch({ moveCount: this.state.moveCount + 1, snapFeedback: null });
    }

    this.patch({ selectedPieceId: null });

    return {
      pieceId,
      snapped,
      locked: snapped,
      position,
      connectedWithNeighbor,
    };
  }

  reset(): void {
    this.state = {
      status: 'ready',
      layout: this.state.layout,
      pieces: buildShuffledPieceStates(this.state.layout),
      selectedPieceId: null,
      moveCount: 0,
      startedAt: null,
      completedAt: null,
      activeElapsedMs: 0,
      activeStartedAt: null,
      snapFeedback: null,
    };
    this.emit();
  }

  /** Replaces immutable geometry while preserving solved progress. */
  relayout(layout: PuzzleLayout): void {
    const shuffled = buildShuffledPieceStates(layout);
    const pieces: Record<string, PieceRuntimeState> = {};
    const scaleX = layout.boardSize.width / this.state.layout.boardSize.width;
    const scaleY = layout.boardSize.height / this.state.layout.boardSize.height;

    layout.pieces.forEach((definition) => {
      const current = this.state.pieces[definition.id];
      const next = shuffled[definition.id];
      if (!next) {
        return;
      }

      if (current?.locked) {
        pieces[definition.id] = {
          pieceId: definition.id,
          position: definition.correctPosition,
          rotation: definition.correctRotation,
          locked: true,
          zIndex: definition.index + 1,
          inTray: false,
          traySlot: current.traySlot,
        };
        return;
      }

      if (!current) {
        pieces[definition.id] = next;
        return;
      }

      // A piece still in the tray returns to its own slot at the new size; one
      // already on the surface keeps where the player left it, rescaled.
      // Re-shuffling here would destroy the arrangement on every rotation.
      pieces[definition.id] = current.inTray
        ? {
            ...current,
            position: getTraySlotPosition(layout, current.traySlot, definition),
          }
        : {
            ...current,
            position: recoverablePosition(layout, definition, {
              x: current.position.x * scaleX,
              y: current.position.y * scaleY,
            }),
          };
    });

    this.state = {
      ...this.state,
      layout,
      pieces,
      selectedPieceId: null,
      snapFeedback: null,
    };
    this.emit();
  }

  isComplete(): boolean {
    return this.state.status === 'completed';
  }

  /**
   * Repairs positions after an interrupted gesture without discarding progress.
   * Tray pieces also return to their permanent slots, while solved pieces are
   * deliberately untouched.
   */
  recoverLoosePieces(): void {
    let changed = false;
    const pieces = { ...this.state.pieces };

    this.state.layout.pieces.forEach((definition) => {
      const current = pieces[definition.id];
      if (!current || current.locked) {
        return;
      }
      const position = current.inTray
        ? getTraySlotPosition(this.state.layout, current.traySlot, definition)
        : recoverablePosition(this.state.layout, definition, current.position);

      if (
        position.x !== current.position.x ||
        position.y !== current.position.y
      ) {
        pieces[definition.id] = { ...current, position };
        changed = true;
      }
    });

    if (
      changed ||
      this.state.selectedPieceId !== null ||
      this.state.snapFeedback !== null
    ) {
      this.patch({
        pieces,
        selectedPieceId: null,
        snapFeedback: null,
      });
    }
  }

  private normalizeRestoredPieces(
    layout: PuzzleLayout,
    persisted: Record<string, PieceRuntimeState>,
    fallbacks: Record<string, PieceRuntimeState>,
  ): Record<string, PieceRuntimeState> {
    const pieces: Record<string, PieceRuntimeState> = {};

    layout.pieces.forEach((definition) => {
      const current = persisted[definition.id] ?? fallbacks[definition.id];
      if (!current) {
        return;
      }

      if (current.locked) {
        pieces[definition.id] = {
          ...current,
          pieceId: definition.id,
          position: { ...definition.correctPosition },
          rotation: definition.correctRotation,
          inTray: false,
        };
        return;
      }

      pieces[definition.id] = {
        ...current,
        pieceId: definition.id,
        position: current.inTray
          ? getTraySlotPosition(layout, current.traySlot, definition)
          : recoverablePosition(layout, definition, current.position),
      };
    });

    return pieces;
  }

  private getPieceDefinition(pieceId: string) {
    return this.state.layout.pieces.find((piece) => piece.id === pieceId);
  }

  private checkCompletion(): void {
    const allLocked = this.state.layout.pieces.every(
      (piece) => this.state.pieces[piece.id]?.locked,
    );
    if (allLocked) {
      const completedAt = Date.now();
      this.patch({
        status: 'completed',
        completedAt,
        activeElapsedMs: this.getElapsedMs(completedAt),
        activeStartedAt: null,
        selectedPieceId: null,
      });
    }
  }

  private updatePiece(pieceId: string, patch: Partial<PieceRuntimeState>): void {
    const current = this.state.pieces[pieceId];
    if (!current) {
      return;
    }
    this.patch({
      pieces: {
        ...this.state.pieces,
        [pieceId]: { ...current, ...patch },
      },
    });
  }

  private patch(partial: Partial<PuzzleEngineState>): void {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  private emit(): void {
    const snapshot = this.getState();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
