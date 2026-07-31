import type {
  CustomerInfo,
  PurchasesOfferings,
  PurchasesPackage,
  PurchasesStoreProduct,
} from 'react-native-purchases';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

vi.mock('react-native-purchases', () => ({
  default: {
    PACKAGE_TYPE: { LIFETIME: 'LIFETIME' },
  },
  PRODUCT_CATEGORY: {
    NON_SUBSCRIPTION: 'NON_SUBSCRIPTION',
    SUBSCRIPTION: 'SUBSCRIPTION',
    UNKNOWN: 'UNKNOWN',
  },
  PRODUCT_TYPE: {
    CONSUMABLE: 'CONSUMABLE',
    NON_CONSUMABLE: 'NON_CONSUMABLE',
    AUTO_RENEWABLE_SUBSCRIPTION: 'AUTO_RENEWABLE_SUBSCRIPTION',
    UNKNOWN: 'UNKNOWN',
  },
  LOG_LEVEL: {
    INFO: 'INFO',
    WARN: 'WARN',
  },
}));

import {
  refreshPremiumAccessData,
  resolvePremiumVerificationAttempt,
  selectReviewedPermanentPackage,
} from './PremiumAccessContext';

const LIFETIME = 'LIFETIME' as PurchasesPackage['packageType'];
const MONTHLY = 'MONTHLY' as PurchasesPackage['packageType'];
const NON_SUBSCRIPTION =
  'NON_SUBSCRIPTION' as PurchasesStoreProduct['productCategory'];
const SUBSCRIPTION =
  'SUBSCRIPTION' as PurchasesStoreProduct['productCategory'];
const UNKNOWN_CATEGORY =
  'UNKNOWN' as PurchasesStoreProduct['productCategory'];
const NON_CONSUMABLE =
  'NON_CONSUMABLE' as PurchasesStoreProduct['productType'];
const CONSUMABLE = 'CONSUMABLE' as PurchasesStoreProduct['productType'];
const AUTO_RENEWABLE_SUBSCRIPTION =
  'AUTO_RENEWABLE_SUBSCRIPTION' as PurchasesStoreProduct['productType'];
const UNKNOWN_PRODUCT_TYPE =
  'UNKNOWN' as PurchasesStoreProduct['productType'];
const REVIEWED_PRODUCT_ID = 'com.targix.frume.premium-cuts';

function premiumPackage(
  packageIdentifier: string,
  packageType: PurchasesPackage['packageType'],
  {
    productIdentifier = REVIEWED_PRODUCT_ID,
    productCategory = NON_SUBSCRIPTION,
    productType = NON_CONSUMABLE,
    subscriptionPeriod = null,
  }: {
    productIdentifier?: string;
    productCategory?: PurchasesStoreProduct['productCategory'];
    productType?: PurchasesStoreProduct['productType'];
    subscriptionPeriod?: string | null;
  } = {},
): PurchasesPackage {
  return {
    identifier: packageIdentifier,
    packageType,
    product: {
      identifier: productIdentifier,
      priceString: '$4.99',
      productCategory,
      productType,
      subscriptionPeriod,
    },
  } as PurchasesPackage;
}

function offerings(
  availablePackages: PurchasesPackage[],
): PurchasesOfferings {
  return {
    all: {},
    current: {
      availablePackages,
    },
  } as PurchasesOfferings;
}

function customerInfo(active = false): CustomerInfo {
  return {
    entitlements: {
      active: active
        ? {
            premium_cut_styles: { isActive: true },
          }
        : {},
    },
  } as unknown as CustomerInfo;
}

describe('resolvePremiumVerificationAttempt', () => {
  it('preserves the last confirmed entitlement after a transport failure', () => {
    const offline = new Error('offline');

    expect(
      resolvePremiumVerificationAttempt(true, {
        status: 'failed',
        error: offline,
      }),
    ).toEqual({ isPremium: true, error: offline });
  });

  it('lets successful CustomerInfo grant or revoke the entitlement', () => {
    expect(
      resolvePremiumVerificationAttempt(false, {
        status: 'confirmed',
        customerInfo: customerInfo(true),
      }),
    ).toEqual({ isPremium: true, error: null });
    expect(
      resolvePremiumVerificationAttempt(true, {
        status: 'confirmed',
        customerInfo: customerInfo(false),
      }),
    ).toEqual({ isPremium: false, error: null });
  });
});

describe('selectReviewedPermanentPackage', () => {
  it('selects only the reviewed exact non-consumable product', () => {
    const reviewed = premiumPackage('custom-dashboard-label', MONTHLY);

    expect(
      selectReviewedPermanentPackage(
        offerings([reviewed]),
        REVIEWED_PRODUCT_ID,
      ),
    ).toBe(reviewed);
  });

  it('rejects a LIFETIME package when its store product is a subscription', () => {
    const disguisedSubscription = premiumPackage('lifetime', LIFETIME, {
      productCategory: SUBSCRIPTION,
      productType: AUTO_RENEWABLE_SUBSCRIPTION,
      subscriptionPeriod: 'P1M',
    });

    expect(
      selectReviewedPermanentPackage(
        offerings([disguisedSubscription]),
        REVIEWED_PRODUCT_ID,
      ),
    ).toBeNull();
  });

  it('rejects unknown product metadata and a non-reviewed identifier', () => {
    const unknown = premiumPackage('lifetime', LIFETIME, {
      productCategory: UNKNOWN_CATEGORY,
      productType: UNKNOWN_PRODUCT_TYPE,
    });
    const wrongProduct = premiumPackage('lifetime', LIFETIME, {
      productIdentifier: 'com.example.some-other-product',
    });
    const consumable = premiumPackage('lifetime', LIFETIME, {
      productType: CONSUMABLE,
    });

    expect(
      selectReviewedPermanentPackage(
        offerings([unknown, wrongProduct, consumable]),
        REVIEWED_PRODUCT_ID,
      ),
    ).toBeNull();
  });

  it('fails closed when there is no current offering', () => {
    expect(
      selectReviewedPermanentPackage(
        { all: {}, current: null },
        REVIEWED_PRODUCT_ID,
      ),
    ).toBeNull();
  });

  it('fails closed when no reviewed product identifier was configured', () => {
    const lifetime = premiumPackage('lifetime', LIFETIME);

    expect(
      selectReviewedPermanentPackage(offerings([lifetime]), ''),
    ).toBeNull();
  });
});

describe('refreshPremiumAccessData', () => {
  it('applies CustomerInfo before a still-pending Offerings request', async () => {
    const info = customerInfo();
    const onCustomerInfo = vi.fn();
    const onLifetimePackage = vi.fn();
    let rejectOfferings: ((reason: Error) => void) | undefined;
    const pendingOfferings = new Promise<PurchasesOfferings>(
      (_resolve, reject) => {
        rejectOfferings = reject;
      },
    );

    const refresh = refreshPremiumAccessData({
      getCustomerInfo: async () => info,
      getOfferings: () => pendingOfferings,
      reviewedProductIdentifier: REVIEWED_PRODUCT_ID,
      onCustomerInfo,
      onPermanentPackage: onLifetimePackage,
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(onCustomerInfo).toHaveBeenCalledWith(info);

    rejectOfferings?.(new Error('offline'));
    const result = await refresh;

    expect(result.offeringsError).toEqual(new Error('offline'));
    expect(result.customerInfoError).toBeNull();
  });

  it('clears a stale purchase package and never substitutes an unreviewed product', async () => {
    const monthly = premiumPackage('monthly', MONTHLY, {
      productIdentifier: 'com.example.subscription',
      productCategory: SUBSCRIPTION,
      productType: AUTO_RENEWABLE_SUBSCRIPTION,
      subscriptionPeriod: 'P1M',
    });
    const onLifetimePackage = vi.fn();

    const result = await refreshPremiumAccessData({
      getCustomerInfo: async () => customerInfo(),
      getOfferings: async () => offerings([monthly]),
      reviewedProductIdentifier: REVIEWED_PRODUCT_ID,
      onCustomerInfo: vi.fn(),
      onPermanentPackage: onLifetimePackage,
    });

    expect(onLifetimePackage).toHaveBeenNthCalledWith(1, null);
    expect(onLifetimePackage).toHaveBeenNthCalledWith(2, null);
    expect(result.permanentPackageMissing).toBe(true);
    expect(result.offeringsError).toBeNull();
  });
});
