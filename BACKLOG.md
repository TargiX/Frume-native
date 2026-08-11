# Frume backlog

This file separates unfinished product work from external 1.0 release gates.
For the operator checklist and verified current state, use
[`RELEASE.md`](./RELEASE.md).

Frume 1.0 is an Apple-only release for iPhone and iPad. Android and Google Play
work is intentionally deferred and does not block App Store submission.

## 1.0 external release gates

- Deploy the Cloudflare photo Worker to the intended account, install a rotated
  Unsplash Access Key as a secret, and verify its real `/health`, `/photo`, and
  `/track` paths.
- Revoke the legacy local Unsplash credential and obtain Unsplash Production
  approval with enough verified capacity for launch traffic.
- Publish the final privacy policy and support page, then install the verified
  HTTPS URLs in the production Expo environment and App Store Connect.
- Create the iOS non-consumable Premium Cuts product; connect it to RevenueCat
  entitlement `premium_cut_styles` and a package in the current offering, then
  compile the exact reviewed product identifier into the Apple release
  environment. The RevenueCat package label is not a runtime product-type
  guarantee.
- Choose and record the iOS build path. If EAS is selected, link the correct
  owner/project and record the real project ID; a local Xcode archive does not
  require EAS linking.
- Use the checked-in Xcode 26.6 compiler-discovery workaround to build and sign
  the fresh native candidate, then complete the iPhone, iPad, physical-device,
  and TestFlight QA matrix, including purchase, restore, game entry/exit,
  rotation, persistence, accessibility, and photo failure/retry. The original
  `clang`/SwiftBuild stall is reproduced, diagnosed, and bypassed; the signed
  archive and device/TestFlight evidence remain open.
- Audit the exact iOS archive privacy manifests and complete Apple App Privacy,
  age rating, export compliance, listing, iPhone/iPad screenshots, and reviewer
  information.

None of these gates should be represented by a guessed account identifier,
product ID, deploy URL, or dashboard result.

## Future Android release (not a 1.0 gate)

- Confirm the Android application ID and Google Play record before creating
  products or uploading an artifact.
- Create the Android one-time Premium Cuts product and connect it to the same
  RevenueCat entitlement and a package in the intended offering.
- Install the Android RevenueCat public SDK key in the Android production
  environment.
- Provide a Java runtime locally or use EAS to produce the exact Android App
  Bundle, then inspect the final merged manifest and AAB.
- Complete Play testing-track purchase/restore QA, Google Data safety, content
  rating, policy declarations, screenshots, listing, and reviewer information.
- Run Android device and TalkBack QA independently of the approved Apple
  release matrix.

## Cut styles after 1.0

The architecture keeps
`PuzzleCutterId = 'classic' | 'organic' | 'biomorphic' | 'fractal'`; the
shipping registry exposes the first three finished cutters while Fractal
remains reserved and unavailable.

- **Fractal:** explore arcs, triangular/circular systems, spirals, L-systems,
  and Gosper-like boundaries. Add it to the registry and Premium Cuts only when
  matching seams, interactions, persistence, and screenshots are production
  quality.
- **Infinity:** edge-free or toroidal topology where the puzzle wraps around.
- **Wave / maze:** flowing continuous boundaries inspired by generative cut
  systems.
- **Impact / shattered glass:** radial cracks from a controlled impact point.

Do not alias an unfinished cutter to Classic. Missing algorithms must remain
unavailable and fail closed.

## Puzzle feel and depth

- Connected clusters that drag, rotate, and snap as one group.
- A short, quiet connection sound with an in-app sound setting.
- Optional ghost-photo guide in addition to the existing cut-outline guide.
- Review piece-edge aliasing on physical high-density iPhone and iPad screens;
  repeat the review on Android during the future Android release.
- Tune haptics so the first correctly seated piece has intentional feedback
  without making every drop noisy.
- Consider additional session history and personal bests only after a privacy
  and product review; no analytics/account system is required for 1.0.

## Content and merchandising

- More curated, non-abstract photo themes after provider-capacity monitoring is
  proven in production.
- Seasonal collections and featured Organic/Living examples.
- Localized App Store copy and in-app copy after the English 1.0 flow is
  approved.

Difficulty remains free. New paid value should be a clearly different,
finished cut style or another explicit content product, not a harder grid.
