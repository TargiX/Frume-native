import React from 'react';

import { PlayStackNavigator } from './PlayStackNavigator';

/**
 * The app is the puzzle. There is no tab bar: a single tab is just chrome that
 * costs vertical space on every screen.
 */
export function RootNavigator() {
  return <PlayStackNavigator />;
}
