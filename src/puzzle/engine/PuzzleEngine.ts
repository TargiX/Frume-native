import type {
  PieceRuntimeState,
  PuzzleEngineListener,
  PuzzleEngineSnapshot,
  PuzzleEngineState,
  SnapResult,
} from "../types/engine";
import type { Point } from "../types/geometry";
import type { PuzzleLayout, PuzzlePieceDefinition } from "../types/layout";
import { shouldSnap } from "./snap";
import { buildShuffledPieceStates } from "./shuffle";
import { getTraySlotPosition } from "./tray";

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
    x: clamp(
      x,
      -halfWidth,
      Math.max(-halfWidth, layout.boardSize.width - halfWidth),
    ),
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
      status: snapshot?.status ?? "ready",
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
    if (this.state.status !== "ready") {
      return;
    }
    this.patch({
      status: "playing",
      startedAt: now,
      activeStartedAt: now,
    });
  }

  /** Stops active-time accounting without changing puzzle progress. */
  pause(now = Date.now()): void {
    if (
      this.state.status !== "playing" ||
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
      this.state.status !== "playing" ||
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
      (this.state.status === "playing" && this.state.activeStartedAt !== null
        ? Math.max(0, now - this.state.activeStartedAt)
        : 0)
    );
  }

  selectPiece(pieceId: string | null): void {
    if (this.state.status === "completed") {
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

    if (this.state.status === "ready") {
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

    const pieces = { ...this.state.pieces };
    for (const id of this.getConnectedPieceIds(pieceId)) {
      const current = pieces[id];
      const def = this.getPieceDefinition(id)!;
      pieces[id] = {
        ...current,
        groupId: undefined,
        inTray: true,
        position: getTraySlotPosition(this.state.layout, current.traySlot, def),
        rotation: current.traySlot % 2 === 0 ? 1.6 : -1.6,
      };
    }
    this.patch({ pieces, selectedPieceId: null, snapFeedback: null });
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
        groupId: undefined,
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
    if (this.state.status === "completed") {
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
    const maxZ = Math.max(
      ...Object.values(this.state.pieces).map((p) => p.zIndex),
    );
    const pieces = { ...this.state.pieces };
    this.getConnectedPieceIds(pieceId).forEach((id, index) => {
      pieces[id] = { ...pieces[id], zIndex: maxZ + index + 1 };
    });
    this.patch({ pieces });
  }

  movePiece(pieceId: string, position: Point): void {
    const pieceState = this.state.pieces[pieceId];
    const definition = this.getPieceDefinition(pieceId);
    if (!pieceState || pieceState.locked || !definition) {
      return;
    }

    if (this.state.status === "ready") {
      this.start();
    }

    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
    const delta = {
      x: position.x - pieceState.position.x,
      y: position.y - pieceState.position.y,
    };
    const pieces = { ...this.state.pieces };
    for (const id of this.getConnectedPieceIds(pieceId)) {
      const current = pieces[id];
      pieces[id] = {
        ...current,
        position: {
          x: current.position.x + delta.x,
          y: current.position.y + delta.y,
        },
      };
    }
    this.patch({ pieces });
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

    const ids = this.getConnectedPieceIds(pieceId);
    const members = new Set(ids);
    const snapped = ids.some((id) =>
      shouldSnap(this.getPieceDefinition(id)!, this.state.pieces[id].position),
    );
    const pieces = { ...this.state.pieces };
    let connectedWithNeighbor = false;
    let joined = false;
    if (snapped) {
      connectedWithNeighbor =
        ids.length > 1 ||
        ids.some((id) =>
          this.getPieceDefinition(id)!.neighborIds.some(
            (neighbor) => pieces[neighbor]?.locked,
          ),
        );
      for (const id of ids) {
        const def = this.getPieceDefinition(id)!;
        pieces[id] = {
          ...pieces[id],
          groupId: undefined,
          position: { ...def.correctPosition },
          rotation: def.correctRotation,
          locked: true,
          inTray: false,
          zIndex: def.index + 1,
        };
      }
    } else {
      // Align a whole group with a nearby, correctly adjacent loose piece.
      let match: {
        neighborId: string;
        dx: number;
        dy: number;
        distance: number;
      } | null = null;
      for (const id of ids) {
        const def = this.getPieceDefinition(id)!;
        const current = pieces[id];
        for (const neighborId of def.neighborIds) {
          const neighbor = pieces[neighborId];
          const neighborDef = this.getPieceDefinition(neighborId);
          if (
            !neighbor ||
            !neighborDef ||
            neighbor.inTray ||
            neighbor.locked ||
            members.has(neighborId)
          )
            continue;
          const dx =
            neighbor.position.x -
            neighborDef.correctPosition.x -
            (current.position.x - def.correctPosition.x);
          const dy =
            neighbor.position.y -
            neighborDef.correctPosition.y -
            (current.position.y - def.correctPosition.y);
          const distance = Math.hypot(dx, dy);
          if (
            shouldSnap(def, {
              x: def.correctPosition.x + dx,
              y: def.correctPosition.y + dy,
            }) &&
            (!match || distance < match.distance)
          )
            match = { neighborId, dx, dy, distance };
        }
      }
      if (match) {
        const otherIds = this.getConnectedPieceIds(match.neighborId);
        const groupId = [...ids, ...otherIds].sort()[0];
        for (const id of ids)
          pieces[id] = {
            ...pieces[id],
            groupId,
            rotation: 0,
            position: {
              x: pieces[id].position.x + match.dx,
              y: pieces[id].position.y + match.dy,
            },
          };
        for (const id of otherIds)
          pieces[id] = { ...pieces[id], groupId, rotation: 0 };
        joined = true;
        connectedWithNeighbor = true;
      }
    }
    this.patch({
      pieces,
      moveCount: this.state.moveCount + 1,
      selectedPieceId: null,
      snapFeedback:
        snapped || joined
          ? { pieceId, kind: connectedWithNeighbor ? "connect" : "seat" }
          : null,
    });
    if (snapped) this.checkCompletion();
    else this.recoverLoosePieces();
    // Recovery clears stale feedback; the connection itself remains meaningful.
    if (joined) this.patch({ snapFeedback: { pieceId, kind: "connect" } });
    return {
      pieceId,
      snapped: snapped || joined,
      locked: snapped,
      position: this.state.pieces[pieceId].position,
      connectedWithNeighbor,
    };
  }

  getConnectedPieceIds(pieceId: string): string[] {
    const piece = this.state.pieces[pieceId];
    if (!piece || !piece.groupId || piece.inTray || piece.locked)
      return piece ? [pieceId] : [];
    return Object.values(this.state.pieces)
      .filter(
        (other) =>
          other.groupId === piece.groupId && !other.inTray && !other.locked,
      )
      .map((other) => other.pieceId);
  }

  reset(): void {
    this.state = {
      status: "ready",
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
            position: current.groupId
              ? {
                  x:
                    definition.correctPosition.x +
                    (current.position.x -
                      this.getPieceDefinition(definition.id)!.correctPosition
                        .x) *
                      scaleX,
                  y:
                    definition.correctPosition.y +
                    (current.position.y -
                      this.getPieceDefinition(definition.id)!.correctPosition
                        .y) *
                      scaleY,
                }
              : recoverablePosition(layout, definition, {
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
    this.recoverLoosePieces();
  }

  isComplete(): boolean {
    return this.state.status === "completed";
  }

  /**
   * Repairs positions after an interrupted gesture without discarding progress.
   * Tray pieces also return to their permanent slots, while solved pieces are
   * deliberately untouched.
   */
  recoverLoosePieces(): void {
    let changed = false;
    const pieces = { ...this.state.pieces };

    const recoveredGroups = new Set<string>();
    this.state.layout.pieces.forEach((definition) => {
      const current = pieces[definition.id];
      if (current?.groupId && !current.inTray && !current.locked) {
        if (recoveredGroups.has(current.groupId)) return;
        recoveredGroups.add(current.groupId);
        const ids = this.getConnectedPieceIds(definition.id);
        let minX = -Infinity,
          maxX = Infinity,
          minY = -Infinity,
          maxY = Infinity;
        for (const id of ids) {
          const def = this.getPieceDefinition(id)!;
          const pos = pieces[id].position;
          minX = Math.max(minX, -def.bounds.width / 2 - pos.x);
          maxX = Math.min(
            maxX,
            this.state.layout.boardSize.width - def.bounds.width / 2 - pos.x,
          );
          minY = Math.max(minY, -def.bounds.height / 2 - pos.y);
          maxY = Math.min(
            maxY,
            this.state.layout.boardSize.height - def.bounds.height / 2 - pos.y,
          );
        }
        const dx = clamp(0, minX, maxX),
          dy = clamp(0, minY, maxY);
        if (dx || dy)
          for (const id of ids) {
            pieces[id] = {
              ...pieces[id],
              position: {
                x: pieces[id].position.x + dx,
                y: pieces[id].position.y + dy,
              },
            };
            changed = true;
          }
        return;
      }
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
          : current.groupId
            ? { ...current.position }
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
        status: "completed",
        completedAt,
        activeElapsedMs: this.getElapsedMs(completedAt),
        activeStartedAt: null,
        selectedPieceId: null,
      });
    }
  }

  private updatePiece(
    pieceId: string,
    patch: Partial<PieceRuntimeState>,
  ): void {
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
