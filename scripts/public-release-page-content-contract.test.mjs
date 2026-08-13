#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  RELEASE_PAGE_CONTENT_CONTRACTS,
  releasePageContentFailures,
} from '../support-site/release-content-contract.mjs';
import { validatePublicReleasePage } from './validate-public-release-pages.mjs';

function htmlResponse(body) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

async function localPage(contract) {
  return readFile(
    new URL(`../support-site/public/${contract.file}`, import.meta.url),
    'utf8',
  );
}

for (const contract of Object.values(RELEASE_PAGE_CONTENT_CONTRACTS)) {
  test(`${contract.label} local and live gates accept the reviewed content`, async () => {
    const html = await localPage(contract);

    assert.deepEqual(releasePageContentFailures(html, contract), []);
    const finalUrl = await validatePublicReleasePage({
      label: contract.label,
      initialUrl: new URL(`https://frume.example/${contract.label.toLowerCase()}`),
      contentContract: contract,
      fetchImpl: async () => htmlResponse(html),
    });

    assert.equal(finalUrl.origin, 'https://frume.example');
  });

  test(`${contract.label} live gate rejects a generic stale page`, async () => {
    await assert.rejects(
      validatePublicReleasePage({
        label: contract.label,
        initialUrl: new URL(`https://frume.example/${contract.label.toLowerCase()}`),
        contentContract: contract,
        fetchImpl: async () =>
          htmlResponse(`<h1>Frume ${contract.label}</h1>`),
      }),
      /does not include the reviewed marker/,
    );
  });
}

test('both gates reject the obsolete two-cut premium contract', async () => {
  const contract = RELEASE_PAGE_CONTENT_CONTRACTS.support;
  const staleHtml = `${await localPage(contract)}\nOrganic and Living cuts`;

  assert.deepEqual(releasePageContentFailures(staleHtml, contract), [
    'contains the obsolete release marker "Organic and Living cuts"',
  ]);
  await assert.rejects(
    validatePublicReleasePage({
      label: contract.label,
      initialUrl: new URL('https://frume.example/support'),
      contentContract: contract,
      fetchImpl: async () => htmlResponse(staleHtml),
    }),
    /contains the obsolete release marker/,
  );
});

test('reviewed markers are case-sensitive and cannot be weakened by normalization', () => {
  const contract = RELEASE_PAGE_CONTENT_CONTRACTS.privacy;
  const lowercasedMarkers = contract.requiredMarkers.join('\n').toLowerCase();

  assert.ok(releasePageContentFailures(lowercasedMarkers, contract).length > 0);
});
