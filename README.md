# Frume

Frume is a quiet, photograph-first jigsaw puzzle for iPhone and iPad, built
with Expo, React Native, Skia, and a small Cloudflare Worker. Version 1.0 is an
Apple-only release. Android support remains in the shared architecture for a
future, separately gated Google Play release. The reviewed 1.0 deployment
target is iOS 16.0.

## Product contract

- **Classic is free.** Every Classic difficulty is available without a
  purchase.
- **Premium Cuts is a one-time lifetime unlock.** Organic and Living are paid
  cut styles under the same entitlement.
- **Difficulty is never paywalled.** The paid value is a visibly different
  cutting algorithm, not a comfort setting.
- **Fractal is not advertised or selectable yet.** The cutter type remains an
  architectural extension point, but unfinished algorithms fail closed instead
  of silently falling back to Classic.
- Photos are curated by theme. The app displays photographer attribution and
  records each started Unsplash photo use through the server-side proxy.

## What is implemented

- Classic 3x3, 4x4, and 5x5 cuts with matching Bezier tabs and slots.
- Deterministic Organic cuts with irregular, matching amoeba-like seams.
- Deterministic Living cuts with non-grid Voronoi cells, variable neighbors,
  and matching shared seams.
- Drag, snap, tray scrolling, guide, completion, haptics, and responsive
  portrait/landscape layout.
- Durable local puzzle recovery across backgrounding and app restarts.
- RevenueCat client integration for purchasing and restoring the
  `premium_cut_styles` entitlement; the store product and dashboard
  configuration remain release gates.
- Curated photo gallery, attribution, bounded offline use-event retry, and a
  Cloudflare Worker that keeps the Unsplash credential out of the app.
- About, privacy/support entry points, semantic labels, minimum touch targets,
  compact-phone layouts, and generated release icons.

## Architecture

The puzzle engine is independent of the UI. Cutters implement the
`PuzzleCutter` contract and are registered in
`src/puzzle/cutters/registry.ts`. The shipping registry contains Classic,
Organic, and Biomorphic (shown to players as Living).

The mobile app never receives an Unsplash access key. `server/` owns photo
curation, short-lived photo-use grants, and provider tracking. Client-visible
`EXPO_PUBLIC_*` values are configuration, not secrets.

## Local verification

Install both workspaces and run the complete source checks:

```sh
npm ci
npm --prefix server ci
npm run check
npm --prefix server run deploy -- --dry-run
```

Local development servers must be launched through the repository-safe
launcher described by the workspace instructions; do not assume a fixed port.

## Release

[RELEASE.md](./RELEASE.md) is the release operator runbook and the source of
truth for external gates such as Cloudflare deployment, Unsplash Production
approval, RevenueCat products, EAS linking, public privacy/support URLs, native
purchase QA, and store submission.

[STORE_METADATA.md](./STORE_METADATA.md) contains truthful App Store 1.0
listing copy, review notes, and the required iPhone/iPad screenshot sequence.
It also inventories prepared Google Play artwork as future Android work, not as
an Apple 1.0 gate.

[BACKLOG.md](./BACKLOG.md) separates remaining Apple 1.0 gates, the future
Android release, and later product work. A roadmap item is not considered
shipped merely because its cutter ID or extension point exists.
