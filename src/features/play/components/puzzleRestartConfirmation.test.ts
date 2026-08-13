import { describe, expect, it } from 'vitest';

import { puzzleRestartConfirmation } from './puzzleRestartConfirmation';

describe('restart puzzle confirmation', () => {
  it('states exactly what progress will be lost', () => {
    expect(puzzleRestartConfirmation(7, 25)).toEqual({
      title: 'Restart puzzle?',
      message:
        'All 7 placed pieces will return to the tray, and the timer will reset.',
      confirmLabel: 'Restart',
    });
  });

  it('uses truthful copy before the first piece is placed', () => {
    expect(puzzleRestartConfirmation(0, 9).message).toBe(
      'Every piece will return to the tray, and the timer will reset.',
    );
  });
});
