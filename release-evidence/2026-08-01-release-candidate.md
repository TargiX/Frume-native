# Frume local release-candidate receipt — 2026-08-01

This receipt records local source, test, clean-native, artifact, and simulator
evidence. It is **not** a signed archive, App Store Connect upload, TestFlight
result, physical-device result, submission, or Apple approval.

The build was produced from the reviewed worktree based on
`a3b5e0d22b2d083e6a64c667f8b0eeb6315d2a91`. The candidate source identity is
the Git commit that contains this receipt. Only release documentation and the
developer-only `doctor` command were tightened after the binary build; no
application source, configuration value, or dependency changed afterward.

## Candidate scope

- Classic remains the free cut style.
- Organic and Living share one permanent Premium Cuts unlock. The app does not
  advertise or select the unfinished Fractal style.
- Living is a deterministic, seeded, relaxed-Voronoi cutter with irregular
  cells, curved shared seams, exact reverse-edge agreement, arbitrary
  neighbours, and resize-stable descriptors. Automated tests cover multiple
  seeds and photograph aspects.
- Portrait uses a bottom piece tray; landscape uses a narrower right-side
  tray. Pieces can overhang the table while their centres remain recoverable.
- Setup, board help, menu, table appearance, music, completion, Next, retry,
  persistence, accessibility, reduced-motion, and failure paths are included
  in the reviewed source and test suite.

## Repository validation

`npm run check` completed with exit 0 after the final changes, with Expo dotenv
loading explicitly disabled for Doctor:

- mobile TypeScript: passed;
- mobile tests: 39 files, 195 tests passed;
- Worker TypeScript: passed;
- Worker runtime tests: 23 passed;
- Worker client-contract tests: 28 passed;
- Expo Doctor: 18/18 checks passed.

`npm --prefix server run deploy -- --dry-run` also completed with exit 0 and
packaged both SQLite Durable Object bindings and both Rate Limit bindings.

Dependency review from this worktree:

- mobile production graph: 12 moderate, 5 high, 0 critical advisories, in the
  Expo/Node toolchain; npm only offered a breaking Expo 57 upgrade for the
  remaining graph, so no forced rewrite was applied;
- Worker graph: 0 advisories.

Secret hygiene before staging confirmed that populated root env files and
`server/.dev.vars` are ignored, no env/signing credential is tracked, no
`.p8`, `.p12`, `.cer`, or `.mobileprovision` file is present in candidate
source, and the only broad scanner matches were a test placeholder and a
documented shell-variable reference. No secret value was printed during the
check.

## Clean native generation and Release build

The ignored generated iOS project was deleted and recreated from the reviewed
configuration:

```sh
CI=1 EXPO_NO_DOTENV=1 FRUME_BUILD_NUMBER=2 \
  npx expo prebuild --platform ios --clean
```

The clean prebuild and CocoaPods installation completed successfully. A fresh
unsigned arm64 simulator Release build then completed with Xcode 26.6
(`17F113`) through the checked-in bounded Clang-discovery proxy.

Observed temporary artifact path:

```text
/var/folders/sp/b_z_5yks7xb3vmmcwxmbj_l80000gn/T/frume-ios-release.NZ3pEV/Build/Products/Release-iphonesimulator/Frume.app
```

The path is disposable DerivedData, not a durable distribution artifact.

Artifact identity:

- bundle ID: `com.targix.frumenative`;
- marketing version: `1.0.0`;
- build: `2`;
- executable: Mach-O arm64 simulator;
- app disk usage: 87,840 KiB;
- `main.jsbundle`: 6,097,970 bytes;
- executable: 36,419,336 bytes;
- privacy manifests found: 13.

SHA-256:

```text
main.jsbundle  d52b1b24b25160985da53e6d1279037e5cff2e18cee9bfc09a9b710ae2d6b141
Frume          55f25b68948da06391435f71ec805e4648393dff20b00bcfae7bef76d19bd1e2
Info.plist     9b87abbfb9c6f913f35df88e78fa97cb281c3d80b49b512806632da553ee4514
```

The signed archive script now requires a committed clean tree, runs the full
repository check, regenerates iOS with `EXPO_NO_DOTENV=1`, validates production
HTTPS endpoints and RevenueCat inputs, derives the generated bundle identifier
from Xcode build settings, and verifies version/build/bundle identity before
and after archiving. Its shell syntax check passed. It was not run because the
required external production values and signing evidence do not yet exist.
The production photo URL guard also passed its standalone integration matrix:
4 accepted public forms and 22 rejected malformed, credentialed, local, or
private forms.

## Final-binary simulator smoke test

The exact app above was installed on booted iPhone 17 Pro and iPhone 17 Pro Max
simulators running iOS 26.5. Direct device screenshots and system logs verified:

- cold launch reaches the redesigned Home screen with the colourful four-piece
  icon and `Continue · 1 of 9` saved progress;
- landscape Gallery fits all six themes in a 3-by-2 grid without scrolling;
- portrait Gallery uses a balanced 2-by-3 grid and keeps Surprise me reachable;
- the Animals crop contains the giraffe's head and neck instead of mostly sky;
- a missing production photo endpoint fails visibly in compact landscape with
  `Try again` beside the error, rather than below the fold;
- the saved Classic game restores one of nine pieces with the bottom tray in
  portrait and the photo-tinted table surface;
- orientation/layout changes did not produce an application exception or
  crash report.

The desktop coordinate driver can accidentally hit Simulator's own Home/Rotate
toolbar for controls near the device's top edge. Those events produced normal
foreground-to-background snapshots and process suspension in the iOS log, not
Frume termination. They are excluded from product-behaviour conclusions.

This simulator build intentionally has no production Worker or RevenueCat
configuration. Therefore live photo success, purchase, restore, and final legal
links were not claimed from this artifact.

## External release gates still open

1. Rotate/revoke the legacy Unsplash credentials, obtain Production approval,
   deploy the reviewed Worker migration/bindings, and verify its public
   `/health` URL.
2. Publish and verify the support and privacy URLs.
3. Create the App Store non-consumable and complete the exact RevenueCat iOS
   app, entitlement, offering, package, and product mapping.
4. Resolve the rejected EU DSA state and replace the rejected 2022 listing,
   metadata, age/privacy answers, categories, and screenshots.
5. Confirm build `2` is unused, produce the exact signed archive from the clean
   candidate commit, inspect privacy/signing identity, upload it, and complete
   StoreKit sandbox, TestFlight, iPhone, and iPad physical-device QA.

Until those independent records exist, this is a strong local release
candidate, not a publishable App Store build.
