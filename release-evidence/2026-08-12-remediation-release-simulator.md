# Frume remediation Release simulator proof — 2026-08-12

## Evidence boundary

This is the current post-remediation **structural** iOS proof. It covers a
clean Expo prebuild, optimized Release bundle inspection, native compilation,
fresh installation, and cold launch without Metro after the signed
tracking-token client and the final release-provenance fixes were present.

It is not a signed release candidate, App Store upload, processed TestFlight
binary, purchase/restore result, production-service receipt, or physical-device
test. The build used intentionally synthetic public RevenueCat configuration
and a placeholder public HTTPS photo origin; no private credential is recorded
here. This proof predates the later presentation-only rollback that removed
visible Unsplash credit from Home, the gameplay HUD, and completion while
retaining it in setup and puzzle options. Typecheck and the full app unit suite
were rerun after that rollback, but this structural simulator build was not.

## Configuration

- Marketing version: `1.0.0`
- Build number: `3`
- Bundle identifier: `com.targix.frumenative`
- Toolchain: Xcode `26.6 (17F113)`
- Target: Apple Silicon iOS Simulator, Release configuration, iOS 26.5
- Device: dedicated `Frume Stuttgart Release Proof` iPhone 17 Pro simulator
- Native project: regenerated with `expo prebuild --platform ios --clean`
- Base Git revision: `1a814afb53769bad2cdf5730fc43af75b12d2757`
- Tracked non-document binary-diff SHA-256 at the final build boundary:
  `bc58cc6b019bd6ad3559935f948336caf56d512e036b5d6a248264c13c81de80`
- Untracked non-document file-manifest SHA-256 at the same boundary (hash of
  path-sorted `SHA-256 path` records):
  `d3e864cdbb2153841c6a619011b3087428bb7237e881a79f52eb67b613d662dc`
- RevenueCat: production-shaped synthetic public key and a synthetic,
  product-ID-shaped configured value; no App Store product ID is verified
- Photo API: placeholder public HTTPS origin, not the production Worker
- Support/privacy: known deployment URLs; mandatory live verification remains
  blocked because the privacy request redirects away from the reviewed origin
  toward Vercel authentication

## Results

1. The checked-in Apple toolchain gate accepted only Xcode `26.6 (17F113)`.
2. Clean Expo prebuild completed and CocoaPods installed 104 dependencies.
3. `npm run ios:release:simulator` produced `Frume.app` with an optimized
   Hermes `main.jsbundle`.
4. The post-build credential scanner disassembled that bundle, required the
   exact configured iOS public key, Premium Cuts product ID, and
   `premium_cut_styles` entitlement, and found no stale/test/other-platform
   credential.
5. Artifact identity matched `com.targix.frumenative 1.0.0 (3)`.
6. A pre-existing copy was uninstalled from the dedicated simulator; the exact
   `.app` was installed and launched with `--terminate-running-process`. Home
   rendered normally and the process remained alive without Metro.

Artifact retained for this local session:

```text
/tmp/frume-release-final.SliQ8n/DerivedData/Build/Products/Release-iphonesimulator/Frume.app
```

Optimized bundle SHA-256:

```text
9e1193f62294e20977d889bec0116eeb8f341df895ae5efea251d6b303c96a4c
```

Native executable and `Info.plist` SHA-256:

```text
0bb8778e550e70c0d8368e9b31f03edc9bf6f63fcde77651dabb97f81ce21f83  Frume
4567bcb55b0f8c1e307b419606d23d18cdc55e1f70262a272e4ca4e52b2dc695  Info.plist
```

Gitignored screenshot receipt:

```text
.context/frume-release-proof-home-final.png
```

## Release-guard evidence associated with this proof

- `release:guards`: 42/42 passed, including canonical source export,
  clean-filter/ignored-file attacks, forged handoff, exact legal content,
  bundle credentials, Worker version identity, and macOS `/tmp` physical-path
  aliasing.
- A separate bounded adversarial replay of the earlier source-provenance
  bypasses passed 31/31 and returned CLEAN for the normal release-operator
  threat model.
- At this build boundary, the complete repository check passed: 82 app test
  files, 413 app tests plus 1 intentional skip, 35 Workerd tests, 29
  client/server contracts, both TypeScript checks, and Expo Doctor 18/18.
- After the attribution-placement rollback, app typecheck and the current app
  suite passed again: 81 files, 412 tests, and 1 intentional skip. The
  structural simulator build above was not rerun for that presentation change.
- The public legal live gate failed closed on the current deployment redirect;
  therefore the signed archive transaction remains blocked.

## What remains external

- create and map the real RevenueCat iOS non-consumable, entitlement, offering,
  and public SDK key; then test purchase, restore, cancel, pending, and offline;
- deploy the intended Cloudflare Worker with Workers Paid capacity, migrations,
  rotated Unsplash key, independent HMAC secret, verified active version ID,
  monitoring, and exhausted-budget/forged-token exercises;
- publish anonymously reachable support and privacy pages with the exact
  reviewed content;
- merge the reviewed source to canonical `main`, produce the guarded signed
  build 3+ archive, inspect its identity/manifests/dSYMs, and test that exact
  processed binary on physical iPhone/iPad and TestFlight;
- finish App Store Connect privacy, age, export, DSA, platform availability,
  screenshots, reviewer metadata, and symbolication decisions.

Those gates remain explicit in `RELEASE.md` and
`APP_AUDIT_2026-08-12.md`; this structural proof does not close them.
