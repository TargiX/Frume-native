# Frume release handoff

This runbook describes the repository and externally verified state as of
2026-08-12. A `TODO` below is a hard release gate, not an optional cleanup.
Never paste credentials, signing files, real users' data, or unverified
dashboard identifiers into this file.

Frume 1.0 is an Apple-only release for iPhone and iPad. Android source and
prepared Google Play assets remain in the repository for a future release, but
no Android build, product, dashboard field, or Play Console task is a gate for
this App Store submission.

## Current release state

| Area | Verified state | Release gate |
| --- | --- | --- |
| App identity | The existing App Store Connect app is Apple ID `1639767109`, bundle ID `com.targix.frumenative`, and SKU `EX1660458511601`. Its editable platform-version record was last verified as `1.0`. Build `1` was already used. Build `2` was uploaded on 2026-08-11 but its source archive contained a RevenueCat `test_` key and is invalid. The source now defaults to marketing version `1.0.0`, iOS build `3`, and deployment target iOS 16.0. | Do not attach or submit build `2`. Confirm build `3` is unused immediately before archiving, then attach only a build 3+ archive that passes the checked-in bundle scan and exact-binary QA. |
| Cloudflare Worker | `frume-photos` is deployed on the intended Workers Free account with SQLite `CategoryPhotoPool`, one global signed-grant broker, a globally coordinated provider-budget Durable Object, both rate limiters, version metadata, and an independent tracking-token secret. Version `7b62bdb3-9e60-4663-8387-10c2f584305d` returned HTTP 200 with all nine readiness checks true on 2026-08-13; live `/photo` returned 200 and its signed `/track` completed with 204. | Monitor daily Worker/SQLite usage and provider allowance. Free works until its hard daily limits; rotate the legacy Unsplash credential and prove exhausted-budget/forged-token behavior before submission. |
| Worker deploy URL | `https://frume-photos.targix8.workers.dev` was printed by Wrangler and verified against the exact active deployment identity on 2026-08-13. | Keep this exact HTTPS base URL in the release environment and re-run the identity-bound live health guard before every archive. |
| Unsplash credential | A gitignored root `.env` contains legacy Unsplash access/secret variable entries. Rotation is not confirmed; treat both values as compromised. | Invalidate them in Unsplash, obtain a replacement Access Key, verify the old value no longer works, remove the legacy local entries, and store the replacement only in Cloudflare or a gitignored `server/.dev.vars`. |
| Unsplash API capacity | **Conflict to resolve:** the operator stated on 2026-07-29 that Frume already holds Unsplash **Production** access at 1000 requests/hour, but this runbook has never recorded verified dashboard/header evidence of it. The deployed Worker caps usable provider traffic at 900/hour and the scheduled baseline is 12 searches/hour; live `/photo` and `/track` succeeded. | Verify live `X-Ratelimit-*` headers under expected load and add operational alerting before store release. Use `PHOTO_API_DISABLED=1` if the assumed upstream allowance is disproven. |
| Expo photo API | The gitignored release environment uses `https://frume-photos.targix8.workers.dev` and the identity-bound live health guard passes. | Re-run the guard from the exact archive environment immediately before building. |
| RevenueCat | The Frume RevenueCat project has an App Store app, production `appl_` public SDK key, `default` offering, `$rc_lifetime` package, product `com.targix.frumenative.premiumcuts`, and entitlement `premium_cut_styles`; the gitignored release environment passes the checked-in identifier guard. | Confirm the product is attached to the reconciled App Store version and pass StoreKit sandbox/TestFlight purchase and restore QA on the exact candidate. |
| Premium contract | Entitlement is exactly `premium_cut_styles`. A purchase is enabled only when a package in the current offering contains the explicitly configured iOS product ID and RevenueCat reports `NON_SUBSCRIPTION`, `NON_CONSUMABLE`, and a null subscription period. The package label is not inspected; every product or metadata mismatch fails closed. | Attach that exact iOS non-consumable to the entitlement and a package in the current offering, then record and compile its reviewed product ID. |
| iOS build path | The only enabled 1.0 build path pins Node `24.16.0`, npm `11.13.0`, and Xcode `26.6 (17F113)`; performs clean root and Worker installs from both lockfiles; defaults to build `3`; rejects non-`appl_` RevenueCat keys; and verifies the exact reviewed key, product ID, and `premium_cut_styles` entitlement in the optimized `main.jsbundle`. A signed archive additionally requires `HEAD` to equal an explicitly approved full SHA and the live `main` tip at the hardcoded canonical GitHub repository, then independently fetches, raw-manifests, and materializes that exact remote Git tree into a new temporary source directory. Every install, check, prebuild, Metro bundle, and Xcode input runs from the reviewed export, excluding inherited Git rewrites, ignored/local files, hidden index flags, clean filters, and mutable-worktree races. It also requires the exact live Worker nine-check health and Cloudflare version identity contract, blocks developer dotenv and Android-key contamination, regenerates iOS cleanly, and injects own-photo backup exclusion through a versioned config plugin. Remote EAS builds fail in `eas-build-pre-install` until they reproduce these guards. A fresh post-protocol unsigned `1.0.0 (3)` structural simulator proof now compiles and launches without Metro. | Merge the reviewed source and produce a signed build 3+ archive with real production configuration through `npm run ios:archive`. Test that exact processed binary on physical iPhone/iPad and TestFlight; local generation/build/upload/processing/submission remain separate evidence states. |
| Public links | Current support/privacy content is deployed publicly at `https://support-site-one-alpha.vercel.app/` and `/privacy/`. The anonymous live content guard passed on 2026-08-13 with no authentication redirect. | Install the same URLs in App Store Connect and verify both links from the exact binary on Wi-Fi and cellular. |
| iOS privacy manifest | The latest local prebuild generated an app manifest containing required-reason API entries and declaring no collection/tracking, and RevenueCat supplies its own manifest. The generated native directory is ignored and no release archive has been audited. | Review the manifests supplied by every native dependency and validate the exact archived binary and store declarations. |
| Dependency audit | Re-audited 2026-08-12 after compatible lockfile fixes and exact `postcss`/`uuid` overrides: mobile production audit fell from 27 findings to **10 high, 0 critical/moderate/low**. All ten are one Expo/Metro build-tool chain rooted in two `image-size` parser advisories for which npm publishes no fixed version; they process repository build assets, not player photos in the shipped runtime. A checked-in allowlist matches the exact two GHSA URLs and exact dependency chain, so the manual release gate fails on any new advisory. The Worker reports zero. | Keep the exception narrow, do not feed untrusted assets to the release build, and migrate from Expo 54 only on a dedicated device-tested branch. Run `npm run security:dependencies` from the exact candidate; never use `npm audit fix --force` as a release shortcut. |
| Photo library access | iOS uses `PHPickerViewController` through `expo-image-picker`, so Frume receives only the selected file. Valid 48 MP photos are downsampled locally in a native background operation to a 16 MP derivative before durable copy; extreme source decodes and unusable panoramas fail with actionable copy. Managed files have transactional ownership, are excluded from iCloud Backup by a config plugin that survives clean prebuild, and are never uploaded. | On the exact archive, verify the photo usage string, absence of camera permission, privacy manifests, backup exclusion, orientation, 48 MP HEIF/JPEG, iCloud-backed selection, low-storage interruption, replacement/clear deletion, and App Privacy answers. |
| Client incident visibility | Global JavaScript handlers and the app error boundary write bounded, redacted diagnostics on device; About & Support can share or clear them. Photo URLs, paths, tokens, and query strings are not retained. This is a user-assisted incident path, not remote crash alerting, and native/framework symbolication remains unproven. | Choose and document the 1.0 contract: provision a privacy-reviewed remote crash service with release symbols, or explicitly sign off Apple Organizer reports plus user-shared diagnostics. Prove a controlled release-like crash is actionable. |
| QA matrix and screenshots | **Stale as of 2026-08-12.** The 2026-08-01 evidence predates the new Home, imported photographs, 9–196 size ladder, board zoom/pan, multi-row tray, transactional replacement/completion, teaching, paywall continuation, and accessibility controls. The latest unsigned `.app` contains roughly 19 MB of music and 504 KB of category covers; the separate 12 MB store-art source directory was not bundled. | Re-run the device QA matrix and capture fresh iPhone and iPad screenshots from the exact signed candidate. Review the 19 MB shipped music footprint and verify the signed archive contents separately. |
| Store record and metadata | A read-only App Store Connect review verified the existing [Frume record](https://appstoreconnect.apple.com/apps/1639767109/appstore): version `1.0` has been **Rejected** since 2022-12-21 under Guideline 4.2, Minimum Functionality. It still contains the old photo-frame subtitle, description, keywords, and screenshots; primary category Photo & Video, secondary Lifestyle; automatic release; `Data Not Collected`; no IAP; 2022 copyright; and a 12+/13+ age rating with new social-feature questions pending. No dashboard change was saved in this audit. | The puzzle product materially supersedes the rejected photo-frame concept, but that does not imply Apple approval. Replace and re-review every stale field, use Games with Puzzle as the subcategory where supported, choose manual release, attach the non-consumable, complete App Privacy and age rating from the exact binary, upload new iPhone/iPad screenshots, and submit only after TestFlight QA. |
| Commercial and distribution state | Paid Apps Agreement is active for 2026-07-04 through 2027-07-03; Free Apps Agreement is active for 2026-07-03 through 2027-07-03. Banking and foreign-status tax records display active. The base app is free in 175 territories and Public Distribution is selected, which fits free Classic play plus the one-time Premium Cuts IAP for all seven shaped cuts. Digital Services Act compliance for 27 EU countries is **Rejected** even though the app is currently marked non-trader. Apple Silicon Mac and Apple Vision Pro availability are checked despite no QA. No account, address, tax, or banking details are recorded here. | Resolve the rejected DSA status before EU distribution. Keep the base app free and public unless product scope changes. Disable Mac and Vision Pro availability for the iPhone/iPad-only 1.0 unless those platforms are explicitly built and tested. Reconfirm agreement, banking, and tax status immediately before the paid IAP goes live. |

## Source-of-truth contracts

The checked-in configuration currently establishes:

- Expo slug `frume`, scheme `frume`, dark UI, and unrestricted orientation.
- The durable native deployment target is iOS 16.0 through
  `expo-build-properties`; generated Xcode and Pod files must agree after every
  clean prebuild.
- iPad support is enabled. Shipping iPad support therefore requires iPad
  layout QA and iPad App Store screenshots in addition to iPhone QA and
  screenshots.
- Remote EAS builds are intentionally blocked by `eas-build-pre-install` for
  1.0 because they do not yet reproduce the local archive's live-page,
  clean-install, and post-Hermes-artifact gates. `FRUME_BUILD_NUMBER` may
  override the checked-in build number only through the guarded local flow.
- The Worker exposes `GET /health`, `GET /photo`, and `POST /track`, and
  schedules a six-category refill every thirty minutes.
- Category pools and photo-use grants are globally coordinated by SQLite
  Durable Objects. `/photo` issues an HMAC-authenticated, opaque grant bound to
  one exact Unsplash download endpoint for 24 hours. The single global grant
  broker enforces a reviewed 10,000-row storage backstop and at most 5
  issuances/minute;
  expired rows are removed about one hour after expiry. `/track` is
  one-time/idempotent and cannot be used as an arbitrary provider relay.
- `/photo` is additionally limited to 1 request/minute per Cloudflare client
  IP. `/track` is limited to 5 attempts/minute independently for both source IP
  and authenticated grant ID. These are safeguards, not a substitute for
  Unsplash Production capacity monitoring.
- The app contains no direct Unsplash fallback. A missing or invalid Worker URL
  prevents photo requests instead of exposing an access key.
- `EXPO_PUBLIC_*` values are compiled into the app and must be treated as
  public. Only RevenueCat **public SDK keys** belong there. RevenueCat secret
  keys must never be used by this client.

The release operator must fill these records from live command/dashboard
output before building:

| Record | Confirmed value |
| --- | --- |
| Cloudflare account/owner | `Targix8@gmail.com's Account`; account ID `f38a2e694428e7ae37ee3ae893614520` |
| Workers plan and current SQLite usage verified | Workers Free verified 2026-08-13; keep daily SQLite usage under observation |
| `CategoryPhotoPool` / `TrackingGrant` migration `v1` and `ProviderBudget` migration `v2` deployed | Deployed; all three live readiness bindings passed |
| Rate-limit namespace IDs `2026073101` / `2026073102` confirmed unique | TODO |
| Worker deploy URL | `https://frume-photos.targix8.workers.dev` |
| Immutable Worker version ID | `7b62bdb3-9e60-4663-8387-10c2f584305d`; installed as `FRUME_EXPECTED_PHOTO_API_DEPLOYMENT_ID` in the gitignored release environment |
| Rotated Unsplash key installed and legacy key revoked | TODO |
| Independent tracking-token HMAC secret generated and installed | Installed 2026-08-13; value intentionally not recorded |
| Global grant limits and Cloudflare allowance | `10000` retained rows, `5` issuances/minute, `1` photo issuance/IP/minute, and `900` usable provider requests/hour deployed on Workers Free |
| Unsplash Production approval and verified hourly limit | TODO |
| Latest iOS simulator proof | Current structural proof recorded in `release-evidence/2026-08-12-remediation-release-simulator.md`; it uses synthetic public service configuration and is not a signed candidate |
| Reviewed release source SHA | TODO; after review/merge, pass the full current `main` SHA from `https://github.com/TargiX/Frume-native.git` as `FRUME_REVIEWED_RELEASE_SHA` |
| Final signed iOS archive/build identifier | TODO; builds `1` and `2` must not be reused, so verify and use `3` or later |
| RevenueCat project and iOS app record | Frume project / `Frume (App Store)` verified 2026-08-13 |
| RevenueCat iOS public SDK key installed | Production `appl_` public key installed in gitignored release environment; value intentionally omitted here |
| Reviewed iOS Premium Cuts product identifier installed | `com.targix.frumenative.premiumcuts` |
| Current offering identifier | `default` |
| Current offering package and iOS product identifier | `Lifetime` / `$rc_lifetime` / `com.targix.frumenative.premiumcuts` |
| Privacy policy URL | `https://support-site-one-alpha.vercel.app/privacy/` |
| Support page URL | `https://support-site-one-alpha.vercel.app/` |
| App Store Connect app URL | `https://appstoreconnect.apple.com/apps/1639767109/appstore` |
| App Store Connect identity | Apple ID `1639767109`; bundle `com.targix.frumenative`; SKU `EX1660458511601` |
| Existing version/review state | `1.0`; Rejected 2022-12-21, Guideline 4.2 Minimum Functionality |
| Existing TestFlight trains | `1.0.0`, `1.0.1`, `1.0.3`, `1.0.4`; build `1` appears in `1.0.0` and `1.0.4` |
| Invalid uploaded build | `1.0.0 (2)`; contains a RevenueCat test key; never attach or submit |
| Planned next source version/build | `1.0.0 (3)`; confirm build `3` is unused before archive |
| Agreements | Paid Apps active 2026-07-04–2027-07-03; Free Apps active 2026-07-03–2027-07-03 |
| Banking/tax readiness | Active in read-only dashboard audit; no sensitive details copied |
| DSA status | Rejected for 27 EU countries; app currently identified as non-trader; action required |

## 1. Rotate the Unsplash key and deploy the Worker

Do not copy either legacy value from the root `.env`. In the Unsplash
application dashboard, invalidate the exposed credentials and obtain a
replacement Access Key. Confirm the old Access Key is rejected, then remove the
legacy root entries, before considering rotation complete. The
[Unsplash API guidelines](https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines)
require both Access and Secret keys to remain confidential.

Do not treat Unsplash demo capacity as production-ready. Obtain Production
approval and record the live hourly limit before submission. The scheduled
baseline is six search requests every 30 minutes (12/hour); a cold, empty, or
orientation-mismatched pool can add an on-demand refill search, and every
started curated puzzle adds one required download-tracking request. Own-photo
puzzles never call Unsplash. Exercise the real release traffic path,
inspect the upstream `X-Ratelimit-Limit` and `X-Ratelimit-Remaining` headers,
and configure monitoring before launch. See Unsplash's
[rate-limit documentation](https://unsplash.com/documentation#rate-limiting).

The provisional checked-in ceiling caps all outbound provider requests across
every Worker isolate at 900 in any rolling 60-minute period (`1000` allowance
less a `100` recovery reserve). Every refill search and download-tracking request
reserves capacity before external I/O. `/photo` also permits at most 1 issuance
attempt per source IP per minute, preventing one source from monopolizing the
global admission budget. Independent of source addresses, the single global grant broker
permits at most 5 issuances/minute and retains no more than 10,000 rows. Its
cleanup queries use the expiry index and it does not rewrite an already-earlier
alarm on every issue. The config rejects any retained-row ceiling too small for
the full TTL window. Expected launch traffic fits Workers Free, but its daily
limits remain hard account caps and an extreme combined write envelope can
still exhaust them. Monitor live usage and lower the emergency switch if the
account approaches a daily limit. See Cloudflare's
[Durable Object pricing and limits](https://developers.cloudflare.com/durable-objects/platform/pricing/).
Higher rates require a separately reviewed capacity/cost change.
Exhaustion returns a retryable HTTP 503 without spending the provider reserve.
Keep `PHOTO_API_DISABLED` available as the incident switch. Set it to `1` when
provider allowance, route, secrets, or storage capacity are no longer safe.

Authenticate Wrangler to the intended Cloudflare account and review the
checked-in Durable Object and Rate Limit configuration:

```sh
cd server
npm ci
npx wrangler login
npx wrangler whoami
```

`server/wrangler.jsonc` already defines `CATEGORY_POOLS`,
`TRACKING_GRANTS`, `PROVIDER_BUDGET`, SQLite migration tags `v1` and `v2`,
`PHOTO_ISSUE_RATE_LIMITER`, and `TRACKING_RATE_LIMITER`. The rate-limit
namespace IDs are developer-chosen integers, but each must be unique within the
target Cloudflare account.
Confirm that `2026073101` and `2026073102` do not collide before deployment;
change and record them if they do.

Any older instruction to create or bind a `PHOTO_POOL` KV namespace is
obsolete. Do not create that namespace and do not replace any of the three
Durable Object classes with KV. The checked-in `v1` migration creates the pool and grant classes, and
`v2` creates the single globally named provider-budget class. `TrackingGrant`
now uses one fixed global object rather than caller-selected object names; HMAC
verification happens before that object is opened. Its SQL broker and the
provider budget's atomic reservations prevent forged-token storage fan-out,
cross-isolate refill races, tracking-token replays, and provider-quota overruns.
See Cloudflare's
[Durable Object rules](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)
and [Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

Build the Worker without changing remote state:

```sh
npm run typecheck
npm test
npm run deploy -- --dry-run
```

The first deploy cannot use `wrangler secret put` because `frume-photos` does
not exist yet. First confirm the authenticated Cloudflare account and choose
its public `workers.dev` account subdomain. Then deploy the reviewed `v1` and
`v2` SQLite migrations, newly rotated provider key, and an independent
high-entropy tracking-token HMAC secret atomically, without writing either
secret to disk or exposing it as a command argument:

```zsh
printf 'Rotated Unsplash access key: '
IFS= read -r -s FRUME_ROTATED_UNSPLASH_KEY
printf '\n'
FRUME_TRACKING_TOKEN_SECRET=$(openssl rand -hex 32)
{
  printf 'UNSPLASH_ACCESS_KEY=%s\n' "$FRUME_ROTATED_UNSPLASH_KEY"
  printf 'TRACKING_TOKEN_SECRET=%s\n' "$FRUME_TRACKING_TOKEN_SECRET"
} |
  ./node_modules/.bin/wrangler deploy --strict --secrets-file /dev/stdin
unset FRUME_ROTATED_UNSPLASH_KEY FRUME_TRACKING_TOKEN_SECRET
```

Generate the tracking secret independently from the Unsplash credential; do
not derive or reuse either value. For later rotation,
`wrangler secret put UNSPLASH_ACCESS_KEY` and
`wrangler secret put TRACKING_TOKEN_SECRET` are valid because the Worker
already exists. Rotating the tracking secret immediately invalidates issued
grants, so schedule it as an incident or migration operation. Never put either
secret in `wrangler.jsonc`, a shell command argument, this document, root
`.env`, EAS, or an `EXPO_PUBLIC_*` variable. See Cloudflare's
[secret handling guidance](https://developers.cloudflare.com/workers/configuration/secrets/).

After Production allowance, route ownership, migration state, namespace IDs,
both secrets, provisional limits/reserve, and alert ownership are verified,
deploy with `PHOTO_API_DISABLED=0`. The `CF_VERSION_METADATA` binding supplies
the immutable version ID. Repeat the dry run, deploy, and verify readiness:

```sh
WORKER_URL='paste the exact successful deploy URL here'
curl --fail --silent --show-error "$WORKER_URL/health"
```

Release readiness requires HTTP 200 with `status: "ok"`, the exact reviewed
`deploymentId`, and all nine checks
(`categoryPools`, `trackingGrants`, `providerBudget`, `photoIssueRateLimiter`,
`trackingRateLimiter`, `unsplashAccessKey`, `trackingTokenSecret`,
`photoApiEnabled`, and `deploymentIdentity`) equal to
`true`. Then request
all curated categories and `Surprise me` from a release build. Confirm each
photo returns a signed opaque grant, attribution opens an Unsplash URL, and starting a
puzzle reaches `POST /track` exactly once without revealing the Unsplash key in
a response or log. Replay the same event once and confirm it remains an
idempotent 204; a different location with the same token and a forged signature
must both be rejected without creating caller-selected Durable Objects.
Exercise provider-budget, global-issuance, and stored-grant exhaustion and
confirm retryable 503 responses, then enable
`PHOTO_API_DISABLED=1` and confirm both endpoints and `/health` fail closed.
Restore `PHOTO_API_DISABLED=0` only after the incident exercise is complete and
record both deployments.

For local Worker-only work, copy `server/.dev.vars.example` to the ignored
`server/.dev.vars`, use a newly rotated development key, and generate a
separate local tracking secret. Local Wrangler Durable Object state is separate
from production by default. Do not seed or mutate production objects during
local validation.

## 2. Configure the Expo client

Copy the safe template and fill it only with public values:

```sh
cp .env.example .env.local
```

`EXPO_PUBLIC_PHOTO_API_URL` must be the verified Worker base URL. The code
adds `/photo` and `/track`; do not include either endpoint in the variable.
Only local HTTP on `localhost`, `127.0.0.1`, or `::1` is accepted. Release
builds require HTTPS.

`EXPO_PUBLIC_PRIVACY_URL` must be the approved live HTTPS privacy policy.
`EXPO_PUBLIC_SUPPORT_URL` accepts HTTPS or one `mailto:` recipient in the app,
but Apple's required Support URL must be a website with real contact
information. Prefer one canonical HTTPS support page for the app and App Store
Connect.

For the guarded local Xcode archive, make the five reviewed Apple release
values available during the release prebuild and bundle step:

- `EXPO_PUBLIC_PHOTO_API_URL`
- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
- `EXPO_PUBLIC_REVENUECAT_IOS_PREMIUM_CUTS_PRODUCT_ID`
- `EXPO_PUBLIC_PRIVACY_URL`
- `EXPO_PUBLIC_SUPPORT_URL`

`.env.example` also retains `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` for a
future Android release. It is not required for the Apple 1.0 candidate and must
not be populated with an unverified value merely to make the current checklist
look complete.

These are client-visible values. Never put a server credential in an
`EXPO_PUBLIC_*` value. If a future EAS path is introduced, it must first run
equivalent preflight, clean-install, and post-artifact checks and be reviewed
as a separate release-hardening change.

## 3. Configure RevenueCat and store products

The 1.0 product is a **one-time lifetime unlock of all seven shaped cuts**:
Organic, Living, Living spectrum, Crystal, Crystal quartered, Amoeba, and
Amoeba columnar. Difficulty remains free. Fractal is not included, advertised,
or selectable in 1.0.
The code checks the exact entitlement `premium_cut_styles`, fetches
`offerings.current`, and accepts any package whose product identifier exactly
equals
`EXPO_PUBLIC_REVENUECAT_IOS_PREMIUM_CUTS_PRODUCT_ID` and whose RevenueCat
metadata reports `NON_SUBSCRIPTION`, `NON_CONSUMABLE`, and a null subscription
period. The RevenueCat package label, including `LIFETIME` or a custom label,
is dashboard metadata and is not part of this runtime check. If any required
value is missing or mismatched, purchase stays unavailable; the client never
substitutes a subscription, consumable, or another product.

In App Store Connect:

1. Use the existing app, Apple ID `1639767109`, for iOS bundle ID
   `com.targix.frumenative`; do not create a duplicate app record.
2. Create a non-consumable in-app purchase for the lifetime Premium Cuts
   unlock. Choose and record its actual product identifier; none is verified
   in this repository.
3. Complete its localized display name, description, price, availability, tax
   category, review screenshot, and review notes.
4. Reconcile the existing editable App Store version `1.0` with the archive
   marketing version `1.0.0` before upload. Use the exact version value Apple
   accepts for this existing record, record the decision, and attach the
   approved product to that same version before submission; the read-only audit
   found no existing IAP on the app.

In RevenueCat:

1. Create or select the correct project and add the iOS app using bundle ID
   `com.targix.frumenative`.
2. Import the verified iOS non-consumable.
3. Create the entitlement with the exact identifier
   `premium_cut_styles`; attach the product.
4. Create an offering, add a package containing the iOS product, and make that
   offering current. Its dashboard package label does not replace verification
   of the exact store product identifier and non-consumable metadata.
5. Copy only the iOS app's **public SDK key** into
   `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`, and copy the exact reviewed App Store
   product identifier into
   `EXPO_PUBLIC_REVENUECAT_IOS_PREMIUM_CUTS_PRODUCT_ID`. Both are public client
   configuration; never embed a secret key. RevenueCat explicitly requires
   SDKs to use public keys. See
   [RevenueCat API keys](https://www.revenuecat.com/docs/projects/authentication)
   and [Offerings](https://www.revenuecat.com/docs/offerings/overview).

Before production submission, use StoreKit sandbox and TestFlight to verify:

- Classic cuts and every difficulty work without purchase.
- Each of the seven shaped cuts opens the same paywall and shows the localized
  lifetime price.
- Successful purchase immediately activates `premium_cut_styles`.
- User cancellation does not show a false failure.
- Pending, declined, interrupted, and offline purchases recover truthfully.
- Restore works after reinstall with the same store account and does not
  charge again.
- A different store account does not inherit access.
- Missing keys, missing current offering, and an unavailable product fail
  closed without unlocking premium.

RevenueCat purchases require a native build; Expo Go is not valid purchase
evidence. The future Android app/product/key and Play testing-track validation
are tracked in [`BACKLOG.md`](./BACKLOG.md) and do not block Apple 1.0.

## 4. Build and upload the exact iOS artifact

Use the one enabled Apple build path and record its archive before creating the
candidate:

- Use the checked-in archive command below with the exact
  unused build number and intended signing team. After canonical provenance,
  live-service, clean-install, and full-check gates pass in the reviewed export,
  the command regenerates `ios/` with a clean, non-interactive prebuild and
  `EXPO_NO_DOTENV=1`; a clean Git tree therefore cannot hide a stale or
  hand-edited ignored native project.
  It refuses to continue if the generated `Info.plist` does not match
  `app.config.js` and `FRUME_BUILD_NUMBER`, then verifies the identity again
  inside the resulting `.xcarchive`. Inspect the archived privacy manifests,
  entitlements, and signing identity before using Organizer to upload it.
- The command requires Xcode `26.6 (17F113)` and verifies that `HEAD`, the
  explicitly supplied `FRUME_REVIEWED_RELEASE_SHA`, and the live `main` tip at
  the hardcoded canonical GitHub repository are identical. It fetches that tree into a new source
  directory and builds only there. It also binds the live Worker response to
  the explicitly reviewed Cloudflare version ID in
  `FRUME_EXPECTED_PHOTO_API_DEPLOYMENT_ID`.

`eas-build-pre-install` deliberately exits nonzero on every remote EAS build.
Do not remove that gate merely to obtain an artifact; first implement and test
equivalent live legal-page, dependency, identity, privacy, and optimized-bundle
inspection in the remote path.

### Xcode 26.6 compiler-discovery workaround

On the current release machine, Xcode 26.6 build `17F113`'s SwiftBuild service launches
`clang -v -E -dM ... /dev/null` without draining the child pipes. Apple Clang's
discovery output exceeds the pipe capacity, so the child and build service
deadlock before compilation starts. Running the same compiler probe directly
succeeds; a full Frume Release build also succeeds when the discovery response
is bounded.

The checked-in `scripts/xcode-clang-proxy.py` intercepts only those
`-v -E -dM /dev/null` discovery probes. It resolves Apple Clang through the
active Xcode/`DEVELOPER_DIR`, returns only the compiler identity/target macros
needed by Xcode, and delegates every real compile invocation unchanged with
`exec`. Its output is guarded below the reproduced pipe limit.

Use the repeatable unsigned Release structural build. It requires all public
configuration explicitly, validates it without contacting legal pages, owns a
clean Expo prebuild, verifies the optimized Hermes bundle and app identity,
and prints the exact `.app` path:

```sh
npm run ios:release:simulator
```

The signed path is guarded: it refuses to run until the reviewed team, unused
build number, full approved canonical GitHub `main` SHA, Worker URL and immutable deploy
ID, RevenueCat iOS public key, exact non-consumable product ID, privacy URL, and
support URL are all present. After making those values available without
printing or committing secrets, run:

```sh
FRUME_DEVELOPMENT_TEAM=DV3YJVS7GN \
FRUME_BUILD_NUMBER=3 \
FRUME_REVIEWED_RELEASE_SHA='<full approved canonical GitHub main SHA>' \
FRUME_EXPECTED_PHOTO_API_DEPLOYMENT_ID='<active Cloudflare version ID>' \
npm run ios:archive
```

The source defaults to build `3`. The historical TestFlight trains `1.0.0`,
`1.0.1`, `1.0.3`, and `1.0.4` use build `1` in at least the `1.0.0` and `1.0.4`
trains, while uploaded build `2` is invalid because its source archive contains
a RevenueCat Test Store key. Do not reuse either number; check build history
immediately before archiving and increment the source default and its tests if
`3` is no longer available.

The archive script exports `EXPO_NO_DOTENV=1` for the whole transaction,
rejects an Android RevenueCat key in the iOS environment, generates a clean
root and Worker dependency trees from their lockfiles, generates a clean native
project, applies the same `CC`, `CPLUSPLUS`, and
`CLANG_ENABLE_EXPLICIT_MODULES=NO` build settings, creates a unique temporary
archive path, and verifies bundle ID, marketing version, build number, and the
reviewed iOS key, product ID, and entitlement before and after the archive. Do
not archive from the Xcode
GUI on this machine until the plain compiler probe is verified not to hang,
because the GUI does not inherit these command-line settings or the release
guards.

Record the reviewed commit, archive identifier, iOS
build number, upload receipt, and App Store Connect processing state. Install
that exact build through TestFlight and complete the iPhone/iPad QA checklist
below. A successful archive, upload, or processing result is not App Store
approval.

Upload the inspected local archive through Xcode Organizer.
After Apple finishes processing, select that exact build in App Store Connect.
The final **Submit for Review** action remains a separate, explicit action
after metadata, compliance, and reviewer information have been reviewed.

## 5. Privacy and support

Accurate static puzzle-product pages are checked in under `support-site/` and
pass their local content/security check. The known
`https://frume-support.vercel.app/` and `/privacy/` deployment still redirects
anonymous visitors to Vercel authentication, while the live App Store record's
older `https://frume.vercel.app/` URLs belong to the superseded photo-frame
listing. None is release evidence. Do not submit until the reviewed support and
privacy URLs return HTTP 200 HTML without authentication, redirects to unrelated
properties, or placeholder content.

The privacy policy and store privacy declarations must describe the behavior
of the exact release build, including:

- curated photo metadata and required Unsplash use tracking through the
  Cloudflare proxy, including the bounded local retry queue used while offline;
- six bundled category-cover derivatives, their linked photographer credits,
  and the source/license record in `assets/categories/SOURCES.md`;
- RevenueCat's anonymous app-user identifier, purchase/entitlement handling,
  and the App Store relationship. At minimum, the current integration requires
  the App Privacy declaration to review **Purchase History** as collected for
  **App Functionality**, not linked to identity, and not used for tracking;
- puzzle state stored locally on the device;
- whether any diagnostics, analytics, support messages, or other data are
  actually collected in the submitted build;
- retention, deletion/contact choices, and third-party links.

Do not claim “no data collected” until the shipped SDK behavior and store
definitions have been reviewed. Apple requires a privacy policy URL and
accurate third-party data declarations. Use the current Apple guidance:

- [Apple app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy)
- [Apple Support URL requirements](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)

Confirm the in-app About & Support screen opens both approved pages, displays
version `1.0.0`, explains local/photo/purchase behavior consistently with the
policy, and restores purchases.

## 6. Store metadata and screenshots

- Work in the existing [App Store Connect record](https://appstoreconnect.apple.com/apps/1639767109/appstore).
  The 2026-07-31 audit was read-only; none of the following changes has been
  saved.
- Confirm name, subtitle, description, keywords, category, copyright,
  territories, price, and release method. Listing copy must describe only
  shipped behavior.
- Replace the obsolete photo-frame subtitle, description, keywords, and
  screenshots with the puzzle metadata in `STORE_METADATA.md`. Change the
  primary category from Photo & Video to Games and select Puzzle as the Games
  subcategory if the dashboard offers it. Remove the stale Lifestyle secondary
  category unless a separately reviewed positioning decision supports it.
- Change the release method from automatic to manual so approval does not
  immediately publish the new product.
- Keep the app price free and Public Distribution if the reviewed launch scope
  remains free Classic play plus the paid Premium Cuts IAP. The current dashboard
  makes the free app available in 175 territories.
- Disable Apple Silicon Mac and Apple Vision Pro availability for this
  iPhone/iPad-only 1.0 unless both destinations receive explicit build and QA
  coverage.
- Confirm bundle ID `com.targix.frumenative`, the reconciled App Store/archive
  marketing version, the selected
  archive's confirmed-unused build number (planned as `3` or later), signing
  team, and in-app purchase attachment. Reconcile the archive marketing version
  with the existing dashboard version `1.0` before upload.
- Complete age rating, export compliance, App Privacy, privacy policy URL,
  Support URL, and review contact information.
- Replace the stale 2022 copyright with the current year and verified legal
  entity name. Re-answer the full age-rating questionnaire for the puzzle
  binary, including the newly pending social-feature questions; do not carry
  forward the old 12+/13+ result without completing them.
- Resolve Digital Services Act compliance before offering the app in the 27 EU
  countries. The current DSA submission is Rejected while the app is identified
  as a non-trader; do not treat that selection as cleared compliance.
- Replace `Data Not Collected` with declarations reviewed against the final
  binary. For the current RevenueCat design, declare Purchase History as
  collected for App Functionality, not linked to identity, and not used for
  tracking, then review whether any other SDK behavior adds data types.
- Audit the generated iOS archive's `PrivacyInfo.xcprivacy` files and
  required-reason API declarations for Expo, React Native, RevenueCat, storage,
  and every other native dependency. The latest ignored local prebuild contains
  an app manifest with required-reason entries, but it is not evidence for the
  future archive; do not add guessed reasons. Use the current
  [Expo privacy manifest guide](https://docs.expo.dev/guides/apple-privacy/)
  and validate the exact uploaded artifact.
- In review notes, explain how to reach any Premium Cut paywall, that the
  purchase is a non-consumable lifetime unlock, how to restore it, that no
  Frume account is required, and any network dependency needed to load photos.
- Upload one to ten accurate screenshots per required device family. Because
  `supportsTablet` is true, include and QA iPad screenshots. For the current
  simulator set, capture native portrait output from iPhone 17 Pro Max
  (`1320 × 2868`) and iPad Pro 13-inch (`2064 × 2752`), verify there is no alpha
  channel, and follow the live
  [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
  rather than reusing stale pixel dimensions.

Use this truthful story for both the required iPhone and iPad screenshot sets:

1. Home and “Choose a photograph.”
2. Curated theme gallery.
3. Photo preview, Unsplash attribution, cuts, and free difficulty choices.
4. Classic puzzle board in progress.
5. Organic puzzle board with visibly irregular seams.
6. Living puzzle board with visibly non-grid generative cells.
7. Completed photograph and next/replay/home actions.
8. Premium Cuts sheet with the real localized lifetime price, if purchases are
   fully configured in the captured build.

Capture from the exact release build with production configuration. Do not show
test accounts, personal notifications, broken images, unconfigured links,
placeholder prices, debug UI, simulator chrome, or claims not supported by the
binary.

## 7. Release-candidate QA

Test the exact TestFlight artifact, not a Metro development session:

- Cold launch, warm launch, background/foreground, force quit, reinstall, and
  upgrade from the previous public build when one exists.
- Home, all six themes, Surprise me, attribution links, photo load failure,
  offline recovery, and Worker rate/upstream failure messaging.
- All six Classic sizes (9, 16, 25, 49, 100, and 196 pieces); every shaped cut
  at each supported size before and after purchase; portrait and landscape;
  small and large iPhones plus supported iPads.
- Drag, snap, return-loose-pieces, guide toggle, completion, Play
  again, Home, haptics, and safe-area behavior.
- Save/resume during an unfinished puzzle, including force quit and device
  rotation; ensure corrupt or stale local state fails safely.
- VoiceOver focus order and labels, large text, contrast, reduced motion, touch
  targets, and screen-reader completion announcement.
- Purchase, cancellation, pending/declined state, offline state, reinstall,
  restore, and price localization with iOS sandbox accounts.
- Privacy/support links, app version, no-account wording, and store listing
  consistency.
- App icon, splash screen, display name, no development client UI, and no
  cleartext production traffic.

The current unsigned structural proof in
`release-evidence/2026-08-12-remediation-release-simulator.md` covers a fresh
post-protocol clean prebuild, optimized bundle inspection, installation, and
cold launch without Metro. Its RevenueCat key and photo origin are synthetic,
so it is not a production-service, signing, App Store, TestFlight, purchase, or
physical-device receipt. The earlier
`release-evidence/2026-08-01-release-candidate.md`
verifies Home, the 3-by-2 landscape and 2-by-3 portrait Gallery layouts, the
repaired Animals crop, compact inline photo failure/retry, and saved Classic
restore on the older implementation. The prior
`release-evidence/2026-07-31-ios-simulator.md` records full Classic completion,
force-termination persistence, maximum Dynamic Type, and iPad coverage from
the same implementation line. Five opaque 1320×2868 iPhone drafts and five
opaque 2752×2064 iPad drafts cover Home, gallery, setup, Classic progress, and
completion under `assets/store/app-store/`. Premium Cuts/paywall captures are
intentionally absent. None of these local artifacts has production Worker,
RevenueCat, and anonymously verified legal-page configuration together. None
is a signed archive, TestFlight artifact, purchase test, physical-device
result, final screenshot set, or submission candidate.

## 8. Local validation and secret checks

Install reproducibly and run the repository's complete validation:

```sh
npm ci
npm --prefix server ci
npm run check
npm run security:dependencies
npm --prefix server run deploy -- --dry-run
```

Then verify configuration and secret hygiene before committing:

```sh
git check-ignore -v .env .env.local server/.dev.vars
if git check-ignore -q .env.example; then echo 'ERROR: .env.example is ignored'; else echo 'OK: .env.example is trackable'; fi
if git check-ignore -q server/.dev.vars.example; then echo 'ERROR: server/.dev.vars.example is ignored'; else echo 'OK: server/.dev.vars.example is trackable'; fi
git ls-files -- .env .env.local server/.dev.vars '*.p8' '*.p12' '*.key' '*.mobileprovision'
git grep -n -E 'UNSPLASH_(ACCESS|SECRET)_KEY|sk_[A-Za-z0-9]+' -- ':!*.example' ':!RELEASE.md'
git diff --check
```

Expected results:

- populated `.env`, `.env.local`, and `server/.dev.vars` are ignored;
- `.env.example` and `server/.dev.vars.example` are **not** ignored and contain
  blank values only;
- `git ls-files` prints no populated env or signing credential file;
- source contains no Unsplash key and no RevenueCat secret-key-shaped value;
- `UNSPLASH_ACCESS_KEY` appears only as a variable name in server-side code,
  tests, documentation, and the blank local template;
- all tests/type checks/Expo Doctor, dependency gate, and Worker dry run pass.
  Repeat and record the exact counts from the reviewed release commit; interim
  working-tree counts are not immutable candidate evidence.

The audit commands are evidence, not authorization for a forced dependency
rewrite. The 2026-08-12 mobile production audit reports ten high findings, all
in one Expo/Metro build-tool chain rooted in the two reviewed `image-size`
advisories; no fixed `image-size` release exists and npm's suggested path is an
unreviewed major Expo 57 migration. `npm run security:dependencies` enforces
the exact dependency-chain and GHSA allowlist and requires zero Worker
advisories. Any change fails closed for review. Handle the SDK migration as a
separate device-tested change.

The current local Wrangler dry run reports all three Durable Object bindings,
both migration tags through `v2`, and both Rate Limit bindings. That proves the checked-in configuration can be
packaged; it does **not** prove the namespace IDs are unique in the intended
Cloudflare account, migrations `v1` and `v2` are deployed, the rotated secret is
installed, or the remote Worker is healthy. Preserve the dry-run output and
record those live checks separately.

Finally, inspect the production JS bundle and confirm the Unsplash credential
value is absent. A rotated key is not safe if it is shipped in the client.

## 9. Release evidence

Attach the following to the release handoff:

- reviewed commit/tag and clean working-tree output;
- `npm run check` and Worker dry-run results;
- Cloudflare deployment URL and successful `/health` response, without secret
  values;
- confirmation that the legacy Unsplash key was revoked;
- exact guarded local iOS archive identifier, upload receipt, and App Store
  Connect processing link;
- verified RevenueCat entitlement/offering/package/product mapping;
- privacy and support URLs;
- final App Store copy, iPhone/iPad screenshots, and completed compliance
  declarations;
- physical-device QA matrix with platform, OS, device class, purchase result,
  and tester/date;
- App Store review status separately from build/upload/processing status.

Do not compress “tests passed,” “Worker deployed,” “archive built,” “uploaded,”
“processed,” “submitted for review,” and “approved” into a single “released”
status. Each is independent evidence.
