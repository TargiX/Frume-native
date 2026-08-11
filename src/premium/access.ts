import type { CustomerInfo } from 'react-native-purchases';

import type { PuzzleCutterId } from '../puzzle/types';

export const PREMIUM_CUTS_ENTITLEMENT = 'premium_cut_styles';

export function isPremiumCutter(cutterId: PuzzleCutterId): boolean {
  return cutterId !== 'classic';
}

export function hasPremiumCuts(customerInfo: CustomerInfo): boolean {
  return customerInfo.entitlements.active[PREMIUM_CUTS_ENTITLEMENT]?.isActive === true;
}
