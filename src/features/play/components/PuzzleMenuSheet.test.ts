import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  AccessibilityInfo: {},
  findNodeHandle: () => null,
  InteractionManager: { runAfterInteractions: () => ({ cancel: () => {} }) },
  Linking: {},
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { absoluteFill: {}, create: (styles: unknown) => styles },
  Switch: 'Switch',
  Text: 'Text',
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1 }),
  View: 'View',
}));

vi.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('react-native-reanimated', () => ({
  default: { View: 'AnimatedView' },
  Easing: { in: () => undefined, out: () => undefined, cubic: undefined },
  FadeIn: { duration: () => ({}) },
  FadeOut: { duration: () => ({}) },
  SlideInDown: { duration: () => ({ easing: () => ({}) }) },
  SlideInRight: { duration: () => ({ easing: () => ({}) }) },
  SlideOutDown: { duration: () => ({ easing: () => ({}) }) },
  SlideOutRight: { duration: () => ({ easing: () => ({}) }) },
  useReducedMotion: () => false,
}));

import { puzzleSavePresentation } from './PuzzleMenuSheet';

describe('puzzle save-status presentation', () => {
  it('only claims automatic saving when persistence has no known error', () => {
    expect(puzzleSavePresentation(null)).toEqual({
      message: 'Progress saves automatically',
      warning: false,
      retryAvailable: false,
    });
  });

  it('shows the truthful warning with a retry action after a save failure', () => {
    expect(
      puzzleSavePresentation('Progress could not be saved on this device'),
    ).toEqual({
      message: 'Progress could not be saved on this device',
      warning: true,
      retryAvailable: true,
    });
  });

  it('prevents duplicate retries while a save is already being flushed', () => {
    expect(
      puzzleSavePresentation(
        'Progress could not be saved on this device',
        true,
      ),
    ).toEqual({
      message: 'Retrying save…',
      warning: true,
      retryAvailable: false,
    });
  });
});
