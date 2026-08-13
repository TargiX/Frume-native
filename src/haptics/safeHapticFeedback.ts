import { clientDiagnostics } from '../diagnostics/clientDiagnostics';

export type SafeHapticResult = 'played' | 'suppressed' | 'failed';

type HapticDiagnosticRecorder = {
  record(input: {
    kind: 'haptic_error';
    error: unknown;
    fatal: false;
    componentStack: string;
  }): Promise<boolean>;
};

const REDACTED_HAPTIC_ERROR = Object.freeze({ name: 'HapticsError' });
const HAPTIC_COMPONENT_STACK = '\n at HapticFeedback';

/**
 * The only execution boundary for native haptic promises.
 *
 * Callers get a truthful result, native rejections cannot become unhandled,
 * and diagnostics receive only a fixed error name/breadcrumb — never the
 * native exception message, stack, device details, or puzzle content.
 */
export async function runSafeHapticFeedback(
  enabled: boolean,
  feedback: () => Promise<void>,
  diagnostics: HapticDiagnosticRecorder = clientDiagnostics,
): Promise<SafeHapticResult> {
  if (!enabled) {
    return 'suppressed';
  }
  try {
    await feedback();
    return 'played';
  } catch {
    try {
      await diagnostics.record({
        kind: 'haptic_error',
        error: REDACTED_HAPTIC_ERROR,
        fatal: false,
        componentStack: HAPTIC_COMPONENT_STACK,
      });
    } catch {
      // Diagnostic storage must never rethrow the native feedback failure.
    }
    return 'failed';
  }
}
