import type { PuzzleImageAttribution } from './types';

/**
 * The bundled offline collection: real photographs that play with no
 * connection at all, drawn from Unsplash's free-license catalog via
 * picsum.photos. Sources, checksums, and revalidation dates live in
 * `assets/bundled/SOURCES.md`; an entry here without a matching file and
 * ledger row ships nothing.
 */
export type BundledPhoto = {
  id: string;
  /** Stable `frume://bundled/<id>` URI stored on the puzzle's image source. */
  uri: string;
  file: string;
  title: string;
  width: number;
  height: number;
  accessibilityLabel: string;
  attribution: PuzzleImageAttribution;
};

const BUNDLED_URI_PREFIX = 'frume://bundled/';

function unsplashAttribution(
  photographerName: string,
  photoPageUrl: string,
): PuzzleImageAttribution {
  return {
    photographerName,
    photographerUrl: photoPageUrl,
    sourceName: 'Unsplash',
    sourceUrl: photoPageUrl,
  };
}

function bundledPhoto(
  photo: Omit<BundledPhoto, 'uri'>,
): BundledPhoto {
  return { ...photo, uri: `${BUNDLED_URI_PREFIX}${photo.id}` };
}

export const BUNDLED_PHOTOS: readonly BundledPhoto[] = [
  bundledPhoto({
    id: 'blue-fjord',
    file: 'blue-fjord.jpg',
    title: 'Blue fjord',
    width: 1400,
    height: 933,
    accessibilityLabel:
      'A still blue fjord below a lone wooden cabin on a rocky shore',
    attribution: unsplashAttribution(
      'Alexey Topolyanskiy',
      'https://unsplash.com/photos/-oWyJoSqBRM',
    ),
  }),
  bundledPhoto({
    id: 'canyon-falls',
    file: 'canyon-falls.jpg',
    title: 'Canyon falls',
    width: 1400,
    height: 934,
    accessibilityLabel:
      'A waterfall dropping into a mossy canyon of layered rock',
    attribution: unsplashAttribution(
      'Andrew Coelho',
      'https://unsplash.com/photos/VB-w_3dnyvI',
    ),
  }),
  bundledPhoto({
    id: 'matterhorn',
    file: 'matterhorn.jpg',
    title: 'Matterhorn',
    width: 1400,
    height: 934,
    accessibilityLabel:
      'The Matterhorn rising above low clouds at dusk',
    attribution: unsplashAttribution(
      'Sven Scheuermeier',
      'https://unsplash.com/photos/VNseEaTt9w4',
    ),
  }),
  bundledPhoto({
    id: 'valley-light',
    file: 'valley-light.jpg',
    title: 'Valley light',
    width: 1400,
    height: 933,
    accessibilityLabel:
      'Sunbeams crossing a green mountain valley at golden hour',
    attribution: unsplashAttribution(
      'Christian Joudrey',
      'https://unsplash.com/photos/mWRR1xj95hg',
    ),
  }),
  bundledPhoto({
    id: 'northern-lights',
    file: 'northern-lights.jpg',
    title: 'Northern lights',
    width: 1400,
    height: 787,
    accessibilityLabel:
      'Green northern lights over a snowy ridge and a frozen lake',
    attribution: unsplashAttribution(
      'Vashishtha Jogi',
      'https://unsplash.com/photos/bClr95glx6k',
    ),
  }),
  bundledPhoto({
    id: 'morning-tide',
    file: 'morning-tide.jpg',
    title: 'Morning tide',
    width: 1300,
    height: 975,
    accessibilityLabel:
      'A calm tide washing over smooth rocks under a pale morning sky',
    attribution: unsplashAttribution(
      'Darrell Cassell',
      'https://unsplash.com/photos/hoCXpPUMCoE',
    ),
  }),
  bundledPhoto({
    id: 'lake-canoe',
    file: 'lake-canoe.jpg',
    title: 'Lake canoe',
    width: 1400,
    height: 933,
    accessibilityLabel:
      'A person paddling a red canoe across a glassy mountain lake',
    attribution: unsplashAttribution(
      'Roberto Nickson',
      'https://unsplash.com/photos/7BjmDICVloE',
    ),
  }),
  bundledPhoto({
    id: 'blanket-pug',
    file: 'blanket-pug.jpg',
    title: 'Blanket pug',
    width: 1400,
    height: 933,
    accessibilityLabel: 'A pug wrapped snugly in a grey knitted blanket',
    attribution: unsplashAttribution(
      'Matthew Wiebe',
      'https://unsplash.com/photos/U5rMrSI7Pn4',
    ),
  }),
  bundledPhoto({
    id: 'forest-fawn',
    file: 'forest-fawn.jpg',
    title: 'Forest fawn',
    width: 1050,
    height: 1576,
    accessibilityLabel: 'A spotted fawn standing in a sunlit forest',
    attribution: unsplashAttribution(
      'E+N Photographies',
      'https://unsplash.com/photos/GYumuBnTqKc',
    ),
  }),
  bundledPhoto({
    id: 'central-park-air',
    file: 'central-park-air.jpg',
    title: 'Central Park from above',
    width: 1400,
    height: 790,
    accessibilityLabel:
      'An aerial view of Central Park wrapped in morning haze',
    attribution: unsplashAttribution(
      'freddie marriage',
      'https://unsplash.com/photos/utwYoEu9SU8',
    ),
  }),
  bundledPhoto({
    id: 'strawberries',
    file: 'strawberries.jpg',
    title: 'Strawberries',
    width: 1400,
    height: 934,
    accessibilityLabel:
      'A close-up of ripe strawberries packed into a wooden crate',
    attribution: unsplashAttribution(
      'veeterzy',
      'https://unsplash.com/photos/OJJIaFZOeX4',
    ),
  }),
  bundledPhoto({
    id: 'slow-coffee',
    file: 'slow-coffee.jpg',
    title: 'Slow coffee',
    width: 1400,
    height: 933,
    accessibilityLabel:
      'A cup of coffee on a wooden café table beside an open notebook',
    attribution: unsplashAttribution(
      'Karl Fredrickson',
      'https://unsplash.com/photos/TYIzeCiZ_60',
    ),
  }),
];

export function bundledPhotoById(id: string): BundledPhoto | undefined {
  return BUNDLED_PHOTOS.find((photo) => photo.id === id);
}

export function bundledPhotoByUri(uri: string): BundledPhoto | undefined {
  if (!uri.startsWith(BUNDLED_URI_PREFIX)) return undefined;
  return bundledPhotoById(uri.slice(BUNDLED_URI_PREFIX.length));
}
