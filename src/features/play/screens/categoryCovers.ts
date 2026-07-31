import type { ImageSourcePropType } from 'react-native';

/**
 * Bundled cover art, one per theme.
 *
 * Shipped with the app rather than fetched: a theme picker for a photography
 * app has to show photographs the instant it opens, and fetching six covers
 * would cost six requests against a rate limit shared by every player.
 *
 * All source IDs, checksums, and acquisition evidence are recorded in
 * `assets/categories/SOURCES.md`. Matching credits are shown in About &
 * Support.
 */
export const CATEGORY_COVERS: Record<string, ImageSourcePropType> = {
  nature: require('../../../../assets/categories/nature.jpg'),
  city: require('../../../../assets/categories/city.jpg'),
  animals: require('../../../../assets/categories/animals-framed.jpg'),
  travel: require('../../../../assets/categories/travel.jpg'),
  food: require('../../../../assets/categories/food.jpg'),
  ocean: require('../../../../assets/categories/ocean.jpg'),
};

export type CategoryCoverCredit = {
  category: string;
  photographer: string;
  photoUrl: string;
};

const ATTRIBUTION_QUERY = 'utm_source=frume&utm_medium=referral';

export const CATEGORY_COVER_CREDITS: readonly CategoryCoverCredit[] = [
  {
    category: 'Nature',
    photographer: 'Redd Francisco',
    photoUrl: `https://unsplash.com/photos/gdQnsMbhkUs?${ATTRIBUTION_QUERY}`,
  },
  {
    category: 'City',
    photographer: 'Andres Garcia',
    photoUrl: `https://unsplash.com/photos/_SWgYuWS9wY?${ATTRIBUTION_QUERY}`,
  },
  {
    category: 'Animals',
    photographer: 'Katie Treadway',
    photoUrl: `https://unsplash.com/photos/EwE4tBYh3ms?${ATTRIBUTION_QUERY}`,
  },
  {
    category: 'Travel',
    photographer: 'Danish Prakash',
    photoUrl: `https://unsplash.com/photos/IrlGJTJd-qI?${ATTRIBUTION_QUERY}`,
  },
  {
    category: 'Food',
    photographer: 'Brooke Lark',
    photoUrl: `https://unsplash.com/photos/4J059aGa5s4?${ATTRIBUTION_QUERY}`,
  },
  {
    category: 'Ocean',
    photographer: 'Nattu Adnan',
    photoUrl: `https://unsplash.com/photos/Bn50DEsK5qc?${ATTRIBUTION_QUERY}`,
  },
] as const;
