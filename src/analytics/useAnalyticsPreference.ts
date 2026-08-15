import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { setAnalyticsCollectionEnabled } from './analyticsClient';
import {
  getAnalyticsSettingFeedback,
  loadAnalyticsEnabled,
} from './analyticsPreference';

/**
 * Settings-row state for the anonymous-usage switch.
 *
 * Shaped like `useHapticsPreference` so the two rows behave identically, with
 * one difference: saving goes through the analytics client rather than straight
 * to storage, because turning collection off must also drop pending events and
 * forget the installation identifier.
 */
export function useAnalyticsPreference() {
  const [analyticsEnabled, setAnalyticsEnabledState] = useState(false);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const [preferenceLoadFailed, setPreferenceLoadFailed] = useState(false);
  const [preferenceSaveFailed, setPreferenceSaveFailed] = useState(false);
  const mountedRef = useRef(true);
  const readIdRef = useRef(0);
  const writeIdRef = useRef(0);

  const loadPreference = useCallback(() => {
    const readId = readIdRef.current + 1;
    readIdRef.current = readId;
    setPreferenceLoadFailed(false);
    void loadAnalyticsEnabled().then((result) => {
      if (!mountedRef.current || readIdRef.current !== readId) {
        return;
      }
      if (result.status === 'failed') {
        setAnalyticsEnabledState(false);
        setPreferenceLoaded(false);
        setPreferenceLoadFailed(true);
        return;
      }
      setAnalyticsEnabledState(result.enabled);
      setPreferenceLoaded(true);
    });
  }, []);

  const persistPreference = useCallback((enabled: boolean) => {
    const writeId = writeIdRef.current + 1;
    writeIdRef.current = writeId;
    setPreferenceSaveFailed(false);
    void setAnalyticsCollectionEnabled(enabled).then((saved) => {
      if (mountedRef.current && writeIdRef.current === writeId) {
        setPreferenceSaveFailed(!saved);
      }
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadPreference();
    return () => {
      mountedRef.current = false;
    };
  }, [loadPreference]);

  const setAnalyticsEnabled = useCallback(
    (enabled: boolean) => {
      if (!preferenceLoaded) {
        return;
      }
      setAnalyticsEnabledState(enabled);
      persistPreference(enabled);
    },
    [persistPreference, preferenceLoaded],
  );

  const retryAnalyticsPreference = useCallback(() => {
    if (preferenceLoadFailed) {
      loadPreference();
      return;
    }
    persistPreference(analyticsEnabled);
  }, [
    analyticsEnabled,
    loadPreference,
    persistPreference,
    preferenceLoadFailed,
  ]);

  const analyticsFeedback = useMemo(
    () =>
      getAnalyticsSettingFeedback({
        preferenceLoaded,
        analyticsEnabled,
        preferenceLoadFailed,
        preferenceSaveFailed,
      }),
    [
      analyticsEnabled,
      preferenceLoadFailed,
      preferenceLoaded,
      preferenceSaveFailed,
    ],
  );

  return {
    analyticsEnabled,
    analyticsPreferenceLoaded: preferenceLoaded,
    analyticsFeedback,
    setAnalyticsEnabled,
    retryAnalyticsPreference,
  };
}
