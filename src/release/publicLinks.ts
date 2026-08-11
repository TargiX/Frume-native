export type PublicLinkKind = 'privacy' | 'support';

export type PublicLink =
  | { status: 'ready'; url: string }
  | { status: 'missing' }
  | { status: 'invalid' };

const EMAIL_ADDRESS = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const ALLOWED_MAILTO_PARAMETERS = new Set(['subject', 'body']);

function validHttpsUrl(url: URL): boolean {
  return (
    url.protocol === 'https:' &&
    url.hostname.length > 0 &&
    !url.username &&
    !url.password
  );
}

function validSupportMailto(url: URL): boolean {
  if (
    url.protocol !== 'mailto:' ||
    url.host ||
    url.hash ||
    !EMAIL_ADDRESS.test(decodeURIComponent(url.pathname))
  ) {
    return false;
  }

  return [...url.searchParams.keys()].every((key) =>
    ALLOWED_MAILTO_PARAMETERS.has(key),
  );
}

/**
 * Release-facing links are treated as untrusted build configuration.
 *
 * Privacy must be a secure public page. Support may additionally use a single
 * email recipient, with only subject/body query parameters.
 */
export function parsePublicLink(
  configuredValue: string | undefined,
  kind: PublicLinkKind,
): PublicLink {
  const value = configuredValue?.trim();
  if (!value) {
    return { status: 'missing' };
  }

  try {
    const url = new URL(value);
    if (
      validHttpsUrl(url) ||
      (kind === 'support' && validSupportMailto(url))
    ) {
      return { status: 'ready', url: url.toString() };
    }
  } catch {
    // Invalid configuration is represented below without exposing its value.
  }

  return { status: 'invalid' };
}
