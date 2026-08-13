import { PURCHASES_ERROR_CODE } from 'react-native-purchases';

export type PremiumStoreOperation =
  | 'load'
  | 'verify'
  | 'purchase'
  | 'restore';

function errorRecord(error: unknown): Record<string, unknown> | null {
  return typeof error === 'object' && error !== null
    ? (error as Record<string, unknown>)
    : null;
}

export function premiumStoreErrorCode(error: unknown): string | null {
  const code = errorRecord(error)?.code;
  return typeof code === 'string' || typeof code === 'number'
    ? String(code)
    : null;
}

function operationFallback(operation: PremiumStoreOperation): string {
  switch (operation) {
    case 'load':
      return 'Store purchase options could not be loaded. Try again.';
    case 'verify':
      return 'Premium Cuts access could not be verified. Try again.';
    case 'restore':
      return 'Purchases could not be restored. Try again.';
    case 'purchase':
      return 'The purchase could not be completed. Try again.';
  }
}

/**
 * Converts RevenueCat failures into stable user actions. SDK messages can
 * contain implementation, dashboard, receipt, or credential details and are
 * intentionally never returned to the UI.
 */
export function premiumStoreErrorMessage(
  error: unknown,
  operation: PremiumStoreOperation,
): string | null {
  const record = errorRecord(error);
  const code = premiumStoreErrorCode(error);
  if (
    record?.userCancelled === true ||
    code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
  ) {
    return null;
  }

  if (
    code === PURCHASES_ERROR_CODE.NETWORK_ERROR ||
    code === PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR ||
    code === PURCHASES_ERROR_CODE.PRODUCT_REQUEST_TIMED_OUT_ERROR ||
    code === PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR
  ) {
    return 'The store could not be reached. Check your connection and try again.';
  }
  if (code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) {
    return 'Your purchase is pending approval. Premium Cuts will unlock automatically after approval.';
  }
  if (code === PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR) {
    return 'Premium Cuts was already purchased. Restore purchases to unlock it on this device.';
  }
  if (
    code === PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR ||
    code === PURCHASES_ERROR_CODE.INSUFFICIENT_PERMISSIONS_ERROR
  ) {
    return "Purchases are not allowed for this store account or device.";
  }
  if (
    code === PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR ||
    code === PURCHASES_ERROR_CODE.UNSUPPORTED_ERROR
  ) {
    return 'Premium Cuts is not available from the store right now.';
  }
  if (
    code === PURCHASES_ERROR_CODE.CONFIGURATION_ERROR ||
    code === PURCHASES_ERROR_CODE.API_ENDPOINT_BLOCKED
  ) {
    return 'Premium Cuts is unavailable in this build.';
  }

  return operationFallback(operation);
}
