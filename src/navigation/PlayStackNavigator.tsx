import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import {
  AboutSupportScreen,
  DifficultyScreen,
  GalleryScreen,
  GameScreen,
  PlayHomeScreen,
} from '../features/play/screens';
import { colors } from '../theme';
import type { PlayStackParamList } from './types';

const Stack = createNativeStackNavigator<PlayStackParamList>();

export function PlayStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { color: colors.textPrimary },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        headerBackTitle: 'Back',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="PlayHome"
        component={PlayHomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AboutSupport"
        component={AboutSupportScreen}
        options={{ title: 'About & Support' }}
      />
      <Stack.Screen
        name="Gallery"
        component={GalleryScreen}
        options={{ title: 'Choose a photo' }}
      />
      <Stack.Screen
        name="Difficulty"
        component={DifficultyScreen}
        options={{ title: 'Puzzle setup' }}
      />
      <Stack.Screen
        name="Game"
        component={GameScreen}
        options={{ headerShown: false, gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
