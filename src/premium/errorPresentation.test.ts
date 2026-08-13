import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native-purchases', () => ({
  PURCHASES_ERROR_CODE: {
    PURCHASE_CANCELLED_ERROR: '1',
    STORE_PROBLEM_ERROR: '2',
    PURCHASE_NOT_ALLOWED_ERROR: '3',
    PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR: '5',
    PRODUCT_ALREADY_PURCHASED_ERROR: '6',
    NETWORK_ERROR: '10',
    INSUFFICIENT_PERMISSIONS_ERROR: '19',
    PAYMENT_PENDING_ERROR: '20',
    CONFIGURATION_ERROR: '23',
    UNSUPPORTED_ERROR: '24',
    PRODUCT_REQUEST_TIMED_OUT_ERROR: '32',
    API_ENDPOINT_BLOCKED: '33',
    OFFLINE_CONNECTION_ERROR: '35',
  },
}));

import { premiumStoreErrorMessage } from './errorPresentation';

describe('premium store error presentation', () => {
  it('keeps user cancellation silent across SDK representations', () => {
    expect(
      premiumStoreErrorMessage({ code: '1' }, 'purchase'),
    ).toBeNull();
    expect(
      premiumStoreErrorMessage({ userCancelled: true }, 'purchase'),
    ).toBeNull();
  });

  it('maps connectivity and pending approval to stable next steps', () => {
    expect(
      premiumStoreErrorMessage({ code: '35' }, 'purchase'),
    ).toBe('The store could not be reached. Check your connection and try again.');
    expect(
      premiumStoreErrorMessage({ code: '20' }, 'purchase'),
    ).toBe(
      'Your purchase is pending approval. Premium Cuts will unlock automatically after approval.',
    );
  });

  it('maps account and catalog failures without exposing SDK details', () => {
    expect(
      premiumStoreErrorMessage({ code: '3' }, 'purchase'),
    ).toBe("Purchases are not allowed for this store account or device.");
    expect(
      premiumStoreErrorMessage({ code: '5' }, 'purchase'),
    ).toBe('Premium Cuts is not available from the store right now.');
  });

  it('never displays an unknown technical message or credential detail', () => {
    const secret = 'invalid api key test_super_secret';

    expect(
      premiumStoreErrorMessage(new Error(secret), 'purchase'),
    ).toBe('The purchase could not be completed. Try again.');
    expect(
      premiumStoreErrorMessage(
        { code: '23', message: secret },
        'restore',
      ),
    ).toBe('Premium Cuts is unavailable in this build.');
  });

  it('uses operation-specific fallbacks for unknown errors', () => {
    expect(premiumStoreErrorMessage({}, 'load')).toBe(
      'Store purchase options could not be loaded. Try again.',
    );
    expect(premiumStoreErrorMessage({}, 'verify')).toBe(
      'Premium Cuts access could not be verified. Try again.',
    );
    expect(premiumStoreErrorMessage({}, 'restore')).toBe(
      'Purchases could not be restored. Try again.',
    );
  });
});
