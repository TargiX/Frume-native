import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  getHapticsSettingFeedback,
  loadHapticsEnabled,
  saveHapticsEnabled,
} from './hapticsPreference';

export function useHapticsPreference() {
  const [hapticsEnabled, setHapticsEnabledState] = useState(false);
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
    void loadHapticsEnabled().then((result) => {
      if (!mountedRef.current || readIdRef.current !== readId) {
        return;
      }
      if (result.status === 'failed') {
        setHapticsEnabledState(false);
        setPreferenceLoaded(false);
        setPreferenceLoadFailed(true);
        return;
      }
      setHapticsEnabledState(result.enabled);
      setPreferenceLoaded(true);
    });
  }, []);

  const persistPreference = useCallback((enabled: boolean) => {
    const writeId = writeIdRef.current + 1;
    writeIdRef.current = writeId;
    setPreferenceSaveFailed(false);
    void saveHapticsEnabled(enabled).then((saved) => {
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

  const setHapticsEnabled = useCallback(
    (enabled: boolean) => {
      if (!preferenceLoaded) {
        return;
      }
      setHapticsEnabledState(enabled);
      persistPreference(enabled);
    },
    [persistPreference, preferenceLoaded],
  );

  const retryHapticsPreference = useCallback(() => {
    if (preferenceLoadFailed) {
      loadPreference();
      return;
    }
    persistPreference(hapticsEnabled);
  }, [
    hapticsEnabled,
    loadPreference,
    persistPreference,
    preferenceLoadFailed,
  ]);

  const hapticsFeedback = useMemo(
    () =>
      getHapticsSettingFeedback({
        preferenceLoaded,
        hapticsEnabled,
        preferenceLoadFailed,
        preferenceSaveFailed,
      }),
    [
      hapticsEnabled,
      preferenceLoadFailed,
      preferenceLoaded,
      preferenceSaveFailed,
    ],
  );

  return {
    hapticsEnabled,
    hapticsPreferenceLoaded: preferenceLoaded,
    hapticsFeedback,
    setHapticsEnabled,
    retryHapticsPreference,
  };
}
