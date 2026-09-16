import * as Haptics from 'expo-haptics';

import { runSafeHapticFeedback } from './safeHapticFeedback';

export function playPuzzlePlacementHaptic(
  enabled: boolean,
  connectedWithNeighbor: boolean,
) {
  return runSafeHapticFeedback(enabled, () =>
    Haptics.impactAsync(
      connectedWithNeighbor
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light,
    ),
  );
}

/** A quarter turn is a nudge, not a placement, so it gets the lightest tick. */
export function playPuzzleRotateHaptic(enabled: boolean) {
  return runSafeHapticFeedback(enabled, () => Haptics.selectionAsync());
}

export function playPuzzleCompletionHaptic(enabled: boolean) {
  return runSafeHapticFeedback(enabled, () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  );
}
