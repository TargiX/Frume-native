import * as Haptics from 'expo-haptics';
import { useCallback, useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import {
  runOnJS,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import type { PuzzleEngine } from '../engine';
import { beginPieceDrag, completePieceDrag } from './dragLifecycle';
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
  positionX: SharedValue<number>;
  positionY: SharedValue<number>;
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
  positionX,
  positionY,
}: UsePieceGestureParams) {
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
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
        void Haptics.impactAsync(
          result.connectedWithNeighbor
            ? Haptics.ImpactFeedbackStyle.Medium
            : Haptics.ImpactFeedbackStyle.Light,
        );
      }
    },
    [
      engine,
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
        // UI-thread event, so the piece never draws with the offset twice.
        if (inTray) {
          if (trayPlacement === 'bottom') {
            positionX.value += trayScroll.value;
          } else {
            positionY.value += trayScroll.value;
          }
          trayAttached.value = false;
          trayFactor.value = withSpring(1, {
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
            trayPlacement === 'bottom' ? positionY.value : positionX.value;
          const pieceExtent =
            trayPlacement === 'bottom' ? pieceHeight : pieceWidth;
          const trayStart =
            trayPlacement === 'bottom' ? trayTop : trayLeft;
          const droppedInTray =
            axisPosition + pieceExtent / 2 >= trayStart;
          if (inTray && droppedInTray) {
            if (trayPlacement === 'bottom') {
              positionX.value = withSpring(
                originX.value - trayScroll.value,
                { damping: 40, stiffness: 380 },
              );
              positionY.value = withSpring(originY.value, {
                damping: 40,
                stiffness: 380,
              });
            } else {
              positionX.value = withSpring(originX.value, {
                damping: 40,
                stiffness: 380,
              });
              positionY.value = withSpring(
                originY.value - trayScroll.value,
                { damping: 40, stiffness: 380 },
              );
            }
            trayAttached.value = true;
            trayFactor.value = withSpring(trayScale, {
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
        const scale = cameraScale.value || 1;
        const change =
          (trayPlacement === 'bottom' ? event.changeX : event.changeY) / scale;
        trayScroll.value = Math.min(
          maxTrayScroll,
          Math.max(minTrayScroll, trayScroll.value + change),
        );
      });
    return Gesture.Race(scrollTray, pieceDrag);
  }, [
      beginDrag,
      cameraScale,
      dragActive,
      endDrag,
      inTray,
      locked,
      maxTrayScroll,
      minTrayScroll,
      originX,
      originY,
      positionX,
      positionY,
      trayAttached,
      trayFactor,
      trayLeft,
      trayPlacement,
      trayScale,
      trayScroll,
      trayTop,
      pieceHeight,
      pieceWidth,
    ]);

  return { gesture };
}
