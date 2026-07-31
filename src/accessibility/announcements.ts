import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

export type AccessibilityAnnouncementPriority = 'polite' | 'assertive';

/**
 * Android observes live-region changes in the rendered tree. React Native does
 * not implement that prop on iOS, so iOS announcements are posted explicitly
 * below instead.
 */
export function androidAccessibilityLiveRegion(
  priority: AccessibilityAnnouncementPriority = 'polite',
): AccessibilityAnnouncementPriority | undefined {
  return Platform.OS === 'android' ? priority : undefined;
}

/**
 * Queues an iOS announcement behind anything VoiceOver is already speaking.
 * Android callers retain `accessibilityLiveRegion` on their rendered status
 * element and deliberately do not post a second announcement here.
 */
export function announceQueuedAccessibilityMessage(
  message: string,
): void {
  const announcement = message.trim();
  if (Platform.OS !== 'ios' || announcement.length === 0) {
    return;
  }

  AccessibilityInfo.announceForAccessibilityWithOptions(announcement, {
    queue: true,
  });
}

/**
 * Announces each non-empty status transition once. Clearing the message resets
 * the hook, so the same error can be announced again after a later retry.
 */
export function useAccessibilityAnnouncement(
  message: string | null | undefined,
): void {
  const previousMessageRef = useRef<string | null>(null);

  useEffect(() => {
    const announcement = message?.trim() || null;

    if (announcement === null) {
      previousMessageRef.current = null;
      return;
    }
    if (previousMessageRef.current === announcement) {
      return;
    }

    previousMessageRef.current = announcement;
    announceQueuedAccessibilityMessage(announcement);
  }, [message]);
}
