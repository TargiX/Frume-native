# iOS simulator Release receipt — 2026-07-31

This is pre-candidate local evidence, not a signed archive, upload receipt,
TestFlight result, or App Store approval. The build came from the uncommitted
release worktree based on Git commit
`a3b5e0d22b2d083e6a64c667f8b0eeb6315d2a91`.

## Clean build

Command:

```sh
EXPO_NO_DOTENV=1 \
EXPO_PUBLIC_PHOTO_API_URL=http://127.0.0.1:8787 \
npm run ios:release:simulator
```

Result: exit 0 on 2026-07-31 at 05:45:57 +07 with Xcode 26.6.

Observed local path:

```text
/var/folders/sp/b_z_5yks7xb3vmmcwxmbj_l80000gn/T/frume-ios-release.E37Apl/Build/Products/Release-iphonesimulator/Frume.app
```

The path is temporary. Use the hashes and metadata below as durable evidence;
do not treat the local path as a future artifact locator.

The Xcode compiler-discovery workaround was exercised by this clean build.
Separately, the proxy's normal `--version` output was byte-identical to the
active Apple Clang. Its intercepted `-v -E -dM -x c /dev/null` response was
371 bytes on stdout and 202 bytes on stderr, below the 480-byte per-stream
guard.

## Artifact identity

- Bundle ID: `com.targix.frumenative`
- Marketing version: `1.0.0`
- Build: `2`
- Minimum OS: iOS 16.0
- Device families: iPhone and iPad (`[1, 2]`)
- Architecture: arm64 simulator
- `ITSAppUsesNonExemptEncryption`: false
- App size: 69,136,384 bytes
- Privacy manifests found: 13
- App manifest: no tracking or collected-data declaration; required-reason API
  categories are present
- RevenueCat manifest: Purchase History for App Functionality, not linked, not
  used for tracking
- Expo FileSystem manifest: no collection/tracking; file timestamp and disk
  space required-reason categories are present

SHA-256:

```text
main.jsbundle  88af75889c517f6b85125eec2af651c7991225b22675f3faaefacdc77cdfb489
Frume          acc7ba0678e6f43952060afd9c528b809e03829dacaef73b24ad9e1a9a37e1d8
Info.plist     9b87abbfb9c6f913f35df88e78fa97cb281c3d80b49b512806632da553ee4514
```

The two legacy Unsplash credential values present in the ignored root `.env`
were searched without printing them; neither appeared in `main.jsbundle`.
The loopback photo URL did appear, as expected for this pre-candidate build.

## Repository validation

- Mobile: 17 test files, 112 tests passed
- Worker runtime: 12 tests passed
- Server client: 21 tests passed
- Mobile and Worker TypeScript checks: passed
- Expo Doctor: 18/18
- Wrangler dry-run: passed with both Durable Object and both Rate Limit
  bindings
- Support/privacy site: two pages passed with no client scripts
- Mobile production dependency audit: 12 moderate, 5 high, 0 critical
- Worker dependency audit: 0

The mobile advisories remain in the Expo/Node tooling graph; the offered
remediation is a breaking SDK upgrade and was not applied blindly.

## Simulator evidence

The artifact was installed and launched on:

- iPhone 17 Pro Max, iOS 26.5
- iPad Pro 13-inch (M5), iOS 26.5

The exact artifact supplied the current opaque drafts:

- `assets/store/app-store/iphone-6.9/01-home.png`, 1320×2868
- `assets/store/app-store/iphone-6.9/02-gallery.png`, 1320×2868
- `assets/store/app-store/iphone-6.9/03-setup.png`, 1320×2868
- `assets/store/app-store/iphone-6.9/04-classic-game.png`, 1320×2868
- `assets/store/app-store/iphone-6.9/05-completion.png`, 1320×2868
- `assets/store/app-store/ipad-13/01-home.png`, 2752×2064
- `assets/store/app-store/ipad-13/02-gallery.png`, 2752×2064
- `assets/store/app-store/ipad-13/03-setup.png`, 2752×2064
- `assets/store/app-store/ipad-13/04-classic-game.png`, 2752×2064
- `assets/store/app-store/ipad-13/05-completion.png`, 2752×2064

The exact artifact completed the visible Classic path from Home through
completion at nine of nine pieces. These are still drafts: the captured build
uses the loopback Worker, and Organic/paywall captures are absent.

Immediately before the final tooling-only rebuild, force-termination QA on the
same persistence implementation verified:

- version 2 saved state;
- Classic Easy, one of nine pieces placed;
- the image restored from `Documents/frume-saved-puzzle/puzzle-a.jpg`;
- the remote HTTPS receipt remained available;
- cold launch presented `Continue · 1 of 9`;
- `activeStartedAt` was normalized to null;
- `activeElapsedMs` stayed unchanged after five seconds on Home.

Earlier simulator QA in the same worktree covered Classic completion, large
Dynamic Type including the complete gallery, and the supported iPad layout.
Production Worker, StoreKit/RevenueCat, signed archive, TestFlight,
physical-device, and final screenshot QA remain release gates.
