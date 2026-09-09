# Frume

Frume is a quiet, photograph-first jigsaw puzzle for iPhone and iPad, built
with Expo, React Native, Skia, and a small Cloudflare Worker. Version 1.0 is an
Apple-only release. Android support remains in the shared architecture for a
future, separately gated Google Play release. The reviewed 1.0 deployment
target is iOS 16.0.

## Product contract

- **Classic is free.** Every Classic difficulty is available without a
  purchase. A bundled Organic 4x4 study is also free to try in one tap.
- **Premium Cuts is a one-time lifetime unlock.** Organic, Living, Living
  spectrum, Crystal, Crystal quartered, Amoeba, and Amoeba columnar are paid
  cut styles under the same entitlement.
- **Difficulty is never paywalled.** The paid value is a visibly different
  cutting algorithm, not a comfort setting.
- **Fractal is not advertised or selectable yet.** The cutter type remains an
  architectural extension point, but unfinished algorithms fail closed instead
  of silently falling back to Classic.
- Photos are browsable in small collections by theme. The app displays photographer attribution in
  setup and puzzle options, and records each started Unsplash photo use through
  the server-side proxy.

## What is implemented

- Classic cuts from 3x3 through 14x14 (9–196 pieces), with matching Bezier
  tabs and slots.
- Seven deterministic Premium Cuts: Organic is generated on-device, while the
  six simulated styles use pre-baked, fail-closed geometry. Missing baked
  release assets never trigger a synchronous on-device solver.
- Drag connected groups, snap, tray scrolling, guide, completion, haptics, and responsive
  portrait/landscape layout, plus first-run gesture help and an explicit
  restart action.
- Transactional local puzzle recovery across backgrounding and app restarts,
  a shelf for four waiting puzzles, an album of 24 completed puzzles,
  a compact last-completion receipt, source-aware Next behavior, and redacted
  support diagnostics retained only on the device until the player shares
  them.
- RevenueCat client integration for purchasing and restoring the
  `premium_cut_styles` entitlement; the store product and dashboard
  configuration remain release gates.
- Up to six selectable photographs per theme, attribution in browsing, setup,
  the album and puzzle options, bounded offline use-event retry, and a Cloudflare Worker that keeps
  the Unsplash credential out of the app. Provider photographs are hotlinked
  and therefore need network access after relaunch; the app does not make
  persistent local copies of them.
- Own-photo imports remain on device, are downsampled to a bounded decoded
  pixel budget, excluded from iCloud Backup, and deleted only after durable
  ownership changes.
- About, privacy/support entry points, semantic labels, minimum touch targets,
  compact-phone layouts, and generated release icons.
- Anonymous product analytics behind a single `track` seam, covering eight
  declared events under a random on-device identifier, with no account, no
  advertising identifier, no address, and no person profile. Every permitted
  property is allowlisted in `src/analytics/analyticsEvents.ts`, delivery is
  queued and retried from the app lifecycle, and the whole feature is off in
  any build without both analytics environment values and switchable off in
  About & Support.

## Discovery and collection rollout

Home offers an offline Organic 4x4 study without setup or purchase. Only that
bundled image, size and style bypass the premium gate. Setup previews the chosen
cut over the actual photograph and initially shows a compact set of choices.
Completing the study offers an optional Premium Cuts preview; the lifetime
purchase remains explicit. Start/completion analytics distinguish `discovery`,
`theme`, and `own_photo`; revisiting an album picture is not another completion.

The new gallery requires the matching Worker: `/photo?category=…&browse=1`
returns up to six attributed hotlinked photos without use grants. Choosing one
requests `/photo?category=…&id=…`; an unavailable selection fails explicitly.
Deploy and verify the Worker before releasing the client. Browsing itself does
not count as using a photograph. Both browse and selection absorb at most one
short server-directed warm-up delay; cancellation stops the retry. Selection
validates the requested photo and category before proceeding. API photographs are never copied into the album.

Completed pictures open in a separate album viewer without replacing the current
game or requesting Premium access. The viewer keeps the full photograph visible
and offers an explicit retry when its image cannot load.

The shelf refuses to evict unfinished progress when full. Players can remove
entries explicitly; the completed album keeps the 24 most recently saved entries.
Own-photo cleanup retains every durable shelf/album owner. Existing current
saves remain compatible, and invalid library data fails closed. Artwork source
and icon generation are documented in `assets/discover/SOURCES.md` and
`scripts/artwork/render-icon.swift`.

Before release, verify the complete flow on an iPhone and iPad: free study,
joined groups, restart/rotation, shelf exchange at capacity, completed album,
selected provider photo, real purchase/restore, and relaunch. Measure first
completion, second game, subsequent-day return and purchases from actual opted-in
usage; code and local tests alone do not establish product impact.

## Architecture

The puzzle engine is independent of the UI. Cutters implement the
`PuzzleCutter` contract and are registered in
`src/puzzle/cutters/registry.ts`. The shipping registry contains Classic plus
Organic, Living, Living spectrum, Crystal, Crystal quartered, Amoeba, and
Amoeba columnar.

The mobile app never receives an Unsplash access key or tracking-token signing
secret. `server/` owns photo curation, short-lived HMAC-authenticated photo-use
grants, globally bounded grant storage/issuance, and provider tracking.
Client-visible `EXPO_PUBLIC_*` values are configuration, not secrets.

Analytics is a separate, self-contained module under `src/analytics/`. Screens
import only `track`; they never see the transport, the queue, the identifier, or
the preference. Everything that can leave the device is therefore the union of
one contract file and one transport file, which is what the App Privacy answer
in [STORE_METADATA.md](./STORE_METADATA.md) relies on.

## Local verification

Install both workspaces and run the complete source checks:

```sh
npm ci
npm --prefix server ci
npm run check
npm run security:dependencies
npm --prefix server run deploy -- --dry-run
```

Local development servers must be launched through the repository-safe
launcher described by the workspace instructions; do not assume a fixed port.

## Over-the-air updates

Frume is linked to the EAS project `@targix/frume`. Store archives embed the
`production` update channel, while release-simulator proofs default to
`preview`. Both use Expo's `fingerprint` runtime policy, so an update is
eligible only for binaries with the same native dependencies and generated
native configuration. The reviewed embedded bundle remains the offline and
recovery fallback, and launch never waits for an update download.

`npm run ota:publish` is the only supported publication entrypoint. It owns OTA
configuration validation plus the canonical-source, explicit-environment,
clean-install, full-check, post-bundle scan, and pinned EAS publication gates.
Required operator inputs and the first-binary rollout sequence live in
[RELEASE.md](./RELEASE.md). An OTA update may change only compatible JavaScript
and bundled assets within the App Store reviewed product contract. Native
dependencies, Expo SDK/config plugins, permissions, entitlements, or materially
new functionality require a new App Store build and review.

## Release

[RELEASE.md](./RELEASE.md) is the release operator runbook and the source of
truth for external gates such as Cloudflare deployment, Unsplash Production
approval, RevenueCat products, the guarded local iOS archive, public
privacy/support URLs, native purchase QA, and store submission.

[STORE_METADATA.md](./STORE_METADATA.md) contains truthful App Store 1.0
listing copy, review notes, and the required iPhone/iPad screenshot sequence.
It also inventories prepared Google Play artwork as future Android work, not as
an Apple 1.0 gate.

[BACKLOG.md](./BACKLOG.md) separates remaining Apple 1.0 gates, the future
Android release, and later product work. A roadmap item is not considered
shipped merely because its cutter ID or extension point exists.
