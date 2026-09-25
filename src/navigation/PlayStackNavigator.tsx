import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import {
  AboutSupportScreen,
  DifficultyScreen,
  GalleryScreen,
  GameScreen,
  PlayHomeScreen,
  ThemePhotosScreen,
} from '../features/play/screens';
import { PUZZLE_CATEGORIES } from '../services/unsplash';
import { colors } from '../theme';
import type { PlayStackParamList } from './types';

import { LibraryScreen } from '../features/play/screens/LibraryScreen';

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
        name="ThemePhotos"
        component={ThemePhotosScreen}
        options={({ route }) => ({
          title:
            PUZZLE_CATEGORIES.find(
              (category) => category.id === route.params.categoryId,
            )?.label ?? 'Photographs',
        })}
      />
      <Stack.Screen
        name="Library"
        component={LibraryScreen}
        options={{ title: 'Shelf & album' }}
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
