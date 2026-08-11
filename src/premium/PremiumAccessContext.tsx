import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  PRODUCT_CATEGORY,
  PRODUCT_TYPE,
  type CustomerInfo,
  type CustomerInfoUpdateListener,
  type PurchasesPackage,
  type PurchasesOfferings,
} from 'react-native-purchases';

import { hasPremiumCuts } from './access';

type PremiumAccessContextValue = {
  configured: boolean;
  loading: boolean;
  purchasing: boolean;
  isPremium: boolean;
  purchaseConfigured: boolean;
  priceLabel: string | null;
  error: string | null;
  purchasePremiumCuts: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  verifyPremiumCuts: () => Promise<boolean>;
  refresh: () => Promise<void>;
};

const PremiumAccessContext = createContext<PremiumAccessContextValue | null>(null);

function apiKeyForPlatform(): string {
  if (Platform.OS === 'ios') {
    return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '';
  }
  if (Platform.OS === 'android') {
    return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? '';
  }
  return '';
}

function reviewedProductIdentifierForPlatform(): string {
  if (Platform.OS === 'ios') {
    return (
      process.env.EXPO_PUBLIC_REVENUECAT_IOS_PREMIUM_CUTS_PRODUCT_ID?.trim() ??
      ''
    );
  }
  return '';
}

function messageFrom(error: unknown, fallback: string): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'userCancelled' in error &&
    error.userCancelled === true
  ) {
    return '';
  }
  return error instanceof Error ? error.message : fallback;
}

type PremiumVerificationAttempt =
  | { status: 'confirmed'; customerInfo: CustomerInfo }
  | { status: 'failed'; error: unknown };

type PremiumVerificationResolution = {
  isPremium: boolean;
  error: unknown | null;
};

/**
 * A transport failure is not evidence that a paid entitlement disappeared.
 * Only a successfully returned CustomerInfo snapshot may grant or revoke it.
 */
export function resolvePremiumVerificationAttempt(
  lastConfirmedAccess: boolean,
  attempt: PremiumVerificationAttempt,
): PremiumVerificationResolution {
  if (attempt.status === 'failed') {
    return { isPremium: lastConfirmedAccess, error: attempt.error };
  }
  return {
    isPremium: hasPremiumCuts(attempt.customerInfo),
    error: null,
  };
}

type PremiumRefreshDependencies = {
  getCustomerInfo: () => Promise<CustomerInfo>;
  getOfferings: () => Promise<PurchasesOfferings>;
  reviewedProductIdentifier: string;
  onCustomerInfo: (customerInfo: CustomerInfo) => void;
  onPermanentPackage: (premiumPackage: PurchasesPackage | null) => void;
};

type PremiumRefreshResult = {
  customerInfoError: unknown | null;
  offeringsError: unknown | null;
  permanentPackageMissing: boolean;
};

/**
 * RevenueCat package labels are dashboard metadata, not a store-product
 * guarantee. A package named LIFETIME can still point at the wrong SKU or a
 * subscription, so purchases are enabled only for the exact reviewed Apple
 * product and verified non-consumable metadata.
 */
export function selectReviewedPermanentPackage(
  offerings: PurchasesOfferings,
  reviewedProductIdentifier: string,
): PurchasesPackage | null {
  if (!reviewedProductIdentifier) {
    return null;
  }

  const candidate = offerings.current?.availablePackages.find(
    (premiumPackage) =>
      premiumPackage.product.identifier === reviewedProductIdentifier &&
      premiumPackage.product.productCategory ===
        PRODUCT_CATEGORY.NON_SUBSCRIPTION &&
      premiumPackage.product.productType === PRODUCT_TYPE.NON_CONSUMABLE &&
      premiumPackage.product.subscriptionPeriod === null,
  );
  return candidate ?? null;
}

/**
 * CustomerInfo and Offerings have different jobs and failure modes.
 *
 * RevenueCat can return cached CustomerInfo while the store is offline, so
 * entitlement must be applied as soon as that request resolves. Offerings only
 * controls whether a new lifetime purchase can be started.
 */
export async function refreshPremiumAccessData({
  getCustomerInfo,
  getOfferings,
  reviewedProductIdentifier,
  onCustomerInfo,
  onPermanentPackage,
}: PremiumRefreshDependencies): Promise<PremiumRefreshResult> {
  let permanentPackageMissing = false;

  // A stale package must not remain purchasable while its offering is being
  // revalidated. This does not change a previously confirmed entitlement.
  onPermanentPackage(null);

  const customerInfoRequest = getCustomerInfo().then((customerInfo) => {
    onCustomerInfo(customerInfo);
  });
  const offeringsRequest = getOfferings().then((offerings) => {
    const permanentPackage = selectReviewedPermanentPackage(
      offerings,
      reviewedProductIdentifier,
    );
    permanentPackageMissing = permanentPackage === null;
    onPermanentPackage(permanentPackage);
  });

  const [customerInfoResult, offeringsResult] = await Promise.allSettled([
    customerInfoRequest,
    offeringsRequest,
  ]);

  return {
    customerInfoError:
      customerInfoResult.status === 'rejected'
        ? customerInfoResult.reason
        : null,
    offeringsError:
      offeringsResult.status === 'rejected' ? offeringsResult.reason : null,
    permanentPackageMissing,
  };
}

export function PremiumAccessProvider({ children }: { children: React.ReactNode }) {
  const apiKey = useMemo(apiKeyForPlatform, []);
  const reviewedProductIdentifier = useMemo(
    reviewedProductIdentifierForPlatform,
    [],
  );
  const configured = apiKey.length > 0;
  const purchaseConfigured =
    configured && reviewedProductIdentifier.length > 0;
  const mounted = useRef(true);
  const confirmedPremiumAccess = useRef(false);
  const [loading, setLoading] = useState(configured);
  const [purchasing, setPurchasing] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [premiumPackage, setPremiumPackage] = useState<PurchasesPackage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyCustomerInfo = useCallback((customerInfo: CustomerInfo) => {
    const resolution = resolvePremiumVerificationAttempt(
      confirmedPremiumAccess.current,
      { status: 'confirmed', customerInfo },
    );
    confirmedPremiumAccess.current = resolution.isPremium;
    if (mounted.current) {
      setIsPremium(resolution.isPremium);
    }
    return resolution.isPremium;
  }, []);

  const refresh = useCallback(async () => {
    if (!configured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const result = await refreshPremiumAccessData({
      getCustomerInfo: () => Purchases.getCustomerInfo(),
      getOfferings: () => Purchases.getOfferings(),
      reviewedProductIdentifier,
      onCustomerInfo: applyCustomerInfo,
      onPermanentPackage: (permanentPackage) => {
        if (mounted.current) {
          setPremiumPackage(permanentPackage);
        }
      },
    });

    if (!mounted.current) {
      return;
    }

    if (!reviewedProductIdentifier) {
      setError(
        'The reviewed permanent Premium Cuts product is not configured for this build.',
      );
    } else if (result.customerInfoError) {
      setError(
        messageFrom(
          result.customerInfoError,
          'Could not verify Premium Cuts access.',
        ),
      );
    } else if (result.offeringsError) {
      setError(
        messageFrom(
          result.offeringsError,
          'Could not load the permanent purchase from the store.',
        ),
      );
    } else if (result.permanentPackageMissing) {
      setError(
        'The reviewed permanent Premium Cuts product is not available from the store right now.',
      );
    }

    setLoading(false);
  }, [applyCustomerInfo, configured, reviewedProductIdentifier]);

  useEffect(() => {
    mounted.current = true;
    if (!configured) {
      setLoading(false);
      return () => {
        mounted.current = false;
      };
    }

    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.INFO : LOG_LEVEL.WARN);
    Purchases.configure({ apiKey });

    const listener: CustomerInfoUpdateListener = (customerInfo) => {
      applyCustomerInfo(customerInfo);
    };
    Purchases.addCustomerInfoUpdateListener(listener);
    void refresh();

    return () => {
      mounted.current = false;
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [apiKey, applyCustomerInfo, configured, refresh]);

  const purchasePremiumCuts = useCallback(async () => {
    if (!configured) {
      setError('Purchases are not configured for this build.');
      return false;
    }
    if (!purchaseConfigured || !premiumPackage) {
      setError('Premium Cuts is not available from the store right now.');
      return false;
    }

    setPurchasing(true);
    setError(null);
    try {
      const result = await Purchases.purchasePackage(premiumPackage);
      const active = applyCustomerInfo(result.customerInfo);
      if (mounted.current) {
        if (!active) {
          setError('The purchase completed, but access is still pending.');
        }
      }
      return active;
    } catch (caught) {
      const message = messageFrom(caught, 'The purchase could not be completed.');
      if (mounted.current && message) {
        setError(message);
      }
      return false;
    } finally {
      if (mounted.current) {
        setPurchasing(false);
      }
    }
  }, [applyCustomerInfo, configured, premiumPackage, purchaseConfigured]);

  const verifyPremiumCuts = useCallback(async () => {
    if (!configured) {
      if (mounted.current) {
        setIsPremium(false);
        setError('Purchases are not configured for this build.');
      }
      return false;
    }

    try {
      const customerInfo = await Purchases.getCustomerInfo();
      const active = applyCustomerInfo(customerInfo);
      if (mounted.current) {
        setError(null);
      }
      return active;
    } catch (caught) {
      const resolution = resolvePremiumVerificationAttempt(
        confirmedPremiumAccess.current,
        { status: 'failed', error: caught },
      );
      if (mounted.current) {
        setIsPremium(resolution.isPremium);
        setError(
          messageFrom(
            resolution.error,
            'Could not verify Premium Cuts access.',
          ),
        );
      }
      return resolution.isPremium;
    }
  }, [applyCustomerInfo, configured]);

  const restorePurchases = useCallback(async () => {
    if (!configured) {
      setError('Purchases are not configured for this build.');
      return false;
    }

    setPurchasing(true);
    setError(null);
    try {
      const customerInfo = await Purchases.restorePurchases();
      const active = applyCustomerInfo(customerInfo);
      if (mounted.current) {
        if (!active) {
          setError('No previous Premium Cuts purchase was found.');
        }
      }
      return active;
    } catch (caught) {
      if (mounted.current) {
        setError(messageFrom(caught, 'Purchases could not be restored.'));
      }
      return false;
    } finally {
      if (mounted.current) {
        setPurchasing(false);
      }
    }
  }, [applyCustomerInfo, configured]);

  const value = useMemo<PremiumAccessContextValue>(
    () => ({
      configured,
      loading,
      purchasing,
      isPremium,
      purchaseConfigured,
      priceLabel: premiumPackage?.product.priceString ?? null,
      error,
      purchasePremiumCuts,
      restorePurchases,
      verifyPremiumCuts,
      refresh,
    }),
    [
      configured,
      error,
      isPremium,
      loading,
      premiumPackage,
      purchaseConfigured,
      purchasePremiumCuts,
      purchasing,
      refresh,
      restorePurchases,
      verifyPremiumCuts,
    ],
  );

  return (
    <PremiumAccessContext.Provider value={value}>
      {children}
    </PremiumAccessContext.Provider>
  );
}

export function usePremiumAccess(): PremiumAccessContextValue {
  const context = useContext(PremiumAccessContext);
  if (!context) {
    throw new Error('usePremiumAccess must be used inside PremiumAccessProvider');
  }
  return context;
}
