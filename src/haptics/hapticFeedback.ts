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

export function playPuzzleCompletionHaptic(enabled: boolean) {
  return runSafeHapticFeedback(enabled, () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  );
}
