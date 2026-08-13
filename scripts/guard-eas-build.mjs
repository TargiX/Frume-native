#!/usr/bin/env node

if (process.env.EAS_BUILD === 'true') {
  console.error(
    'Remote EAS builds are intentionally blocked for Frume. The guarded local iOS archive path performs clean dependency installation, live legal-page checks, and post-artifact Hermes validation that EAS does not yet reproduce. Use npm run ios:archive.',
  );
  process.exit(1);
}

console.log('Local dependency install: EAS remote-build guard not applicable.');
