import { NavigationContainer } from '@react-navigation/native';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppState, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { installGlobalErrorDiagnostics } from './src/diagnostics/globalErrorHandler';
import { isPhaseFieldLabUrl, PhaseFieldLabScreen } from './src/features/lab';
import { RootNavigator } from './src/navigation';
import { PremiumAccessProvider } from './src/premium';
import { PuzzleSessionProvider } from './src/puzzle/context';
import { installBakedCutLibrary } from './src/puzzle/cutters/biomorphic/bakedCutSource';
import { BAKED_CUT_LIBRARY } from './src/puzzle/cutters/biomorphic/bakedLibrary.generated';
import { retryPendingPhotoUses } from './src/services/unsplash';
import { startPendingPhotoTrackingRetries } from './src/services/unsplash/pendingPhotoTracking';

import 'react-native-url-polyfill/auto';

// Solving a cut takes minutes on a phone, so the cutters read pre-generated
// ones. Installed at module load rather than in an effect: the first puzzle can
// be requested before any component has mounted, and falling back to the solver
// for it would freeze the app on its very first board.
installBakedCutLibrary(BAKED_CUT_LIBRARY);

export default function App() {
  const isPhaseFieldLab =
    Platform.OS === 'web' &&
    isPhaseFieldLabUrl(
      typeof globalThis.location === 'undefined'
        ? undefined
        : globalThis.location.href,
    );

  useEffect(() => {
    if (isPhaseFieldLab) return;
    return startPendingPhotoTrackingRetries({
      initialState: AppState.currentState,
      retry: retryPendingPhotoUses,
      subscribe: (listener) => AppState.addEventListener('change', listener),
    });
  }, [isPhaseFieldLab]);

  useEffect(() => installGlobalErrorDiagnostics(), []);

  if (isPhaseFieldLab) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AppErrorBoundary>
            <StatusBar style="light" />
            <PhaseFieldLabScreen />
          </AppErrorBoundary>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppErrorBoundary>
          <StatusBar style="light" />
          <PremiumAccessProvider>
            <PuzzleSessionProvider>
              <NavigationContainer>
                <RootNavigator />
              </NavigationContainer>
            </PuzzleSessionProvider>
          </PremiumAccessProvider>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
