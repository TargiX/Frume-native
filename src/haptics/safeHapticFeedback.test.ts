import { describe, expect, it, vi } from 'vitest';

import { runSafeHapticFeedback } from './safeHapticFeedback';

describe('safe haptic feedback', () => {
  it('suppresses feedback before or after an explicit opt-out', async () => {
    const feedback = vi.fn(async () => undefined);
    const diagnostics = { record: vi.fn(async () => true) };

    await expect(
      runSafeHapticFeedback(false, feedback, diagnostics),
    ).resolves.toBe('suppressed');
    expect(feedback).not.toHaveBeenCalled();
    expect(diagnostics.record).not.toHaveBeenCalled();
  });

  it('catches a native rejection and records only a redacted nonfatal event', async () => {
    const privateMessage =
      'Motor failed for ilya@example.test on private-device-id';
    const diagnostics = { record: vi.fn(async () => true) };

    await expect(
      runSafeHapticFeedback(
        true,
        async () => {
          throw new Error(privateMessage);
        },
        diagnostics,
      ),
    ).resolves.toBe('failed');

    expect(diagnostics.record).toHaveBeenCalledWith({
      kind: 'haptic_error',
      error: { name: 'HapticsError' },
      fatal: false,
      componentStack: '\n at HapticFeedback',
    });
    expect(JSON.stringify(diagnostics.record.mock.calls)).not.toContain(
      privateMessage,
    );
  });

  it('reports played only after the native promise resolves', async () => {
    await expect(
      runSafeHapticFeedback(true, async () => undefined, {
        record: vi.fn(async () => true),
      }),
    ).resolves.toBe('played');
  });
});
