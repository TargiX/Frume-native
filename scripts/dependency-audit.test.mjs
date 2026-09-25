import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  REVIEWED_MOBILE_AUDIT_URLS,
  REVIEWED_MOBILE_VULNERABILITY_CHAIN,
  validateMobileAuditReport,
  validateServerAuditReport,
} from './validate-dependency-audit.mjs';

function reviewedMobileReport() {
  const vulnerabilities = Object.fromEntries(
    [...REVIEWED_MOBILE_VULNERABILITY_CHAIN].map((name) => [
      name,
      {
        via:
          name === 'image-size'
            ? [...REVIEWED_MOBILE_AUDIT_URLS].map((url) => ({ url }))
            : ['image-size'],
      },
    ]),
  );
  return {
    vulnerabilities,
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: REVIEWED_MOBILE_VULNERABILITY_CHAIN.size,
        critical: 0,
        total: REVIEWED_MOBILE_VULNERABILITY_CHAIN.size,
      },
    },
  };
}

test('accepts only the exact reviewed Metro image-size chain', () => {
  assert.doesNotThrow(() => validateMobileAuditReport(reviewedMobileReport()));
  assert.doesNotThrow(() =>
    validateServerAuditReport({
      metadata: { vulnerabilities: { total: 0 } },
    }),
  );
});
test('accepts npm reporting only the image-size leaf of the reviewed chain', () => {
  const leafOnly = {
    vulnerabilities: {
      'image-size': {
        via: [...REVIEWED_MOBILE_AUDIT_URLS].map((url) => ({ url })),
      },
    },
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0, total: 1 },
    },
  };
  assert.doesNotThrow(() => validateMobileAuditReport(leafOnly));

  const withoutLeaf = reviewedMobileReport();
  delete withoutLeaf.vulnerabilities['image-size'];
  withoutLeaf.metadata.vulnerabilities.high -= 1;
  withoutLeaf.metadata.vulnerabilities.total -= 1;
  assert.throws(() => validateMobileAuditReport(withoutLeaf), /changed/);
});
test('fails closed on a new package, advisory, severity, or Worker finding', () => {
  const newPackage = reviewedMobileReport();
  newPackage.vulnerabilities.unreviewed = { via: ['image-size'] };
  assert.throws(() => validateMobileAuditReport(newPackage), /changed/);

  const newAdvisory = reviewedMobileReport();
  newAdvisory.vulnerabilities['image-size'].via.push({
    url: 'https://github.com/advisories/GHSA-new-advisory',
  });
  assert.throws(() => validateMobileAuditReport(newAdvisory), /changed/);

  const critical = reviewedMobileReport();
  critical.metadata.vulnerabilities.critical = 1;
  assert.throws(() => validateMobileAuditReport(critical), /contract/);
  assert.throws(
    () =>
      validateServerAuditReport({
        metadata: { vulnerabilities: { total: 1 } },
      }),
    /zero advisories/,
  );
});
