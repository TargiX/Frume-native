export default {
  test: { include: ['scripts/cuts/benchmark.test.ts', 'scripts/cuts/revalidate.test.ts', 'scripts/cuts/auditLibrary.test.ts', 'scripts/cuts/reviewComplexLibrary.test.ts', 'scripts/cuts/verifyComplexBundle.test.ts', 'scripts/cuts/projectorEquivalence.test.ts', 'scripts/cuts/renderComplexPlots.test.ts'], maxWorkers: 1 },
};
