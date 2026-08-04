import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  androidAccessibilityLiveRegion,
  useAccessibilityAnnouncement,
} from '../../../accessibility';
import { Button } from '../../../components/Button';
import {
  completePremiumUnlockOnce,
  usePremiumAccess,
} from '../../../premium';
import { colors, MIN_TOUCH_TARGET, radius, spacing } from '../../../theme';

type PremiumCutsSheetProps = {
  visible: boolean;
  onClose: () => void;
  onUnlocked: () => void;
};

export function PremiumCutsSheet({
  visible,
  onClose,
  onUnlocked,
}: PremiumCutsSheetProps) {
  const insets = useSafeAreaInsets();
  const {
    configured,
    loading,
    purchasing,
    isPremium,
    purchaseConfigured,
    priceLabel,
    error,
    purchasePremiumCuts,
    restorePurchases,
    refresh,
  } = usePremiumAccess();
  const unlockHandled = React.useRef(false);
  const storeStatus = loading
    ? 'Loading Premium Cuts purchase options…'
    : purchasing
      ? 'Contacting the store…'
      : error;
  useAccessibilityAnnouncement(visible ? storeStatus : null);

  React.useEffect(() => {
    if (!visible) {
      unlockHandled.current = false;
      return;
    }
    completePremiumUnlockOnce(isPremium, unlockHandled, onUnlocked, onClose);
  }, [isPremium, onClose, onUnlocked, visible]);

  const purchase = async () => {
    if (await purchasePremiumCuts()) {
      completePremiumUnlockOnce(true, unlockHandled, onUnlocked, onClose);
    }
  };

  const restore = async () => {
    if (await restorePurchases()) {
      completePremiumUnlockOnce(true, unlockHandled, onUnlocked, onClose);
    }
  };

  const retryOfferings = () => {
    void refresh();
  };

  const primaryLabel = priceLabel
    ? `Unlock permanently for ${priceLabel}`
    : 'Permanent purchase unavailable';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <View
          style={styles.sheet}
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.sheetContent,
              {
                paddingBottom: Math.max(insets.bottom, spacing.xl),
                paddingLeft: Math.max(insets.left, spacing.xl),
                paddingRight: Math.max(insets.right, spacing.xl),
              },
            ]}
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.sheetHeader}>
              <View
                style={styles.handle}
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close Premium Cuts"
                accessibilityHint="Dismisses the Premium Cuts sheet"
                hitSlop={8}
                style={({ pressed }) => [
                  styles.closeButton,
                  pressed && styles.closeButtonPressed,
                ]}
              >
                <Ionicons
                  name="close"
                  size={24}
                  color={colors.textPrimary}
                  accessible={false}
                  importantForAccessibility="no"
                />
              </Pressable>
            </View>

            <View
              style={styles.icon}
              accessible={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Ionicons
                name="shapes-outline"
                size={28}
                color={colors.accent}
              />
            </View>
            <Text style={styles.eyebrow}>Premium Cuts</Text>
            <Text style={styles.title} accessibilityRole="header">
              Cuts that feel alive
            </Text>
            <Text style={styles.body}>
              Unlock Organic and Living pieces: flowing seams plus branching
              cells grown by a crystal-like simulation. Every difficulty stays
              free.
            </Text>

            <View style={styles.feature}>
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={colors.accent}
                accessible={false}
                importantForAccessibility="no"
              />
              <Text style={styles.featureText}>
                Both premium cut styles included
              </Text>
            </View>
            <View style={styles.feature}>
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={colors.accent}
                accessible={false}
                importantForAccessibility="no"
              />
              <Text style={styles.featureText}>
                One purchase, permanent access
              </Text>
            </View>
            <View style={styles.feature}>
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={colors.accent}
                accessible={false}
                importantForAccessibility="no"
              />
              <Text style={styles.featureText}>
                Restore with the same store account
              </Text>
            </View>

            {loading ? (
              <View
                style={styles.loader}
                accessibilityLiveRegion={androidAccessibilityLiveRegion(
                  'polite',
                )}
              >
                <ActivityIndicator color={colors.accent} accessible={false} />
                <Text style={styles.loaderText}>
                  Loading purchase options…
                </Text>
              </View>
            ) : (
              <View style={styles.actions}>
                <Button
                  label={purchasing ? 'Contacting store…' : primaryLabel}
                  onPress={purchase}
                  disabled={!purchaseConfigured || purchasing || !priceLabel}
                  block
                />
                <Button
                  label="Restore purchases"
                  variant="secondary"
                  onPress={restore}
                  disabled={!configured || purchasing}
                  block
                />
                <Button
                  label="Not now"
                  variant="ghost"
                  onPress={onClose}
                  block
                />
              </View>
            )}

            {purchasing ? (
              <Text
                style={styles.storeStatus}
                accessibilityLiveRegion={androidAccessibilityLiveRegion(
                  'polite',
                )}
              >
                Contacting the store…
              </Text>
            ) : null}
            {!configured ? (
              <Text style={styles.notice}>
                Purchases are unavailable in this build.
              </Text>
            ) : !purchaseConfigured ? (
              <Text style={styles.notice}>
                The reviewed permanent purchase is unavailable in this build.
              </Text>
            ) : null}
            {error ? (
              <Text
                style={styles.error}
                accessibilityLiveRegion={androidAccessibilityLiveRegion(
                  'polite',
                )}
              >
                {error}
              </Text>
            ) : null}
            {purchaseConfigured && !loading && !priceLabel && error ? (
              <View style={styles.retry}>
                <Button
                  label="Try loading the store again"
                  variant="secondary"
                  onPress={retryOfferings}
                  disabled={purchasing}
                  block
                />
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '94%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    overflow: 'hidden',
  },
  scroll: {
    width: '100%',
  },
  sheetContent: {
    paddingTop: spacing.md,
  },
  sheetHeader: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
  },
  closeButtonPressed: {
    opacity: 0.72,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    marginBottom: spacing.lg,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginTop: spacing.sm,
  },
  body: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 23,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  feature: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  featureText: {
    color: colors.textPrimary,
    fontSize: 15,
  },
  loader: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginVertical: spacing.xxl,
  },
  loaderText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  storeStatus: {
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.md,
  },
  notice: {
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: 13,
    marginTop: spacing.md,
  },
  error: {
    color: colors.danger,
    textAlign: 'center',
    fontSize: 13,
    marginTop: spacing.md,
  },
  retry: {
    marginTop: spacing.md,
  },
});
