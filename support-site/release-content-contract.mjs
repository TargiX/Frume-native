const SHARED_REQUIRED_MARKERS = Object.freeze([
  'Frume',
  'targix8@gmail.com',
  'RELEASE_CONTACT:',
]);

const SHARED_FORBIDDEN_MARKERS = Object.freeze([
  'Organic and Living cuts',
  // The app measures anonymous usage. A published page that still claims
  // otherwise is a misrepresentation, not merely stale copy.
  'No analytics',
  'no product-analytics SDK',
  'advertising, analytics, or cross-app',
]);

function releasePageContract({ label, file, requiredMarkers }) {
  return Object.freeze({
    label,
    file,
    requiredMarkers: Object.freeze([
      ...SHARED_REQUIRED_MARKERS,
      ...requiredMarkers,
    ]),
    forbiddenMarkers: SHARED_FORBIDDEN_MARKERS,
  });
}

export const RELEASE_PAGE_CONTENT_CONTRACTS = Object.freeze({
  support: releasePageContract({
    label: 'Support',
    file: 'index.html',
    requiredMarkers: [
      'Living spectrum',
      'Crystal quartered',
      'Amoeba columnar',
      'one last-completion receipt',
    ],
  }),
  privacy: releasePageContract({
    label: 'Privacy',
    file: 'privacy/index.html',
    requiredMarkers: [
      'Curated Unsplash images are hotlinked',
      'at most about 16 megapixels',
      'up to ten recent JavaScript',
      'does not upload this log automatically',
      'expires after 24 hours',
      'Anonymous usage counts',
      'Switching it off deletes that identifier',
      'PostHog',
    ],
  }),
});

export function releasePageContentFailures(html, contract) {
  if (typeof html !== 'string') {
    throw new TypeError('Release page HTML must be a string.');
  }
  if (!contract?.label || !Array.isArray(contract.requiredMarkers)) {
    throw new TypeError('A valid release page content contract is required.');
  }

  const failures = [];
  for (const marker of contract.requiredMarkers) {
    if (!html.includes(marker)) {
      failures.push(`does not include the reviewed marker "${marker}"`);
    }
  }
  for (const marker of contract.forbiddenMarkers ?? []) {
    if (html.includes(marker)) {
      failures.push(`contains the obsolete release marker "${marker}"`);
    }
  }

  return failures;
}
