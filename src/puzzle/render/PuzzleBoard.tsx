import {
  BlurMask,
  Canvas,
  Group,
  ImageShader,
  Path,
  Skia,
  type SkImage,
  type Transforms3d,
  useImage,
} from '@shopify/react-native-skia';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  makeMutable,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import {
  androidAccessibilityLiveRegion,
  useAccessibilityAnnouncement,
} from '../../accessibility';
import { Button } from '../../components/Button';
import { playPuzzlePlacementHaptic } from '../../haptics';
import { MIN_TOUCH_TARGET } from '../../theme';
import type { PuzzleEngine } from '../engine';
import { getTrayMetrics } from '../engine/tray';
import { usePieceGesture } from '../interaction';
import {
  clampOffset,
  clampScale,
  zoomAround,
  type BoardCameraBounds,
} from '../interaction/boardCamera';
import type {
  PieceRuntimeState,
  PuzzleGuideMode,
  PuzzleLayout,
  PuzzlePieceDefinition,
  PuzzleTableAppearance,
  SnapFeedback,
} from '../types';
import { BoardSurface } from './BoardSurface';
import { resolveCameraViewStyle } from './cameraViewStyle';
import {
  isPieceEntranceVisible,
  PIECE_ENTRANCE_BATCH_COUNT,
  PIECE_ENTRANCE_DURATION_MS,
  pieceEntranceBatchDelayMs,
  pieceEntranceDelayMs,
} from './boardLifecycle';
import { DrawBoardImage } from './DrawBoardImage';
import { PieceEmbossOverlay } from './PieceEmbossOverlay';
import {
  LOCKED_PIECE_SEAM_UNDERPAINT_WIDTH,
  shouldRenderPieceEmboss,
} from './pieceEmbossPolicy';
import { resolvePieceRenderTranslation } from './pieceRenderPosition';
import {
  acceptManualImageLoadRetry,
  imageLoadRetryPresentation,
} from './imageLoadRetry';
import { PUZZLE_SEAM_DISSOLVE_MS } from './revealMotion';
import { getPieceOverflowMargin } from './pieceOverflowMargin';
import { shouldAnimateProgrammaticTrayExit } from './pieceVisualTransition';
import { TrayEdgeHint } from './TrayEdgeHint';
import { resolveTrayAutoRevealScroll } from './trayAutoReveal';
import { TraySurface } from './TraySurface';
import { resolveTraySurfaceFrame } from './traySurfaceFrame';
import { PUZZLE_SURFACE_COLORS } from './surfacePalette';

type PieceVisualState = {
  x: SharedValue<number>;
  y: SharedValue<number>;
  rotation: SharedValue<number>;
  scale: SharedValue<number>;
  opacity: SharedValue<number>;
  /** Extra scale applied while the piece rests in the tray; 1 once taken out. */
  trayFactor: SharedValue<number>;
  /** Controls the tray-scroll coordinate space independently of React state. */
  trayAttached: SharedValue<boolean>;
};

/**
 * The engine values a piece's visual has already been reconciled with.
 *
 * Deliberately a separate object: the visual itself is captured by worklet
 * closures, and a captured object has every key replaced by a warn-only setter
 * in development. Bookkeeping written back onto the visual would silently do
 * nothing, leaving the reconciliation below permanently out of step with the
 * engine.
 */
type PieceEngineSync = {
  x: number;
  y: number;
  rotation: number;
  inTray: boolean;
  trayFactor: number;
};

type PieceDrawingProps = {
  definition: PuzzlePieceDefinition;
  runtime: PieceRuntimeState;
  visual: PieceVisualState;
  skiaImage: SkImage;
  boardWidth: number;
  boardHeight: number;
  showSeams: boolean;
  trayScroll: SharedValue<number>;
  trayPlacement: 'bottom' | 'right';
};

function PieceDrawing({
  definition,
  runtime,
  visual,
  skiaImage,
  boardWidth,
  boardHeight,
  showSeams,
  trayScroll,
  trayPlacement,
}: PieceDrawingProps) {
  const piecePath = useMemo(
    () => Skia.Path.MakeFromSVGString(definition.path),
    [definition.path],
  );
  const positionTransform = useDerivedValue(() => {
    const translation = resolvePieceRenderTranslation({
      locked: runtime.locked,
      visualX: visual.x.value,
      visualY: visual.y.value,
      correctX: definition.correctPosition.x,
      correctY: definition.correctPosition.y,
      trayOffsetX:
        visual.trayAttached.value && trayPlacement === 'bottom'
          ? trayScroll.value
          : 0,
      trayOffsetY:
        visual.trayAttached.value && trayPlacement === 'right'
          ? trayScroll.value
          : 0,
    });
    return [
      { translateX: translation.x },
      { translateY: translation.y },
    ];
  });
  const pieceTransform = useDerivedValue(() => [
    {
      rotate:
        ((runtime.locked
          ? definition.correctRotation
          : visual.rotation.value) *
          Math.PI) /
        180,
    },
    {
      scale:
        visual.scale.value *
        (runtime.locked ? 1 : visual.trayFactor.value),
    },
  ]);
  const center = {
    x: definition.bounds.x + definition.bounds.width / 2,
    y: definition.bounds.y + definition.bounds.height / 2,
  };

  if (!piecePath) {
    return null;
  }

  return (
    <Group opacity={visual.opacity} transform={positionTransform}>
      <Group origin={center} transform={pieceTransform}>
        {!runtime.locked ? (
          <Path
            path={piecePath}
            color="rgba(0, 0, 0, 0.42)"
            transform={[{ translateY: 2.5 }]}
          >
            <BlurMask blur={3} style="normal" />
          </Path>
        ) : null}
        {runtime.locked ? (
          <Path
            path={piecePath}
            style="stroke"
            strokeWidth={LOCKED_PIECE_SEAM_UNDERPAINT_WIDTH}
            strokeJoin="round"
          >
            <ImageShader
              image={skiaImage}
              x={0}
              y={0}
              width={boardWidth}
              height={boardHeight}
              fit="cover"
            />
          </Path>
        ) : null}
        <Path path={piecePath}>
          <ImageShader
            image={skiaImage}
            x={0}
            y={0}
            width={boardWidth}
            height={boardHeight}
            fit="cover"
          />
        </Path>
        {shouldRenderPieceEmboss({ locked: runtime.locked, showSeams }) ? (
          <PieceEmbossOverlay path={piecePath} />
        ) : null}
      </Group>
    </Group>
  );
}

type PieceGestureOverlayProps = {
  definition: PuzzlePieceDefinition;
  runtime: PieceRuntimeState;
  visual: PieceVisualState;
  engine: PuzzleEngine;
  interactive: boolean;
  trayScroll: SharedValue<number>;
  trayTop: number;
  trayLeft: number;
  trayPlacement: 'bottom' | 'right';
  trayScale: number;
  cameraScale: SharedValue<number>;
  minTrayScroll: number;
  maxTrayScroll: number;
  totalPieces: number;
  surfaceInset: number;
  surfaceInsetY: number;
  hapticsEnabled: boolean;
};

function PieceGestureOverlay({
  definition,
  runtime,
  visual,
  engine,
  interactive,
  trayScroll,
  trayTop,
  trayLeft,
  trayPlacement,
  trayScale,
  cameraScale,
  minTrayScroll,
  maxTrayScroll,
  totalPieces,
  surfaceInset,
  surfaceInsetY,
  hapticsEnabled,
}: PieceGestureOverlayProps) {
  const inTray = runtime.inTray;
  const hitWidth = Math.max(
    definition.bounds.width * (inTray ? trayScale : 1),
    MIN_TOUCH_TARGET,
  );
  const hitHeight = Math.max(
    definition.bounds.height * (inTray ? trayScale : 1),
    MIN_TOUCH_TARGET,
  );
  const hitOffsetX = (definition.bounds.width - hitWidth) / 2;
  const hitOffsetY = (definition.bounds.height - hitHeight) / 2;
  const { gesture } = usePieceGesture({
    engine,
    pieceId: definition.id,
    locked: runtime.locked || !interactive,
    inTray,
    trayPlacement,
    trayTop,
    trayLeft,
    pieceWidth: definition.bounds.width,
    pieceHeight: definition.bounds.height,
    trayScroll,
    minTrayScroll,
    maxTrayScroll,
    trayAttached: visual.trayAttached,
    trayFactor: visual.trayFactor,
    trayScale,
    cameraScale,
    positionX: visual.x,
    positionY: visual.y,
    hapticsEnabled,
  });
  const animatedStyle = useAnimatedStyle(() => ({
    left:
      visual.x.value +
      (visual.trayAttached.value && trayPlacement === 'bottom'
        ? trayScroll.value
        : 0) +
      hitOffsetX + surfaceInset,
    top:
      visual.y.value +
      (visual.trayAttached.value && trayPlacement === 'right'
        ? trayScroll.value
        : 0) +
      hitOffsetY + surfaceInsetY,
    opacity: visual.opacity.value,
    transform: [{ rotate: `${visual.rotation.value}deg` }],
  }));
  const placeWithAssistiveTechnology = useCallback(() => {
    if (!interactive) {
      return;
    }
    const result = engine.assistPiece(definition.id);
    if (!result) {
      return;
    }
    void playPuzzlePlacementHaptic(
      hapticsEnabled,
      result.connectedWithNeighbor,
    );
    const placedCount = Object.values(engine.getState().pieces).filter(
      (piece) => piece.locked,
    ).length;
    AccessibilityInfo.announceForAccessibilityWithOptions(
      `Assist placed piece ${
        definition.index + 1
      }. ${placedCount} of ${totalPieces} pieces placed.`,
      { queue: true },
    );
  }, [
    definition.id,
    definition.index,
    engine,
    hapticsEnabled,
    interactive,
    totalPieces,
  ]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        pointerEvents={runtime.locked || !interactive ? 'none' : 'auto'}
        accessible={!runtime.locked && interactive}
        accessibilityRole="button"
        accessibilityLabel={`Puzzle piece ${definition.index + 1} of ${totalPieces}${
          inTray ? ', in tray' : ', on board'
        }`}
        accessibilityHint={
          'Double tap to use Assist and place this piece in its matching position'
        }
        accessibilityState={{ disabled: runtime.locked || !interactive }}
        onAccessibilityTap={placeWithAssistiveTechnology}
        accessibilityActions={[{ name: 'activate', label: 'Place piece' }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'activate') {
            placeWithAssistiveTechnology();
          }
        }}
        style={[
          styles.pieceHitArea,
          {
            width: hitWidth,
            height: hitHeight,
            zIndex: runtime.zIndex,
          },
          animatedStyle,
        ]}
      />
    </GestureDetector>
  );
}

type PuzzleBoardProps = {
  layout: PuzzleLayout;
  pieces: Record<string, PieceRuntimeState>;
  engine: PuzzleEngine;
  /**
   * The table's usable rectangle. A magnified board is clipped to this, so it
   * fills the screen the player actually has rather than the rectangle the
   * board happens to occupy at rest.
   */
  viewportWidth?: number;
  viewportHeight?: number;
  snapFeedback: SnapFeedback | null;
  completed?: boolean;
  guideMode?: PuzzleGuideMode;
  tableAppearance?: PuzzleTableAppearance;
  /** Changes whenever the same engine starts a fresh round, such as Replay. */
  roundResetSignal?: number;
  hapticsEnabled?: boolean;
};

export function PuzzleBoard({
  layout,
  pieces,
  engine,
  viewportWidth,
  viewportHeight,
  snapFeedback,
  completed = false,
  guideMode = 'cuts',
  tableAppearance = 'felt',
  roundResetSignal = 0,
  hapticsEnabled = false,
}: PuzzleBoardProps) {
  const { boardSize, image } = layout;
  const [imageError, setImageError] = useState<string | null>(null);
  const [displayImageUri, setDisplayImageUri] = useState<string | null>(null);
  const [manualImageLoadRetries, setManualImageLoadRetries] = useState(0);
  const [imageReloadSignal, setImageReloadSignal] = useState(0);
  const imageRetryPresentation = imageLoadRetryPresentation(
    manualImageLoadRetries,
  );
  const handleImageError = useCallback(
    (_caught: Error) => {
      if (image.remoteUri && displayImageUri !== image.remoteUri) {
        setImageError(null);
        setDisplayImageUri(image.remoteUri);
        return;
      }
      setImageError('The photograph could not be loaded.');
    },
    [displayImageUri, image.remoteUri],
  );
  const skiaImage = useImage(displayImageUri, handleImageError);
  const imageStatusMessage = imageError
    ? `Photograph unavailable. ${imageRetryPresentation.guidance}`
    : skiaImage
      ? null
      : 'Loading photograph.';
  useAccessibilityAnnouncement(imageStatusMessage);
  const reduceMotion = useReducedMotion();
  const piecesOpacity = useMemo(() => makeMutable(1), []);
  const fullOpacity = useMemo(() => makeMutable(0), []);
  const trayMetrics = useMemo(() => getTrayMetrics(layout), [layout]);
  const trayPlacement = trayMetrics.placement;
  const trayScroll = useMemo(() => makeMutable(0), []);
  // The view onto the workspace. At 1 the whole thing is visible, which is how
  // every puzzle opens; past that the player is looking closer at a board whose
  // pieces are smaller than a fingertip.
  const cameraScale = useMemo(() => makeMutable(1), []);
  const cameraX = useMemo(() => makeMutable(0), []);
  const cameraY = useMemo(() => makeMutable(0), []);
  const pinchStartScale = useMemo(() => makeMutable(1), []);
  const entranceRoundRef = useRef<{
    engine: PuzzleEngine;
    signal: number;
  } | null>(null);
  const [entranceGate, setEntranceGate] = useState<{
    engine: PuzzleEngine | null;
    signal: number;
    visibleBatch: number;
  }>({ engine: null, signal: -1, visibleBatch: -1 });
  const visibleEntranceBatch =
    entranceGate.engine === engine &&
    entranceGate.signal === roundResetSignal
      ? entranceGate.visibleBatch
      : -1;
  /**
   * The shelf runs the width of the table and is centred on the board, so it
   * starts to the left of the board's own origin. Everything is drawn from this
   * origin rather than from the board's corner, which is what keeps the shelf
   * from being cut off at nought.
   */
  const surfaceOriginX = Math.max(0, -trayMetrics.left);
  const surfaceOriginY = Math.max(0, -trayMetrics.top);
  const surfaceWidth =
    Math.max(boardSize.width, trayMetrics.left + trayMetrics.width) +
    surfaceOriginX;
  const surfaceHeight =
    Math.max(boardSize.height, trayMetrics.top + trayMetrics.height) +
    surfaceOriginY;
  const surfaceInset = useMemo(
    () => getPieceOverflowMargin(layout.pieces),
    [layout.pieces],
  );
  const workspaceWidth = surfaceWidth + surfaceInset * 2;
  const workspaceHeight = surfaceHeight + surfaceInset * 2;
  // Where the board's own (0, 0) lands inside the drawn workspace.
  const originX = surfaceInset + surfaceOriginX;
  const originY = surfaceInset + surfaceOriginY;
  const traySurfaceFrame = useMemo(
    () =>
      resolveTraySurfaceFrame(
        trayMetrics,
        trayPlacement,
        surfaceInset,
        originX,
        originY,
      ),
    [originX, originY, surfaceInset, trayMetrics, trayPlacement],
  );
  const { visuals, engineSync } = useMemo(() => {
    const nextVisuals = new Map<string, PieceVisualState>();
    const nextSync = new Map<string, PieceEngineSync>();
    // Read the new engine rather than the props: a replacement engine renders
    // once paired with the outgoing puzzle's layout and pieces, and visuals
    // born from that pairing start at the previous puzzle's tray scale and
    // slots. The engine is always self-consistent.
    const engineState = engine.getState();
    const engineTrayScale = getTrayMetrics(engineState.layout).scale;

    engineState.layout.pieces.forEach((definition) => {
      const runtime = engineState.pieces[definition.id];
      if (!runtime) {
        return;
      }
      const trayFactor = runtime.inTray ? engineTrayScale : 1;
      nextVisuals.set(definition.id, {
        x: makeMutable(runtime.position.x),
        y: makeMutable(runtime.position.y),
        rotation: makeMutable(runtime.rotation),
        scale: makeMutable(runtime.locked ? 1 : 0.88),
        opacity: makeMutable(runtime.locked ? 1 : 0),
        trayFactor: makeMutable(trayFactor),
        trayAttached: makeMutable(runtime.inTray),
      });
      nextSync.set(definition.id, {
        x: runtime.position.x,
        y: runtime.position.y,
        rotation: runtime.rotation,
        inTray: runtime.inTray,
        trayFactor,
      });
    });

    return { visuals: nextVisuals, engineSync: nextSync };
    // Geometry may change on rotation, but the engine identity stays stable.
    // Keeping these shared values avoids reconstructing loose pieces at their
    // entrance-animation state during a relayout.
  }, [engine]);

  useEffect(() => {
    setImageError(null);
    // Passing null for one frame gives Skia a new source dependency, so Replay
    // is a real retry even when the failed URI itself has not changed.
    setDisplayImageUri(null);
    const frame = requestAnimationFrame(() => setDisplayImageUri(image.uri));
    return () => cancelAnimationFrame(frame);
  }, [image.uri, imageReloadSignal]);

  useEffect(() => {
    setManualImageLoadRetries(0);
  }, [image.uri, roundResetSignal]);

  const retryImageLoad = useCallback(() => {
    const nextRetryCount = acceptManualImageLoadRetry(
      manualImageLoadRetries,
    );
    if (nextRetryCount === null) {
      return;
    }
    setManualImageLoadRetries(nextRetryCount);
    setImageError(null);
    setImageReloadSignal((signal) => signal + 1);
  }, [manualImageLoadRetries]);

  useEffect(() => {
    // Engine replacement and Replay both create a new board round. Keep all
    // renderer-local state aligned even when Replay reuses the engine object.
    cancelAnimation(trayScroll);
    cancelAnimation(cameraScale);
    cancelAnimation(cameraX);
    cancelAnimation(cameraY);
    trayScroll.value = 0;
    cameraScale.value = 1;
    cameraX.value = 0;
    cameraY.value = 0;
    pinchStartScale.value = 1;
  }, [
    cameraScale,
    cameraX,
    cameraY,
    engine,
    pinchStartScale,
    roundResetSignal,
    trayScroll,
  ]);

  /**
   * Extent of the pieces still waiting in the tray, in tray-content space.
   * Scrolling is bounded by what is actually left rather than by the original
   * row, so the strip cannot be dragged into the empty space behind pieces the
   * player has already placed.
   */
  const trayExtent = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;

    layout.pieces.forEach((definition) => {
      const runtime = pieces[definition.id];
      if (!runtime?.inTray) {
        return;
      }
      // The renderer scales around the piece centre, so the drawn box is inset
      // by half the shrinkage along the scrolling axis.
      const boundsExtent =
        trayPlacement === 'bottom'
          ? definition.bounds.width
          : definition.bounds.height;
      const position =
        trayPlacement === 'bottom'
          ? runtime.position.x
          : runtime.position.y;
      const inset = (boundsExtent * (1 - trayMetrics.scale)) / 2;
      const leading = position + inset;
      min = Math.min(min, leading);
      max = Math.max(max, leading + boundsExtent * trayMetrics.scale);
    });

    return Number.isFinite(min) ? { min, max } : null;
  }, [layout.pieces, pieces, trayMetrics.scale, trayPlacement]);

  const trayViewportExtent =
    trayPlacement === 'bottom' ? trayMetrics.width : trayMetrics.height;
  const minScroll = trayExtent
    ? Math.min(0, trayViewportExtent - trayExtent.max - 12)
    : 0;
  const maxScroll = trayExtent ? Math.max(0, -trayExtent.min + 12) : 0;

  const viewWidth = Math.max(workspaceWidth, viewportWidth ?? 0);
  const viewHeight = Math.max(workspaceHeight, viewportHeight ?? 0);
  const cameraBounds: BoardCameraBounds = {
    contentWidth: workspaceWidth,
    contentHeight: workspaceHeight,
    viewportWidth: viewWidth,
    viewportHeight: viewHeight,
  };

  /**
   * Two fingers move the view, one finger plays. Keeping the split at the
   * number of fingers means a drag never has to be disambiguated from a pan,
   * so picking up a piece stays immediate at any zoom.
   */
  const cameraGesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onStart(() => {
        pinchStartScale.value = cameraScale.value;
      })
      .onUpdate((event) => {
        const next = zoomAround(
          {
            scale: cameraScale.value,
            x: cameraX.value,
            y: cameraY.value,
          },
          { x: event.focalX, y: event.focalY },
          pinchStartScale.value * event.scale,
          cameraBounds,
        );
        cameraScale.value = next.scale;
        cameraX.value = next.x;
        cameraY.value = next.y;
      });

    const pan = Gesture.Pan()
      .minPointers(2)
      .onChange((event) => {
        const next = clampOffset(
          {
            scale: cameraScale.value,
            x: cameraX.value + event.changeX,
            y: cameraY.value + event.changeY,
          },
          cameraBounds,
        );
        cameraX.value = next.x;
        cameraY.value = next.y;
      });

    return Gesture.Simultaneous(pinch, pan);
    // Bounds change only with the workspace, which is a relayout.
  }, [
    cameraBounds.contentHeight,
    cameraBounds.contentWidth,
    cameraBounds.viewportHeight,
    cameraBounds.viewportWidth,
    cameraScale,
    cameraX,
    cameraY,
    pinchStartScale,
  ]);

  useEffect(() => {
    // The view has to be settled against its bounds, not just clamped by
    // gestures: a board smaller than the table must sit in the middle of it,
    // and a rotation or a new puzzle changes both the board and the table.
    const scale = clampScale(cameraScale.value, cameraBounds);
    const settled = clampOffset(
      { scale, x: cameraX.value, y: cameraY.value },
      cameraBounds,
    );
    cameraScale.value = settled.scale;
    cameraX.value = settled.x;
    cameraY.value = settled.y;
  }, [
    cameraBounds.contentHeight,
    cameraBounds.contentWidth,
    cameraBounds.viewportHeight,
    cameraBounds.viewportWidth,
    cameraScale,
    cameraX,
    cameraY,
  ]);

  const cameraStyle = useAnimatedStyle(() =>
    resolveCameraViewStyle({
      scale: cameraScale.value,
      x: cameraX.value,
      y: cameraY.value,
    }),
  );

  /**
   * The same view, handed to Skia instead of applied to its output. Scaling the
   * canvas as a view magnifies the pixels it already drew, which thickens every
   * seam and doubles the guide lines; scaling inside the canvas redraws the
   * paths at the new size and they stay a hair wide at any zoom.
   */
  const sceneTransform = useDerivedValue<Transforms3d>(() => [
    { translateX: cameraX.value + originX * cameraScale.value },
    { translateY: cameraY.value + originY * cameraScale.value },
    { scale: cameraScale.value },
  ]);

  const trayScrollGesture = useMemo(() => {
    const gesture = Gesture.Pan();
    if (trayPlacement === 'bottom') {
      gesture.activeOffsetX([-6, 6]).failOffsetY([-12, 12]);
    } else {
      gesture.activeOffsetY([-6, 6]).failOffsetX([-12, 12]);
    }
    return gesture.onChange((event) => {
      const scale = cameraScale.value || 1;
      const change =
        (trayPlacement === 'bottom' ? event.changeX : event.changeY) / scale;
      trayScroll.value = Math.min(
        maxScroll,
        Math.max(minScroll, trayScroll.value + change),
      );
    });
  }, [cameraScale, maxScroll, minScroll, trayPlacement, trayScroll]);

  // Keep at least one waiting piece on screen. Without this the last pieces can
  // sit entirely beyond the edge with nothing to say they are there.
  useEffect(() => {
    const scroll = trayScroll.value;
    const target = resolveTrayAutoRevealScroll({
      scroll,
      extent: trayExtent,
      viewportExtent: trayViewportExtent,
      minScroll,
      maxScroll,
    });

    if (Math.abs(target - scroll) > 0.5) {
      trayScroll.value = reduceMotion
        ? target
        : withSpring(target, { damping: 40, stiffness: 320 });
    }
  }, [
    maxScroll,
    minScroll,
    reduceMotion,
    trayExtent,
    trayScroll,
    trayViewportExtent,
  ]);

  useEffect(() => {
    const previousRound = entranceRoundRef.current;
    const startsNewRound =
      previousRound?.engine !== engine ||
      previousRound.signal !== roundResetSignal;
    entranceRoundRef.current = { engine, signal: roundResetSignal };

    // The entrance belongs to this engine's own pieces: on a replacement the
    // props still describe the outgoing puzzle for one render.
    const entranceState = engine.getState();
    const entranceTrayScale = getTrayMetrics(entranceState.layout).scale;
    const lastBatch = PIECE_ENTRANCE_BATCH_COUNT - 1;
    const timers: Array<ReturnType<typeof setTimeout>> = [];

    if (!startsNewRound) {
      // A Reduce Motion change cancels the old worklet animations during effect
      // cleanup. Settle the existing round instead of replaying its entrance.
      entranceState.layout.pieces.forEach((definition) => {
        const runtime = entranceState.pieces[definition.id];
        const visual = visuals.get(definition.id);
        const synced = engineSync.get(definition.id);
        if (runtime && visual && synced) {
          visual.x.value = runtime.position.x;
          visual.y.value = runtime.position.y;
          visual.rotation.value = runtime.rotation;
          visual.opacity.value = 1;
          visual.scale.value = 1;
          visual.trayAttached.value = runtime.inTray;
          visual.trayFactor.value = runtime.inTray ? entranceTrayScale : 1;
          synced.x = runtime.position.x;
          synced.y = runtime.position.y;
          synced.rotation = runtime.rotation;
          synced.inTray = runtime.inTray;
          synced.trayFactor = runtime.inTray ? entranceTrayScale : 1;
        }
      });
      setEntranceGate({
        engine,
        signal: roundResetSignal,
        visibleBatch: lastBatch,
      });
    } else {
      setEntranceGate({
        engine,
        signal: roundResetSignal,
        visibleBatch: reduceMotion ? lastBatch : -1,
      });

      entranceState.layout.pieces.forEach((definition) => {
        const runtime = entranceState.pieces[definition.id];
        const visual = visuals.get(definition.id);
        const synced = engineSync.get(definition.id);
        if (!runtime || !visual || !synced) {
          return;
        }

        cancelAnimation(visual.x);
        cancelAnimation(visual.y);
        cancelAnimation(visual.rotation);
        cancelAnimation(visual.scale);
        cancelAnimation(visual.opacity);
        cancelAnimation(visual.trayFactor);
        visual.x.value = runtime.position.x;
        visual.y.value = runtime.position.y;
        visual.rotation.value = runtime.rotation;
        visual.trayAttached.value = runtime.inTray;
        visual.trayFactor.value = runtime.inTray ? entranceTrayScale : 1;
        synced.x = runtime.position.x;
        synced.y = runtime.position.y;
        synced.rotation = runtime.rotation;
        synced.inTray = runtime.inTray;
        synced.trayFactor = runtime.inTray ? entranceTrayScale : 1;

        if (runtime.locked || reduceMotion) {
          visual.opacity.value = 1;
          visual.scale.value = 1;
          return;
        }
        const delay = pieceEntranceDelayMs(
          definition.index,
          entranceState.layout.pieces.length,
        );
        visual.opacity.value = 0;
        visual.scale.value = 0.88;
        visual.opacity.value = withDelay(
          delay,
          withTiming(1, { duration: PIECE_ENTRANCE_DURATION_MS }),
        );
        visual.scale.value = withDelay(
          delay,
          withTiming(1, { duration: PIECE_ENTRANCE_DURATION_MS }),
        );
      });

      if (!reduceMotion) {
        Array.from({ length: PIECE_ENTRANCE_BATCH_COUNT }, (_, batch) => {
          const delay =
            pieceEntranceBatchDelayMs(batch) + PIECE_ENTRANCE_DURATION_MS;
          timers.push(
            setTimeout(() => {
              setEntranceGate((current) =>
                current.engine === engine &&
                current.signal === roundResetSignal
                  ? {
                      ...current,
                      visibleBatch: Math.max(current.visibleBatch, batch),
                    }
                  : current,
              );
            }, delay),
          );
        });
      }
    }

    return () => {
      timers.forEach(clearTimeout);
      visuals.forEach((visual) => {
        cancelAnimation(visual.x);
        cancelAnimation(visual.y);
        cancelAnimation(visual.rotation);
        cancelAnimation(visual.scale);
        cancelAnimation(visual.opacity);
        cancelAnimation(visual.trayFactor);
      });
    };
    // Relayout keeps the same engine and signal, so it cannot replay the deal.
  }, [
    engine,
    engineSync,
    reduceMotion,
    roundResetSignal,
    visuals,
  ]);

  useEffect(() => {
    layout.pieces.forEach((definition) => {
      const runtime = pieces[definition.id];
      const visual = visuals.get(definition.id);
      const synced = engineSync.get(definition.id);
      if (!runtime || !visual || !synced) {
        return;
      }

      // Assist can place a piece while the short deal animation is still
      // finishing. A locked result must become visible immediately.
      if (runtime.locked) {
        cancelAnimation(visual.opacity);
        visual.opacity.value = 1;
      }

      const trayTransition = runtime.inTray !== synced.inTray;
      if (trayTransition) {
        const animateProgrammaticTrayExit =
          shouldAnimateProgrammaticTrayExit({
            engineInTray: synced.inTray,
            runtimeInTray: runtime.inTray,
            trayAttached: visual.trayAttached.value,
          });
        synced.inTray = runtime.inTray;
        if (runtime.inTray) {
          // Change from surface coordinates to tray-content coordinates
          // without changing the drawn position, then animate home inside the
          // scrollable content space.
          const visibleX =
            visual.x.value +
            (visual.trayAttached.value && trayPlacement === 'bottom'
              ? trayScroll.value
              : 0);
          const visibleY =
            visual.y.value +
            (visual.trayAttached.value && trayPlacement === 'right'
              ? trayScroll.value
              : 0);
          cancelAnimation(visual.x);
          cancelAnimation(visual.y);
          visual.x.value =
            visibleX -
            (trayPlacement === 'bottom' ? trayScroll.value : 0);
          visual.y.value =
            visibleY -
            (trayPlacement === 'right' ? trayScroll.value : 0);
          visual.trayAttached.value = true;
          synced.x = runtime.position.x;
          synced.y = runtime.position.y;
          visual.x.value = reduceMotion
            ? runtime.position.x
            : withSpring(runtime.position.x, {
                damping: 40,
                stiffness: 380,
              });
          visual.y.value = reduceMotion
            ? runtime.position.y
            : withSpring(runtime.position.y, {
                damping: 40,
                stiffness: 380,
              });
        } else {
          // A gesture worklet has already folded tray scroll into the visual
          // position. Assist has no gesture, so it still needs a visible move
          // from the tray slot to the newly locked engine coordinates.
          visual.trayAttached.value = false;
          synced.x = runtime.position.x;
          synced.y = runtime.position.y;
          if (animateProgrammaticTrayExit) {
            visual.x.value = reduceMotion
              ? runtime.position.x
              : withSpring(runtime.position.x, {
                  damping: 40,
                  stiffness: 380,
                });
            visual.y.value = reduceMotion
              ? runtime.position.y
              : withSpring(runtime.position.y, {
                  damping: 40,
                  stiffness: 380,
                });
          }
        }
      } else {
        if (runtime.position.x !== synced.x) {
          synced.x = runtime.position.x;
          visual.x.value = reduceMotion
            ? runtime.position.x
            : withSpring(runtime.position.x, {
                damping: 40,
                stiffness: 380,
              });
        }
        if (runtime.position.y !== synced.y) {
          synced.y = runtime.position.y;
          visual.y.value = reduceMotion
            ? runtime.position.y
            : withSpring(runtime.position.y, {
                damping: 40,
                stiffness: 380,
              });
        }
      }
      if (runtime.rotation !== synced.rotation) {
        synced.rotation = runtime.rotation;
        visual.rotation.value = reduceMotion
          ? runtime.rotation
          : withSpring(runtime.rotation, {
              damping: 42,
              stiffness: 400,
            });
      }
      const nextFactor = runtime.inTray ? trayMetrics.scale : 1;
      if (nextFactor !== synced.trayFactor) {
        synced.trayFactor = nextFactor;
        // Grows to full size as it leaves the tray, shrinks back on return, and
        // adapts in place when rotation changes the tray scale.
        visual.trayFactor.value = reduceMotion
          ? nextFactor
          : withSpring(nextFactor, { damping: 42, stiffness: 400 });
      }
    });
  }, [
    engineSync,
    layout.pieces,
    pieces,
    reduceMotion,
    trayMetrics.scale,
    trayPlacement,
    trayScroll,
    visuals,
  ]);

  useEffect(() => {
    if (!completed) {
      // Replay is a new round, not a reverse completion animation.
      piecesOpacity.value = 1;
      fullOpacity.value = 0;
      return;
    }
    if (reduceMotion) {
      piecesOpacity.value = 0;
      fullOpacity.value = 1;
      return;
    }
    piecesOpacity.value = withTiming(0, {
      duration: PUZZLE_SEAM_DISSOLVE_MS,
    });
    fullOpacity.value = withTiming(1, {
      duration: PUZZLE_SEAM_DISSOLVE_MS,
    });
  }, [
    completed,
    fullOpacity,
    piecesOpacity,
    reduceMotion,
    roundResetSignal,
  ]);

  useEffect(() => {
    if (!snapFeedback) {
      return;
    }
    const visual = visuals.get(snapFeedback.pieceId);
    if (visual && !reduceMotion) {
      // Seat the piece: a fast press into the board, then a critically damped
      // return (damping >= 2*sqrt(stiffness)) so it settles without bouncing.
      visual.scale.value = withSequence(
        withTiming(0.993, { duration: 60 }),
        withSpring(1, { damping: 40, stiffness: 400 }),
      );
    }
    engine.clearSnapFeedback();
  }, [engine, reduceMotion, snapFeedback, visuals]);

  /**
   * Everything is drawn clipped to the table — board and shelf together, plus
   * the margin a piece's shadow needs.
   *
   * Clipping to the shelf alone looked right until a piece was picked up: a
   * piece still counts as being on the shelf until the engine says otherwise,
   * so the drag was sliced off at the shelf's edge and read as the piece
   * sliding under the board. The whole table hides what has scrolled past the
   * ends of the row — that is off the table — while leaving a dragged piece
   * visible wherever it goes.
   */
  const tableClip = {
    x: Math.min(0, trayMetrics.left) - surfaceInset,
    y: Math.min(0, trayMetrics.top) - surfaceInset,
    width:
      Math.max(boardSize.width, trayMetrics.left + trayMetrics.width) -
      Math.min(0, trayMetrics.left) +
      surfaceInset * 2,
    height:
      Math.max(boardSize.height, trayMetrics.top + trayMetrics.height) -
      Math.min(0, trayMetrics.top) +
      surfaceInset * 2,
  };

  const orderedPieces = useMemo(
    () =>
      [...layout.pieces].sort((a, b) => {
        const aRuntime = pieces[a.id];
        const bRuntime = pieces[b.id];
        if (aRuntime?.locked !== bRuntime?.locked) {
          return aRuntime?.locked ? -1 : 1;
        }
        return (aRuntime?.zIndex ?? 0) - (bRuntime?.zIndex ?? 0);
      }),
    [layout.pieces, pieces],
  );

  if (imageError) {
    return (
      <View
        style={[
          styles.workspace,
          styles.loading,
          styles.imageStatus,
          { width: workspaceWidth, height: workspaceHeight },
        ]}
        accessibilityLiveRegion={androidAccessibilityLiveRegion('assertive')}
      >
        <Text style={styles.imageStatusTitle}>Photograph unavailable</Text>
        <Text style={styles.imageStatusBody}>{imageError}</Text>
        <Text style={styles.imageStatusBody}>
          {imageRetryPresentation.guidance}
        </Text>
        {imageRetryPresentation.canRetry &&
        imageRetryPresentation.retryLabel ? (
          <View style={styles.imageRetryAction}>
            <Button
              label={imageRetryPresentation.retryLabel}
              variant="secondary"
              onPress={retryImageLoad}
              accessibilityHint="Attempts to reload the puzzle photograph"
            />
          </View>
        ) : null}
      </View>
    );
  }

  if (!skiaImage) {
    return (
      <View
        style={[
          styles.workspace,
          styles.loading,
          { width: workspaceWidth, height: workspaceHeight },
        ]}
        accessibilityLiveRegion={androidAccessibilityLiveRegion('polite')}
      >
        <Text style={styles.imageStatusBody}>Loading photograph…</Text>
      </View>
    );
  }

  return (
    <GestureDetector gesture={cameraGesture}>
      <View
        style={[
          styles.workspace,
          styles.viewport,
          { width: viewWidth, height: viewHeight },
        ]}
      >
        {/*
          Skia draws at the player's zoom rather than being magnified after the
          fact, so seams and guides stay a hair wide however close they look.
          Only the plain views above and below it are scaled as views.
        */}
        <View
          style={[
            styles.boardSurface,
            { width: workspaceWidth, height: workspaceHeight },
          ]}
          pointerEvents="none"
        >
          <BoardSurface
            layout={layout}
            guideMode={completed ? 'none' : guideMode}
            skiaImage={skiaImage}
            appearance={tableAppearance}
            transform={sceneTransform}
          />
        </View>

        {/* Behind the pieces: drag anywhere on the strip to scroll the tray. */}
        <Animated.View
          style={[
            styles.scene,
            { width: workspaceWidth, height: workspaceHeight },
            cameraStyle,
          ]}
          pointerEvents="box-none"
        >
          <GestureDetector gesture={trayScrollGesture}>
            <View style={[styles.tray, traySurfaceFrame]}>
              <TraySurface
                width={traySurfaceFrame.width}
                height={traySurfaceFrame.height}
                placement={trayPlacement}
                appearance={tableAppearance}
              />
            </View>
          </GestureDetector>
        </Animated.View>

        <Canvas
          style={styles.scene}
          pointerEvents="none"
          accessible
          accessibilityRole="image"
          accessibilityLabel={
            image.accessibilityLabel ?? 'The photograph being assembled'
          }
        >
          <Group transform={sceneTransform}>
            <Group opacity={piecesOpacity} clip={tableClip}>
              {orderedPieces.map((definition) => {
                const runtime = pieces[definition.id];
                const visual = visuals.get(definition.id);
                if (!runtime || !visual) {
                  return null;
                }
                return (
                  <PieceDrawing
                    key={definition.id}
                    definition={definition}
                    runtime={runtime}
                    visual={visual}
                    skiaImage={skiaImage}
                    boardWidth={boardSize.width}
                    boardHeight={boardSize.height}
                    showSeams={!completed}
                    trayScroll={trayScroll}
                    trayPlacement={trayPlacement}
                  />
                );
              })}
            </Group>
            <Group
              opacity={fullOpacity}
              clip={{
                x: 0,
                y: 0,
                width: boardSize.width,
                height: boardSize.height,
              }}
            >
              <DrawBoardImage
                skiaImage={skiaImage}
                boardWidth={boardSize.width}
                boardHeight={boardSize.height}
              />
            </Group>
          </Group>
        </Canvas>

        <Animated.View
          style={[
            styles.scene,
            { width: workspaceWidth, height: workspaceHeight },
            cameraStyle,
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.gestureLayer} pointerEvents="box-none">
            {orderedPieces.map((definition) => {
              const runtime = pieces[definition.id];
              const visual = visuals.get(definition.id);
              if (!runtime || !visual) {
                return null;
              }
              return (
                <PieceGestureOverlay
                  key={definition.id}
                  definition={definition}
                  runtime={runtime}
                  visual={visual}
                  engine={engine}
                  interactive={
                    !completed &&
                    isPieceEntranceVisible(
                      definition.index,
                      layout.pieces.length,
                      visibleEntranceBatch,
                    )
                  }
                  trayScroll={trayScroll}
                  trayTop={trayMetrics.top}
                  trayLeft={trayMetrics.left}
                  trayPlacement={trayPlacement}
                  trayScale={trayMetrics.scale}
                  cameraScale={cameraScale}
                  minTrayScroll={minScroll}
                  maxTrayScroll={maxScroll}
                  totalPieces={layout.pieces.length}
                  surfaceInset={originX}
                  surfaceInsetY={originY}
                  hapticsEnabled={hapticsEnabled}
                />
              );
            })}
          </View>

          {/* Above the pieces, so a hint is never hidden by what it points at. */}
          {trayExtent ? (
            <View
              style={[
                styles.tray,
                {
                  left: trayMetrics.left + originX,
                  top: trayMetrics.top + originY,
                  width: trayMetrics.width,
                  height: trayMetrics.height,
                },
              ]}
              pointerEvents="none"
            >
              <TrayEdgeHint
                side={trayPlacement === 'bottom' ? 'left' : 'top'}
                edge={trayExtent.min}
                trayScroll={trayScroll}
                viewportExtent={trayViewportExtent}
                crossExtent={
                  trayPlacement === 'bottom'
                    ? trayMetrics.height
                    : trayMetrics.width
                }
              />
              <TrayEdgeHint
                side={trayPlacement === 'bottom' ? 'right' : 'bottom'}
                edge={trayExtent.max}
                trayScroll={trayScroll}
                viewportExtent={trayViewportExtent}
                crossExtent={
                  trayPlacement === 'bottom'
                    ? trayMetrics.height
                    : trayMetrics.width
                }
              />
            </View>
          ) : null}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  workspace: {
    alignSelf: 'center',
    overflow: 'visible',
  },
  /**
   * Clips the magnified board to the space the table gives it — without this a
   * zoomed board draws over the HUD and off the edges of the screen.
   */
  viewport: {
    overflow: 'hidden',
  },
  loading: {
    backgroundColor: PUZZLE_SURFACE_COLORS.boardLoading,
  },
  imageStatus: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  imageStatusTitle: {
    color: 'rgba(255, 246, 232, 0.92)',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  imageStatusBody: {
    color: 'rgba(255, 246, 232, 0.68)',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 6,
  },
  imageRetryAction: {
    marginTop: 16,
    alignItems: 'center',
  },
  boardSurface: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  tray: {
    position: 'absolute',
  },
  scene: {
    ...StyleSheet.absoluteFillObject,
  },
  gestureLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  pieceHitArea: {
    position: 'absolute',
  },
});
