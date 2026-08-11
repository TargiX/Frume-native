import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
import { Asset } from 'expo-asset';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  getMusicSettingFeedback,
  loadMusicEnabled,
  saveMusicEnabled,
} from './musicPreference';
import { createMusicTrackOrder } from './musicTrackOrder';

const MUSIC_VOLUME = 0.28;
const FADE_DURATION_MS = 360;
const FADE_STEPS = 12;
const MUSIC_LOAD_TIMEOUT_MS = 12_000;
const MUSIC_START_TIMEOUT_MS = 6_000;

const MUSIC_TRACKS = [
  require('../../assets/music/afternoon-tea.m4a'),
  require('../../assets/music/afternoon-tea-2.m4a'),
  require('../../assets/music/glass-and-light.m4a'),
  require('../../assets/music/glass-and-light-2.m4a'),
  require('../../assets/music/static-harmony.m4a'),
  require('../../assets/music/static-harmony-2.m4a'),
] as const;

function resolveBundledTrack(moduleId: number) {
  const asset = Asset.fromModule(moduleId);
  return {
    assetId: moduleId,
    uri: asset.localUri ?? asset.uri,
  };
}

type VolumePlayer = {
  volume: number;
};

function fadePlayerVolume(
  player: VolumePlayer,
  target: number,
  onComplete?: () => void,
): () => void {
  const start = player.volume;
  let step = 0;
  const timer = setInterval(() => {
    step += 1;
    player.volume = start + (target - start) * (step / FADE_STEPS);
    if (step >= FADE_STEPS) {
      clearInterval(timer);
      player.volume = target;
      onComplete?.();
    }
  }, FADE_DURATION_MS / FADE_STEPS);
  return () => clearInterval(timer);
}

export function usePuzzleMusic(playbackAllowed: boolean) {
  const trackOrderRef = useRef<number[] | null>(null);
  if (!trackOrderRef.current) {
    trackOrderRef.current = createMusicTrackOrder(Math.random());
  }
  const trackIndexRef = useRef(0);
  const pendingTrackRef = useRef(false);
  const firstTrack = MUSIC_TRACKS[trackOrderRef.current[0]];
  const player = useAudioPlayer(firstTrack, {
    downloadFirst: true,
    updateInterval: 1_000,
  });
  const status = useAudioPlayerStatus(player);
  const [musicEnabled, setMusicEnabledState] = useState(false);
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);
  const [preferenceSaveFailed, setPreferenceSaveFailed] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [playbackAttempt, setPlaybackAttempt] = useState(0);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const preferenceTouchedRef = useRef(false);
  const preferenceWriteRef = useRef(0);
  const shouldPlay = preferenceLoaded && musicEnabled && playbackAllowed && appActive;
  const shouldPlayRef = useRef(shouldPlay);
  shouldPlayRef.current = shouldPlay;

  const stopAfterFailure = useCallback(
    (message: string) => {
      pendingTrackRef.current = false;
      try {
        player.volume = 0;
        player.pause();
      } catch {
        // The original, user-visible playback failure remains the useful error.
      }
      setPlaybackError(message);
    },
    [player],
  );

  const persistMusicPreference = useCallback((enabled: boolean) => {
    const writeId = preferenceWriteRef.current + 1;
    preferenceWriteRef.current = writeId;
    setPreferenceSaveFailed(false);
    void saveMusicEnabled(enabled).then((saved) => {
      if (preferenceWriteRef.current === writeId) {
        setPreferenceSaveFailed(!saved);
      }
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    void loadMusicEnabled().then((enabled) => {
      if (!mounted) {
        return;
      }
      if (!preferenceTouchedRef.current) {
        setMusicEnabledState(enabled);
      }
      setPreferenceLoaded(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppActive(nextState === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let cancelFade: (() => void) | undefined;
    let loadTimeout: ReturnType<typeof setTimeout> | undefined;
    let startTimeout: ReturnType<typeof setTimeout> | undefined;

    if (shouldPlay) {
      if (playbackError) {
        return () => {
          cancelled = true;
        };
      }

      if (!status.isLoaded || !player.isLoaded) {
        loadTimeout = setTimeout(() => {
          if (!cancelled && shouldPlayRef.current && !player.isLoaded) {
            stopAfterFailure('Music could not be loaded. Try again.');
          }
        }, MUSIC_LOAD_TIMEOUT_MS);

        return () => {
          cancelled = true;
          clearTimeout(loadTimeout);
        };
      }

      void setAudioModeAsync({
        allowsRecording: false,
        interruptionMode: 'mixWithOthers',
        playsInSilentMode: false,
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      })
        .then(() => {
          if (cancelled) {
            return;
          }
          try {
            player.volume = 0;
            player.play();
            cancelFade = fadePlayerVolume(player, MUSIC_VOLUME);
            startTimeout = setTimeout(() => {
              if (!cancelled && shouldPlayRef.current && !player.playing) {
                stopAfterFailure('Music could not start. Try again.');
              }
            }, MUSIC_START_TIMEOUT_MS);
          } catch {
            stopAfterFailure('Music could not start. Try again.');
          }
        })
        .catch(() => {
          if (!cancelled) {
            stopAfterFailure('Music could not start. Try again.');
          }
        });
    } else if (player.playing || player.volume > 0) {
      cancelFade = fadePlayerVolume(player, 0, () => {
        try {
          player.pause();
        } catch {
          // A pause failure does not make an off preference appear enabled.
        }
      });
    } else {
      try {
        player.pause();
      } catch {
        // The player is already silent from the user's perspective.
      }
    }

    return () => {
      cancelled = true;
      if (loadTimeout) {
        clearTimeout(loadTimeout);
      }
      if (startTimeout) {
        clearTimeout(startTimeout);
      }
      cancelFade?.();
    };
  }, [
    playbackAttempt,
    playbackError,
    player,
    shouldPlay,
    status.isLoaded,
    stopAfterFailure,
  ]);

  useEffect(() => {
    if (!status.didJustFinish) {
      return;
    }
    trackIndexRef.current =
      (trackIndexRef.current + 1) % trackOrderRef.current!.length;
    const nextTrackIndex = trackOrderRef.current![trackIndexRef.current];
    pendingTrackRef.current = true;
    try {
      player.replace(resolveBundledTrack(MUSIC_TRACKS[nextTrackIndex]));
      setPlaybackAttempt((attempt) => attempt + 1);
    } catch {
      stopAfterFailure('The next music track could not be loaded. Try again.');
    }
  }, [player, status.didJustFinish, stopAfterFailure]);

  useEffect(() => {
    if (!pendingTrackRef.current || !status.isLoaded) {
      return;
    }
    pendingTrackRef.current = false;
    setPlaybackAttempt((attempt) => attempt + 1);
  }, [player, status.isLoaded]);

  const setMusicEnabled = useCallback(
    (enabled: boolean) => {
      preferenceTouchedRef.current = true;
      setPreferenceLoaded(true);
      setMusicEnabledState(enabled);
      setPlaybackError(null);
      setPlaybackAttempt((attempt) => attempt + 1);
      persistMusicPreference(enabled);
    },
    [persistMusicPreference],
  );

  const retryMusic = useCallback(() => {
    setPlaybackError(null);
    setPlaybackAttempt((attempt) => attempt + 1);
    persistMusicPreference(musicEnabled);
  }, [musicEnabled, persistMusicPreference]);

  const musicFeedback = useMemo(
    () =>
      getMusicSettingFeedback({
        preferenceLoaded,
        musicEnabled,
        shouldPlay,
        isLoaded: status.isLoaded,
        isPlaying: status.playing,
        playbackError,
        preferenceSaveFailed,
      }),
    [
      musicEnabled,
      playbackError,
      preferenceLoaded,
      preferenceSaveFailed,
      shouldPlay,
      status.isLoaded,
      status.playing,
    ],
  );

  return {
    musicEnabled,
    musicPreferenceLoaded: preferenceLoaded,
    musicFeedback,
    setMusicEnabled,
    retryMusic,
  };
}
