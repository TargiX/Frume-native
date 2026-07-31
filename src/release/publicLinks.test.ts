import { describe, expect, it } from 'vitest';

import { parsePublicLink } from './publicLinks';

describe('parsePublicLink', () => {
  it('normalizes a secure web URL', () => {
    expect(
      parsePublicLink('  https://example.com/frume/privacy  ', 'privacy'),
    ).toEqual({
      status: 'ready',
      url: 'https://example.com/frume/privacy',
    });
  });

  it('reports missing configuration without inventing a destination', () => {
    expect(parsePublicLink(undefined, 'privacy')).toEqual({
      status: 'missing',
    });
    expect(parsePublicLink('   ', 'support')).toEqual({ status: 'missing' });
  });

  it.each([
    'http://example.com/privacy',
    'javascript:alert(1)',
    'not a URL',
    'https://user:password@example.com/privacy',
  ])('rejects unsafe privacy URL %s', (value) => {
    expect(parsePublicLink(value, 'privacy')).toEqual({ status: 'invalid' });
  });

  it('accepts a single support email with safe optional parameters', () => {
    expect(
      parsePublicLink(
        'mailto:help@example.com?subject=Frume%20support',
        'support',
      ),
    ).toEqual({
      status: 'ready',
      url: 'mailto:help@example.com?subject=Frume%20support',
    });
  });

  it.each([
    'mailto:help@example.com',
    'mailto:one@example.com,two@example.com',
    'mailto:help@example.com?attach=private-file',
  ])('does not accept %s as a privacy URL', (value) => {
    expect(parsePublicLink(value, 'privacy')).toEqual({ status: 'invalid' });
  });

  it.each([
    'mailto:not-an-address',
    'mailto:one@example.com,two@example.com',
    'mailto:help@example.com?attach=private-file',
  ])('rejects unsafe support URL %s', (value) => {
    expect(parsePublicLink(value, 'support')).toEqual({ status: 'invalid' });
  });
});
