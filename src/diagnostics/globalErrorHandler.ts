import { clientDiagnostics } from './clientDiagnostics';

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;

type ErrorUtilsLike = {
  getGlobalHandler(): GlobalErrorHandler;
  setGlobalHandler(handler: GlobalErrorHandler): void;
};

/**
 * React Native reports uncaught JavaScript exceptions through ErrorUtils.
 * Keep the platform's handler authoritative while retaining a tiny redacted
 * local receipt that a player can explicitly share with support.
 */
export function installGlobalErrorDiagnostics(): () => void {
  const errorUtils = (
    globalThis as typeof globalThis & { ErrorUtils?: ErrorUtilsLike }
  ).ErrorUtils;
  if (!errorUtils) {
    return () => undefined;
  }

  const previousHandler = errorUtils.getGlobalHandler();
  const diagnosticHandler: GlobalErrorHandler = (error, isFatal = false) => {
    void clientDiagnostics.record({
      kind: 'global_js_error',
      error,
      fatal: isFatal,
    });
    previousHandler(error, isFatal);
  };
  errorUtils.setGlobalHandler(diagnosticHandler);

  return () => {
    if (errorUtils.getGlobalHandler() === diagnosticHandler) {
      errorUtils.setGlobalHandler(previousHandler);
    }
  };
}
