#!/usr/bin/env node

import { BlockList, isIP } from 'node:net';

const variableName = 'EXPO_PUBLIC_PHOTO_API_URL';
const configuredValue = process.env[variableName]?.trim();

function reject(message) {
  console.error(`${variableName} ${message}`);
  process.exit(1);
}

if (!configuredValue) {
  reject('must be set to the verified public HTTPS Worker base URL.');
}

let url;
try {
  url = new URL(configuredValue);
} catch {
  reject(
    'is malformed. Use an absolute URL such as https://photos.example.com.',
  );
}

if (url.protocol !== 'https:') {
  reject('must use HTTPS for an App Store archive.');
}

if (url.username || url.password) {
  reject('must not include embedded credentials.');
}

if (url.search || url.hash) {
  reject('must not include a query string or fragment.');
}

if (url.pathname !== '/') {
  reject(
    'must be the Worker origin only, without a path; the client adds /photo and /track.',
  );
}

const hostname = url.hostname
  .replace(/^\[|\]$/g, '')
  .replace(/\.+$/, '')
  .toLowerCase();

if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
  reject('must use a public production host; localhost is not allowed.');
}

const addressType = isIP(hostname);
if (addressType !== 0) {
  const nonPublicIPv4Addresses = new BlockList();
  const nonPublicIPv6Addresses = new BlockList();

  // Unspecified, private, shared, loopback, and link-local IPv4 ranges.
  nonPublicIPv4Addresses.addSubnet('0.0.0.0', 8, 'ipv4');
  nonPublicIPv4Addresses.addSubnet('10.0.0.0', 8, 'ipv4');
  nonPublicIPv4Addresses.addSubnet('100.64.0.0', 10, 'ipv4');
  nonPublicIPv4Addresses.addSubnet('127.0.0.0', 8, 'ipv4');
  nonPublicIPv4Addresses.addSubnet('169.254.0.0', 16, 'ipv4');
  nonPublicIPv4Addresses.addSubnet('172.16.0.0', 12, 'ipv4');
  nonPublicIPv4Addresses.addSubnet('192.168.0.0', 16, 'ipv4');

  // Unspecified, loopback, IPv4-mapped, unique-local, link-local, and
  // multicast IPv6 ranges. Rejecting mapped literals also prevents an IPv4
  // address from bypassing the IPv4 checks through alternate notation.
  nonPublicIPv6Addresses.addSubnet('::', 128, 'ipv6');
  nonPublicIPv6Addresses.addSubnet('::1', 128, 'ipv6');
  nonPublicIPv6Addresses.addSubnet('::ffff:0:0', 96, 'ipv6');
  nonPublicIPv6Addresses.addSubnet('fc00::', 7, 'ipv6');
  nonPublicIPv6Addresses.addSubnet('fe80::', 10, 'ipv6');
  nonPublicIPv6Addresses.addSubnet('ff00::', 8, 'ipv6');

  const isNonPublic =
    addressType === 4
      ? nonPublicIPv4Addresses.check(hostname, 'ipv4')
      : nonPublicIPv6Addresses.check(hostname, 'ipv6');
  if (isNonPublic) {
    reject('must use a public production host; local/private IPs are not allowed.');
  }
}
