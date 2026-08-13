import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  findNodeHandle,
  InteractionManager,
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
  PREMIUM_CUT_CATALOG_COUNT,
  PREMIUM_CUT_CATALOG_LIST,
  usePremiumAccess,
} from '../../../premium';
import { colors, MIN_TOUCH_TARGET, radius, spacing } from '../../../theme';

type PremiumFocusTargetRef =
  | React.RefObject<React.ElementRef<typeof Text> | null>
  | React.RefObject<React.ElementRef<typeof Pressable> | null>;

type PremiumCutsSheetProps = {
  visible: boolean;
  onClose: () => void;
  onCancelled?: () => void;
  onUnlocked: () => void;
  returnFocusRef?: React.RefObject<React.ElementRef<typeof Pressable> | null>;
};

export function PremiumCutsSheet({
  visible,
  onClose,
  onCancelled,
  onUnlocked,
  returnFocusRef,
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
  const headingRef = React.useRef<React.ElementRef<typeof Text>>(null);
  const focusRequestRef = React.useRef(0);
  const focusInteractionRef = React.useRef<ReturnType<
    typeof InteractionManager.runAfterInteractions
  > | null>(null);
  const presentationVisibleRef = React.useRef(false);
  const dismissalRef = React.useRef<'cancelled' | 'unlocked'>('cancelled');
  const storeStatus = loading
    ? 'Loading Premium Cuts purchase options…'
    : purchasing
      ? 'Contacting the store…'
      : error;
  useAccessibilityAnnouncement(visible ? storeStatus : null);

  const focusForScreenReader = React.useCallback(
    (target: PremiumFocusTargetRef) => {
      const requestId = ++focusRequestRef.current;
      focusInteractionRef.current?.cancel();
      focusInteractionRef.current = InteractionManager.runAfterInteractions(
        () => {
          void AccessibilityInfo.isScreenReaderEnabled()
            .then((screenReaderEnabled) => {
              if (
                !screenReaderEnabled ||
                requestId !== focusRequestRef.current
              ) {
                return;
              }
              const node = findNodeHandle(target.current);
              if (node !== null) {
                AccessibilityInfo.setAccessibilityFocus(node);
              }
            })
            .catch(() => undefined);
        },
      );
    },
    [],
  );

  const cancelFocusRequest = React.useCallback(() => {
    focusRequestRef.current += 1;
    focusInteractionRef.current?.cancel();
    focusInteractionRef.current = null;
  }, []);

  const closeAfterUnlock = React.useCallback(() => {
    cancelFocusRequest();
    dismissalRef.current = 'unlocked';
    onClose();
  }, [cancelFocusRequest, onClose]);

  const closeWithoutUnlock = React.useCallback(() => {
    cancelFocusRequest();
    dismissalRef.current = 'cancelled';
    onCancelled?.();
    onClose();
  }, [cancelFocusRequest, onCancelled, onClose]);

  React.useEffect(() => {
    if (!visible) {
      presentationVisibleRef.current = false;
      unlockHandled.current = false;
      cancelFocusRequest();
      return;
    }
    if (!presentationVisibleRef.current) {
      presentationVisibleRef.current = true;
      dismissalRef.current = 'cancelled';
    }
    completePremiumUnlockOnce(
      isPremium,
      unlockHandled,
      onUnlocked,
      closeAfterUnlock,
    );
  }, [cancelFocusRequest, closeAfterUnlock, isPremium, onUnlocked, visible]);

  React.useEffect(
    () => () => {
      cancelFocusRequest();
    },
    [cancelFocusRequest],
  );

  const purchase = async () => {
    if (await purchasePremiumCuts()) {
      completePremiumUnlockOnce(
        true,
        unlockHandled,
        onUnlocked,
        closeAfterUnlock,
      );
    }
  };

  const restore = async () => {
    if (await restorePurchases()) {
      completePremiumUnlockOnce(
        true,
        unlockHandled,
        onUnlocked,
        closeAfterUnlock,
      );
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
      onRequestClose={closeWithoutUnlock}
      onShow={() => focusForScreenReader(headingRef)}
      onDismiss={() => {
        const restoreFocus = dismissalRef.current === 'cancelled';
        dismissalRef.current = 'cancelled';
        if (restoreFocus && returnFocusRef) {
          focusForScreenReader(returnFocusRef);
        }
      }}
      presentationStyle="overFullScreen"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={closeWithoutUnlock}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <View
          style={styles.sheet}
          accessibilityViewIsModal
          onAccessibilityEscape={closeWithoutUnlock}
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
                onPress={closeWithoutUnlock}
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
            <Text
              ref={headingRef}
              style={styles.title}
              accessible
              accessibilityRole="header"
              accessibilityLabel="Premium Cuts. Cuts that feel alive"
            >
              Cuts that feel alive
            </Text>
            <Text style={styles.body}>
              Unlock all {PREMIUM_CUT_CATALOG_COUNT} premium cuts:{' '}
              {PREMIUM_CUT_CATALOG_LIST}. Every puzzle size stays free.
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
                All {PREMIUM_CUT_CATALOG_COUNT} premium cut styles included
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
                  onPress={closeWithoutUnlock}
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
                Premium Cuts is unavailable in this build.
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
    flex: 1,
    flexShrink: 1,
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
