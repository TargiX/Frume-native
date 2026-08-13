import { describe, expect, it } from 'vitest';

import { HOW_TO_PLAY_STEPS } from './howToPlayPresentation';

describe('How to Play content', () => {
  it('teaches every non-obvious board interaction in a bounded sequence', () => {
    expect(HOW_TO_PLAY_STEPS).toHaveLength(4);
    const content = HOW_TO_PLAY_STEPS.map(
      ({ title, detail }) => `${title} ${detail}`,
    ).join(' ');

    expect(content).toMatch(/Drag a piece/);
    expect(content).toMatch(/Swipe along the tray/);
    expect(content).toMatch(/Pinch to zoom/);
    expect(content).toMatch(/two fingers/);
    expect(content).toMatch(/Place piece/);
    expect(content).toMatch(/Assist/);
  });
});
