import { makeMutable } from 'react-native-reanimated';

import type { Point } from '../types';

/** Direction from the piece toward the key light; shared by the board and every bevel. */
export const PUZZLE_LIGHT_DIRECTION = makeMutable<Point>({ x: -1, y: -1 });
