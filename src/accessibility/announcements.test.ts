import { beforeEach, describe, expect, it, vi } from 'vitest';

const reactNative = vi.hoisted(() => ({
  platform: 'ios',
  announce: vi.fn(),
}));

vi.mock('react-native', () => ({
  AccessibilityInfo: {
    announceForAccessibilityWithOptions: reactNative.announce,
  },
  Platform: {
    get OS() {
      return reactNative.platform;
    },
  },
}));

import {
  androidAccessibilityLiveRegion,
  announceQueuedAccessibilityMessage,
} from './announcements';

describe('accessibility announcements', () => {
  beforeEach(() => {
    reactNative.platform = 'ios';
    reactNative.announce.mockReset();
  });

  it('queues a trimmed announcement on iOS', () => {
    announceQueuedAccessibilityMessage('  Photo failed to load.  ');

    expect(reactNative.announce).toHaveBeenCalledWith(
      'Photo failed to load.',
      { queue: true },
    );
  });

  it('leaves Android announcements to the rendered live region', () => {
    reactNative.platform = 'android';

    announceQueuedAccessibilityMessage('Finding a photo.');

    expect(reactNative.announce).not.toHaveBeenCalled();
    expect(androidAccessibilityLiveRegion('assertive')).toBe('assertive');
  });

  it('omits Android-only live-region props on iOS', () => {
    expect(androidAccessibilityLiveRegion()).toBeUndefined();
  });

  it('ignores empty announcements', () => {
    announceQueuedAccessibilityMessage('   ');

    expect(reactNative.announce).not.toHaveBeenCalled();
  });
});
