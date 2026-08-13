import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  androidAccessibilityLiveRegion,
  useAccessibilityAnnouncement,
} from '../../../accessibility';
import { Button } from '../../../components/Button';
import { Screen } from '../../../components/Screen';
import {
  buildClientDiagnosticsReport,
  clientDiagnostics,
  type ClientDiagnostic,
} from '../../../diagnostics/clientDiagnostics';
import type { PlayStackParamList } from '../../../navigation/types';
import { usePremiumAccess } from '../../../premium';
import {
  parsePublicLink,
  type PublicLink,
} from '../../../release/publicLinks';
import {
  colors,
  MIN_TOUCH_TARGET,
  radius,
  spacing,
} from '../../../theme';
import { CATEGORY_COVER_CREDITS } from './categoryCovers';

type Props = NativeStackScreenProps<PlayStackParamList, 'AboutSupport'>;

type ExternalLinkRowProps = {
  title: string;
  description: string;
  link: PublicLink;
  onOpen: (link: PublicLink) => void;
};

function configurationMessage(link: PublicLink): string | null {
  if (link.status === 'missing') {
    return 'Not configured for this build.';
  }
  if (link.status === 'invalid') {
    return 'This build has an invalid link configuration.';
  }
  return null;
}

function ExternalLinkRow({
  title,
  description,
  link,
  onOpen,
}: ExternalLinkRowProps) {
  const unavailableMessage = configurationMessage(link);

  return (
    <View style={styles.linkRow}>
      <View style={styles.linkCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
        {unavailableMessage ? (
          <Text style={styles.configurationMessage}>{unavailableMessage}</Text>
        ) : null}
      </View>
      <Pressable
        onPress={() => onOpen(link)}
        disabled={link.status !== 'ready'}
        accessibilityRole="link"
        accessibilityLabel={`Open ${title.toLowerCase()}`}
        accessibilityHint="Opens outside Frume"
        accessibilityState={{ disabled: link.status !== 'ready' }}
        hitSlop={8}
        style={({ pressed }) => [
          styles.openLink,
          pressed && styles.openLinkPressed,
          link.status !== 'ready' && styles.openLinkDisabled,
        ]}
      >
        <Text style={styles.openLinkLabel}>Open</Text>
      </Pressable>
    </View>
  );
}

export function AboutSupportScreen(_props: Props) {
  const isFocused = useIsFocused();
  const {
    configured,
    loading,
    purchasing,
    isPremium,
    error: purchaseError,
    restorePurchases,
  } = usePremiumAccess();
  const [linkError, setLinkError] = useState<string | null>(null);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<ClientDiagnostic[]>([]);
  const [diagnosticsMessage, setDiagnosticsMessage] = useState<string | null>(
    null,
  );
  const privacyLink = useMemo(
    () =>
      parsePublicLink(
        process.env.EXPO_PUBLIC_PRIVACY_URL,
        'privacy',
      ),
    [],
  );
  const supportLink = useMemo(
    () =>
      parsePublicLink(
        process.env.EXPO_PUBLIC_SUPPORT_URL,
        'support',
      ),
    [],
  );
  const appVersion = Constants.expoConfig?.version ?? 'Unknown';
  const nativeBuild = Platform.select({
    ios: Constants.expoConfig?.ios?.buildNumber,
    android: Constants.expoConfig?.android?.versionCode?.toString(),
  });
  const purchaseStatus = loading
    ? 'Checking store availability…'
    : purchasing
      ? 'Restoring purchases…'
      : purchaseError ?? restoreMessage;
  useAccessibilityAnnouncement(isFocused ? linkError : null);
  useAccessibilityAnnouncement(isFocused ? purchaseStatus : null);
  useAccessibilityAnnouncement(isFocused ? diagnosticsMessage : null);

  useEffect(() => {
    if (!isFocused) {
      return;
    }
    let current = true;
    void clientDiagnostics.load().then((records) => {
      if (current) {
        setDiagnostics(records);
      }
    });
    return () => {
      current = false;
    };
  }, [isFocused]);

  const openExternalLink = async (link: PublicLink) => {
    if (link.status !== 'ready') {
      return;
    }

    setLinkError(null);
    try {
      const supported = await Linking.canOpenURL(link.url);
      if (!supported) {
        setLinkError('This link cannot be opened on this device.');
        return;
      }
      await Linking.openURL(link.url);
    } catch {
      setLinkError('Frume could not open the link. Please try again.');
    }
  };

  const restore = async () => {
    setRestoreMessage(null);
    const restored = await restorePurchases();
    if (restored) {
      setRestoreMessage('Premium Cuts restored.');
    }
  };

  const shareDiagnostics = async () => {
    if (diagnostics.length === 0) {
      setDiagnosticsMessage('There are no saved diagnostics to share.');
      return;
    }
    setDiagnosticsMessage(null);
    try {
      await Share.share({
        message: buildClientDiagnosticsReport(
          diagnostics,
          appVersion,
          nativeBuild,
        ),
        title: 'Frume diagnostics',
      });
    } catch {
      setDiagnosticsMessage('Diagnostics could not be shared. Try again.');
    }
  };

  const clearDiagnostics = async () => {
    setDiagnosticsMessage(null);
    if (!(await clientDiagnostics.clear())) {
      setDiagnosticsMessage('Diagnostics could not be cleared. Try again.');
      return;
    }
    setDiagnostics([]);
    setDiagnosticsMessage('Saved diagnostics cleared.');
  };

  return (
    <Screen scroll style={styles.content}>
      <Text style={styles.eyebrow}>Frume</Text>
      <Text style={styles.title} accessibilityRole="header">
        About &amp; Support
      </Text>
      <Text style={styles.intro}>
        A quiet place to solve photographs, one piece at a time.
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Your data
        </Text>
        <View style={styles.card}>
          <View style={styles.summaryItem}>
            <Text style={styles.rowTitle}>Puzzle photos</Text>
            <Text style={styles.rowDescription}>
              Frume requests curated photo metadata through its server-side
              Unsplash proxy. When you start a puzzle, the app asks that proxy
              to register the photo use with Unsplash. If you are offline, the
              pending provider-use receipt stays in local app storage until it
              can be sent.
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryItem}>
            <Text style={styles.rowTitle}>Premium access</Text>
            <Text style={styles.rowDescription}>
              RevenueCat uses an anonymous app-user identifier and store
              entitlement status to determine whether Premium Cuts is
              unlocked. You do not create a Frume account.
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryItem}>
            <Text style={styles.rowTitle}>Saved puzzle</Text>
            <Text style={styles.rowDescription}>
              Your current puzzle state is kept in the app&apos;s local storage
              so you can continue it later.
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Cover photography
        </Text>
        <Text style={styles.sectionIntro}>
          Theme covers are credited here. Puzzle photos also include linked
          photographer credit on setup and in puzzle options.
        </Text>
        <View style={styles.card}>
          {CATEGORY_COVER_CREDITS.map((credit, index) => (
            <React.Fragment key={credit.category}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <ExternalLinkRow
                title={credit.category}
                description={`Photo by ${credit.photographer} on Unsplash`}
                link={{ status: 'ready', url: credit.photoUrl }}
                onOpen={(link) => void openExternalLink(link)}
              />
            </React.Fragment>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Help &amp; policies
        </Text>
        <View style={styles.card}>
          <ExternalLinkRow
            title="Privacy policy"
            description="Read the complete policy in your browser."
            link={privacyLink}
            onOpen={(link) => void openExternalLink(link)}
          />
          <View style={styles.divider} />
          <ExternalLinkRow
            title="Contact support"
            description="Get help with Frume or report a problem."
            link={supportLink}
            onOpen={(link) => void openExternalLink(link)}
          />
        </View>
        {linkError ? (
          <Text
            style={styles.error}
            accessibilityLiveRegion={androidAccessibilityLiveRegion(
              'assertive',
            )}
            accessibilityRole="alert"
          >
            {linkError}
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Purchases
        </Text>
        <View style={styles.card}>
          <Text style={styles.rowTitle}>
            {isPremium ? 'Premium Cuts unlocked' : 'Restore Premium Cuts'}
          </Text>
          <Text style={styles.rowDescription}>
            {configured
              ? 'Already purchased on this store account? Restore access without being charged again.'
              : 'Store access is not configured for this build.'}
          </Text>
          <View style={styles.restoreButton}>
            <Button
              label={purchasing ? 'Restoring…' : 'Restore purchases'}
              onPress={() => void restore()}
              variant="secondary"
              disabled={!configured || loading || purchasing}
              accessibilityHint="Checks this store account for a previous Premium Cuts purchase"
            />
          </View>
          {purchaseStatus ? (
            <Text
              style={
                !loading && !purchasing && purchaseError
                  ? styles.error
                  : !loading && !purchasing && restoreMessage
                    ? styles.success
                    : styles.purchaseStatus
              }
              accessibilityLiveRegion={androidAccessibilityLiveRegion(
                'polite',
              )}
            >
              {purchaseStatus}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          Diagnostics
        </Text>
        <View style={styles.card}>
          <Text style={styles.rowTitle}>
            {diagnostics.length === 0
              ? 'No saved incidents'
              : `${diagnostics.length} saved incident${
                  diagnostics.length === 1 ? '' : 's'
                }`}
          </Text>
          <Text style={styles.rowDescription}>
            Frume keeps at most ten redacted JavaScript incident receipts on
            this device. They contain no photos, URLs, exception messages,
            names, or device identifiers, and leave the device only when you
            choose to share them.
          </Text>
          <View style={styles.diagnosticActions}>
            <Button
              label="Share diagnostics"
              onPress={() => void shareDiagnostics()}
              variant="secondary"
              disabled={diagnostics.length === 0}
              accessibilityHint="Opens the system share sheet with redacted incident receipts"
            />
            <Button
              label="Clear diagnostics"
              onPress={() => void clearDiagnostics()}
              variant="secondary"
              disabled={diagnostics.length === 0}
              accessibilityHint="Deletes all saved incident receipts from this device"
            />
          </View>
          {diagnosticsMessage ? (
            <Text
              style={styles.purchaseStatus}
              accessibilityLiveRegion={androidAccessibilityLiveRegion(
                'polite',
              )}
            >
              {diagnosticsMessage}
            </Text>
          ) : null}
        </View>
      </View>

      <Text style={styles.version}>
        Version {appVersion}
        {nativeBuild ? ` (${nativeBuild})` : ''}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  intro: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 23,
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
  section: {
    marginBottom: spacing.xxl,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  sectionIntro: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  summaryItem: {
    gap: spacing.xs,
  },
  rowTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
  rowDescription: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  linkRow: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  linkCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  configurationMessage: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  openLink: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  openLinkPressed: {
    opacity: 0.7,
  },
  openLinkDisabled: {
    opacity: 0.35,
  },
  openLinkLabel: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  restoreButton: {
    marginTop: spacing.lg,
  },
  diagnosticActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.md,
  },
  success: {
    color: colors.accent,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.md,
  },
  purchaseStatus: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.md,
  },
  version: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
