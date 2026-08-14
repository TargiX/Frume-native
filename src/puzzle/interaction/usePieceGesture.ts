import { useCallback, useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  runOnJS,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import { playPuzzlePlacementHaptic } from '../../haptics';
import type { PuzzleEngine } from '../engine';
import { beginPieceDrag, completePieceDrag } from './dragLifecycle';
import {
  boardPointToViewport,
  viewportPointToBoard,
} from './pieceCoordinateSpace';
import { BOARD_PIECE_ACTIVATION_DISTANCE } from './pieceDragIntent';

const INTENT_ACTIVATION_DISTANCE = 6;
const CROSS_AXIS_TOLERANCE = 28;

type UsePieceGestureParams = {
  engine: PuzzleEngine;
  pieceId: string;
  locked: boolean;
  /** True while the piece is resting in the tray. */
  inTray: boolean;
  trayPlacement: 'bottom' | 'right';
  /** Tray origin in the shared surface coordinate space. */
  trayTop: number;
  trayLeft: number;
  pieceWidth: number;
  /** Unscaled bounds height; tray scaling is applied around this centre. */
  pieceHeight: number;
  trayScroll: SharedValue<number>;
  minTrayScroll: number;
  maxTrayScroll: number;
  trayAttached: SharedValue<boolean>;
  trayFactor: SharedValue<number>;
  trayScale: number;
  /**
   * How magnified the board is. A gesture reports movement in screen points,
   * so at any zoom other than 1 the piece has to be moved by less than the
   * finger travelled to stay underneath it.
   */
  cameraScale: SharedValue<number>;
  cameraX: SharedValue<number>;
  cameraY: SharedValue<number>;
  surfaceOriginX: number;
  surfaceOriginY: number;
  positionX: SharedValue<number>;
  positionY: SharedValue<number>;
  hapticsEnabled: boolean;
};

export function usePieceGesture({
  engine,
  pieceId,
  locked,
  inTray,
  trayPlacement,
  trayTop,
  trayLeft,
  pieceWidth,
  pieceHeight,
  trayScroll,
  minTrayScroll,
  maxTrayScroll,
  trayAttached,
  trayFactor,
  trayScale,
  cameraScale,
  cameraX,
  cameraY,
  surfaceOriginX,
  surfaceOriginY,
  positionX,
  positionY,
  hapticsEnabled,
}: UsePieceGestureParams) {
  const reduceMotion = useReducedMotion();
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const fixedOriginX = useSharedValue(0);
  const fixedOriginY = useSharedValue(0);
  const dragActive = useSharedValue(false);

  const beginDrag = useCallback(() => {
    beginPieceDrag(engine, pieceId);
  }, [engine, pieceId]);

  const endDrag = useCallback(
    (x: number, y: number) => {
      const result = completePieceDrag(
        engine,
        pieceId,
        { x, y },
        {
          placement: trayPlacement,
          start: trayPlacement === 'bottom' ? trayTop : trayLeft,
          pieceWidth,
          pieceHeight,
        },
      );
      if (result?.snapped) {
        void playPuzzlePlacementHaptic(
          hapticsEnabled,
          result.connectedWithNeighbor,
        );
      }
    },
    [
      engine,
      hapticsEnabled,
      pieceHeight,
      pieceId,
      pieceWidth,
      trayLeft,
      trayPlacement,
      trayTop,
    ],
  );

  const gesture = useMemo(() => {
    const pieceDrag = Gesture.Pan()
      .enabled(!locked)
      .onStart(() => {
        dragActive.value = true;
        // A tray piece is drawn at its slot plus the tray's scroll. Fold the
        // scroll into its position and detach both shared values in the same
        // UI-thread event. The tray is fixed in viewport space, so convert the
        // visible point through the inverse board camera before switching the
        // drawing to the zoomed board layer.
        if (inTray) {
          fixedOriginX.value =
            positionX.value +
            (trayPlacement === 'bottom' ? trayScroll.value : 0);
          fixedOriginY.value =
            positionY.value +
            (trayPlacement === 'right' ? trayScroll.value : 0);
          const boardPoint = viewportPointToBoard(
            {
              x: surfaceOriginX + fixedOriginX.value,
              y: surfaceOriginY + fixedOriginY.value,
            },
            {
              scale: cameraScale.value,
              x: cameraX.value,
              y: cameraY.value,
            },
            { x: surfaceOriginX, y: surfaceOriginY },
          );
          positionX.value = boardPoint.x;
          positionY.value = boardPoint.y;
          trayAttached.value = false;
          trayFactor.value = reduceMotion
            ? 1
            : withSpring(1, {
                damping: 40,
                stiffness: 380,
              });
        }
        originX.value = positionX.value;
        originY.value = positionY.value;
        runOnJS(beginDrag)();
      })
      .onUpdate((event) => {
        const scale = cameraScale.value || 1;
        positionX.value = originX.value + event.translationX / scale;
        positionY.value = originY.value + event.translationY / scale;
      })
      .onFinalize(() => {
        if (dragActive.value) {
          dragActive.value = false;
          const axisPosition =
            trayPlacement === 'bottom'
              ? boardPointToViewport(
                  { x: positionX.value, y: positionY.value },
                  {
                    scale: cameraScale.value,
                    x: cameraX.value,
                    y: cameraY.value,
                  },
                  { x: surfaceOriginX, y: surfaceOriginY },
                ).y
              : boardPointToViewport(
                  { x: positionX.value, y: positionY.value },
                  {
                    scale: cameraScale.value,
                    x: cameraX.value,
                    y: cameraY.value,
                  },
                  { x: surfaceOriginX, y: surfaceOriginY },
                ).x;
          const pieceExtent =
            trayPlacement === 'bottom' ? pieceHeight : pieceWidth;
          const trayStart =
            trayPlacement === 'bottom'
              ? surfaceOriginY + trayTop
              : surfaceOriginX + trayLeft;
          const droppedInTray =
            axisPosition + (pieceExtent * cameraScale.value) / 2 >= trayStart;
          if (inTray && droppedInTray) {
            const viewportPoint = boardPointToViewport(
              { x: positionX.value, y: positionY.value },
              {
                scale: cameraScale.value,
                x: cameraX.value,
                y: cameraY.value,
              },
              { x: surfaceOriginX, y: surfaceOriginY },
            );
            const fixedX = viewportPoint.x - surfaceOriginX;
            const fixedY = viewportPoint.y - surfaceOriginY;
            if (trayPlacement === 'bottom') {
              const attachedX = fixedX - trayScroll.value;
              const targetX = fixedOriginX.value - trayScroll.value;
              positionX.value = attachedX;
              positionY.value = fixedY;
              trayAttached.value = true;
              positionX.value = reduceMotion
                ? targetX
                : withSpring(targetX, { damping: 40, stiffness: 380 });
              positionY.value = reduceMotion
                ? fixedOriginY.value
                : withSpring(fixedOriginY.value, {
                    damping: 40,
                    stiffness: 380,
                  });
            } else {
              const attachedY = fixedY - trayScroll.value;
              const targetY = fixedOriginY.value - trayScroll.value;
              positionX.value = fixedX;
              positionY.value = attachedY;
              trayAttached.value = true;
              positionX.value = reduceMotion
                ? fixedOriginX.value
                : withSpring(fixedOriginX.value, {
                    damping: 40,
                    stiffness: 380,
                  });
              positionY.value = reduceMotion
                ? targetY
                : withSpring(targetY, { damping: 40, stiffness: 380 });
            }
            trayFactor.value = reduceMotion
              ? trayScale
              : withSpring(trayScale, {
                  damping: 40,
                  stiffness: 380,
                });
          }
          runOnJS(endDrag)(positionX.value, positionY.value);
        }
      });

    if (!inTray) {
      // After a near miss the next movement is usually a precise nudge. RNGH's
      // native default pan threshold can swallow that first correction and
      // make a loose piece feel locked even though the engine still allows it.
      pieceDrag.minDistance(BOARD_PIECE_ACTIVATION_DISTANCE);
      return pieceDrag;
    }

    // Intent across the tray lifts a piece; intent along it scrolls the tray,
    // even when the swipe begins directly on a piece.
    if (trayPlacement === 'bottom') {
      pieceDrag
        .activeOffsetY([
          -INTENT_ACTIVATION_DISTANCE,
          INTENT_ACTIVATION_DISTANCE,
        ])
        .failOffsetX([-CROSS_AXIS_TOLERANCE, CROSS_AXIS_TOLERANCE]);
    } else {
      pieceDrag
        .activeOffsetX([
          -INTENT_ACTIVATION_DISTANCE,
          INTENT_ACTIVATION_DISTANCE,
        ])
        .failOffsetY([-CROSS_AXIS_TOLERANCE, CROSS_AXIS_TOLERANCE]);
    }
    const scrollTray = Gesture.Pan()
      .enabled(!locked);
    if (trayPlacement === 'bottom') {
      scrollTray
        .activeOffsetX([
          -INTENT_ACTIVATION_DISTANCE,
          INTENT_ACTIVATION_DISTANCE,
        ])
        .failOffsetY([-CROSS_AXIS_TOLERANCE, CROSS_AXIS_TOLERANCE]);
    } else {
      scrollTray
        .activeOffsetY([
          -INTENT_ACTIVATION_DISTANCE,
          INTENT_ACTIVATION_DISTANCE,
        ])
        .failOffsetX([-CROSS_AXIS_TOLERANCE, CROSS_AXIS_TOLERANCE]);
    }
    scrollTray
      .onChange((event) => {
        const change =
          trayPlacement === 'bottom' ? event.changeX : event.changeY;
        trayScroll.value = Math.min(
          maxTrayScroll,
          Math.max(minTrayScroll, trayScroll.value + change),
        );
      });
    return Gesture.Race(scrollTray, pieceDrag);
  }, [
      beginDrag,
      cameraScale,
      cameraX,
      cameraY,
      dragActive,
      endDrag,
      fixedOriginX,
      fixedOriginY,
      inTray,
      locked,
      maxTrayScroll,
      minTrayScroll,
      originX,
      originY,
      positionX,
      positionY,
      reduceMotion,
      trayAttached,
      trayFactor,
      trayLeft,
      trayPlacement,
      trayScale,
      trayScroll,
      trayTop,
      surfaceOriginX,
      surfaceOriginY,
      pieceHeight,
      pieceWidth,
    ]);

  return { gesture };
}
