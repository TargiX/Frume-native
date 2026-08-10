# Frume release handoff

This runbook describes the repository and externally verified state as of
2026-08-01, with repository-side updates from 2026-08-09 marked in place. A `TODO` below is a hard release gate, not an optional cleanup.
Never paste credentials, signing files, real users' data, or unverified
dashboard identifiers into this file.

Frume 1.0 is an Apple-only release for iPhone and iPad. Android source and
prepared Google Play assets remain in the repository for a future release, but
no Android build, product, dashboard field, or Play Console task is a gate for
this App Store submission.

## Current release state

| Area | Verified state | Release gate |
| --- | --- | --- |
| App identity | The existing App Store Connect app is Apple ID `1639767109`, bundle ID `com.targix.frumenative`, and SKU `EX1660458511601`. Its editable platform-version record is `1.0`. TestFlight contains build trains `1.0.0`, `1.0.1`, `1.0.3`, and `1.0.4`; build `1` exists under both `1.0.0` and `1.0.4`. The source now keeps marketing version `1.0.0` and uses iOS build `2`. iPhone and iPad are supported with deployment target iOS 16.0. | Change the editable App Store version to the exact three-component source version `1.0.0` before attaching the build, confirm build `2` remains unused immediately before archiving, and never revert to build `1`. |
| Cloudflare Worker | `frume-photos` builds with SQLite `CategoryPhotoPool` and `TrackingGrant` Durable Objects plus photo-issuance and token-attempt rate limits. Workerd tests and a Wrangler dry run pass. A read-only account audit confirmed that this Worker, its secret, migration, bindings, and cron do not yet exist remotely. | Confirm the authenticated Targix8 account is intended, choose its missing `workers.dev` account subdomain, then atomically deploy migration `v1` with a rotated `UNSPLASH_ACCESS_KEY`. |
| Worker deploy URL | **TODO — no deploy URL exists yet.** The intended Cloudflare account currently has no `workers.dev` subdomain and the config has no custom route. | Choose/register the account subdomain explicitly. Do not derive or guess the resulting URL; record only the URL returned by a successful deployment and verified by `/health`. |
| Unsplash credential | A gitignored root `.env` contains legacy Unsplash access/secret variable entries. Rotation is not confirmed; treat both values as compromised. | Invalidate them in Unsplash, obtain a replacement Access Key, verify the old value no longer works, remove the legacy local entries, and store the replacement only in Cloudflare or a gitignored `server/.dev.vars`. |
| Unsplash API capacity | **Conflict to resolve:** the operator stated on 2026-07-29 that Frume already holds Unsplash **Production** access at 1000 requests/hour, but this runbook has never recorded verified evidence of it. The pre-production cron now uses 12 search requests/hour, and each started puzzle requires a download-tracking request. | Obtain Unsplash Production approval, verify live `X-Ratelimit-*` headers under expected load, and add operational alerting before store release. |
| Expo photo API | The client fails closed unless `EXPO_PUBLIC_PHOTO_API_URL` is set. | Set it to the verified HTTPS Worker base URL, without `/photo`, `/track`, credentials, query, or fragment. |
| RevenueCat | Client integration exists, but the live App Store Connect app has no in-app purchases and no RevenueCat iOS app, public SDK key, current offering, or product mapping is verified. | Create the reviewed non-consumable, attach it to version `1.0`, complete the RevenueCat mapping, and pass StoreKit sandbox/TestFlight purchase and restore QA. |
| Premium contract | Entitlement is exactly `premium_cut_styles`. A purchase is enabled only when a package in the current offering contains the explicitly configured iOS product ID and RevenueCat reports `NON_SUBSCRIPTION`, `NON_CONSUMABLE`, and a null subscription period. The package label is not inspected; every product or metadata mismatch fails closed. | Attach that exact iOS non-consumable to the entitlement and a package in the current offering, then record and compile its reviewed product ID. |
| iOS build path | A clean local prebuild and complete unsigned simulator Release build passed with Xcode 26.6 on 2026-08-01 using deployment target iOS 16.0. The current disposable output ends in `frume-ios-release.NZ3pEV/Build/Products/Release-iphonesimulator/Frume.app`; identity, hashes, validation counts, and final-binary iPhone smoke evidence are in `release-evidence/2026-08-01-release-candidate.md`. Earlier end-to-end simulator QA covered the full Classic flow through completion and forced-termination resume plus iPad Home, Gallery, setup, game, paywall, and About. The current exact binary verifies portrait/landscape Home and Gallery, the repaired Animals crop, compact inline photo failure/retry, and saved-game restore. The checked-in compiler-discovery proxy avoids the locally reproduced SwiftBuild pipe deadlock without changing real compile invocations. | This remains unsigned simulator QA with no production Worker, RevenueCat, or legal URLs. Produce, inspect, upload, and TestFlight-test the exact signed production candidate; no signed archive or verified EAS project link exists yet. |
| Public links | Replacement pages are deployed and verified live as of 2026-08-10: Support at `https://frume-support.vercel.app/` and Privacy Policy at `https://frume-support.vercel.app/privacy/`, both HTTP 200 without authentication (site passes `support-site/check.mjs`). `EXPO_PUBLIC_SUPPORT_URL` and `EXPO_PUBLIC_PRIVACY_URL` are set in the local `.env.local`. The old photo-frame-era `frume.vercel.app` links are still in the dashboard record. | Replace both dashboard fields (Support URL and Privacy Policy URL) with the deployed URLs, then verify the final URLs in-app and without authentication. |
| iOS privacy manifest | The latest local prebuild generated an app manifest containing required-reason API entries and declaring no collection/tracking, and RevenueCat supplies its own manifest. The generated native directory is ignored and no release archive has been audited. | Review the manifests supplied by every native dependency and validate the exact archived binary and store declarations. |
| Dependency audit | Re-audited 2026-08-09: mobile production dependencies now report **27 advisories (11 moderate, 16 high, 0 critical)**, up from 17 on 2026-08-01 purely through newly published advisories, not new dependencies. Every one is in the Expo/Metro/React Native build chain — `metro`, `@expo/cli`, `postcss`, `js-yaml`, `minimatch`, `brace-expansion`, `image-size`, `nanoid`, `xcode`, `uuid` — which runs on the build machine and is not part of the shipped binary. `expo-image-picker`, added 2026-08-09, contributes none. npm still offers only a breaking Expo 57 upgrade. The Worker workspace reports 0 advisories. | Do not run a blind `npm audit fix --force`. Record a reviewed SDK-upgrade/risk decision and repeat the audit from the exact release commit. |
| Photo library access | Added 2026-08-09: the player can cut a photograph of their own. iOS uses `PHPickerViewController` through `expo-image-picker`, so the app never gains library access and no permission prompt is shown; the chosen file is copied into the app's private storage and is never uploaded. The usage string and the explicit camera opt-out live in `app.config.js`. | Verify the archived `Info.plist` carries the photo-library usage string and no camera entry, audit the picker's privacy manifest with the rest, and keep App Privacy at "not collected" for photographs only while nothing sends them off the device. |
| QA matrix and screenshots | **Stale as of 2026-08-09.** Home was rebuilt around the photograph, imported photographs, the 9–196 size ladder, board zoom/pan, and a multi-row tray all landed after the 2026-08-01 evidence was recorded. Bundled cut library grew from 2.6 MB to 3.8 MB; `assets` totals 39 MB, dominated by 19 MB of music and 12 MB of store artwork. | Re-run the device QA matrix and capture fresh iPhone and iPad screenshots from the exact signed candidate. Review whether 31 MB of music and store artwork all needs to ship. |
| Store record and metadata | A read-only App Store Connect review verified the existing [Frume record](https://appstoreconnect.apple.com/apps/1639767109/appstore): version `1.0` has been **Rejected** since 2022-12-21 under Guideline 4.2, Minimum Functionality. It still contains the old photo-frame subtitle, description, keywords, and screenshots; primary category Photo & Video, secondary Lifestyle; automatic release; `Data Not Collected`; no IAP; 2022 copyright; and a 12+/13+ age rating with new social-feature questions pending. No dashboard change was saved in this audit. | The puzzle product materially supersedes the rejected photo-frame concept, but that does not imply Apple approval. Replace and re-review every stale field, use Games with Puzzle as the subcategory where supported, choose manual release, attach the non-consumable, complete App Privacy and age rating from the exact binary, upload new iPhone/iPad screenshots, and submit only after TestFlight QA. |
| Commercial and distribution state | Paid Apps Agreement is active for 2026-07-04 through 2027-07-03; Free Apps Agreement is active for 2026-07-03 through 2027-07-03. Banking and foreign-status tax records display active. The base app is free in 175 territories and Public Distribution is selected, which fits free Classic play plus a paid Premium Cuts IAP for Organic and Living. Digital Services Act compliance for 27 EU countries is **Rejected** even though the app is currently marked non-trader. Apple Silicon Mac and Apple Vision Pro availability are checked despite no QA. No account, address, tax, or banking details are recorded here. | Resolve the rejected DSA status before EU distribution. Keep the base app free and public unless product scope changes. Disable Mac and Vision Pro availability for the iPhone/iPad-only 1.0 unless those platforms are explicitly built and tested. Reconfirm agreement, banking, and tax status immediately before the paid IAP goes live. |

## Source-of-truth contracts

The checked-in configuration currently establishes:

- Expo slug `frume`, scheme `frume`, dark UI, and unrestricted orientation.
- The durable native deployment target is iOS 16.0 through
  `expo-build-properties`; generated Xcode and Pod files must agree after every
  clean prebuild.
- iPad support is enabled. Shipping iPad support therefore requires iPad
  layout QA and iPad App Store screenshots in addition to iPhone QA and
  screenshots.
- If EAS is used, its iOS production profile uses store distribution and keeps
  automatic build-number increments disabled. The checked-in
  `DEFAULT_IOS_BUILD_NUMBER` is the EAS build-number authority. A local archive
  may override it with `FRUME_BUILD_NUMBER`, but only through the guarded clean
  prebuild/archive flow below.
- The Worker exposes `GET /health`, `GET /photo`, and `POST /track`, and
  schedules a six-category refill every thirty minutes.
- Category pools and photo-use grants are globally coordinated by SQLite
  Durable Objects. `/photo` issues a UUIDv4 grant bound to one exact Unsplash
  download endpoint for seven days; `/track` is one-time/idempotent and cannot
  be used as an arbitrary provider relay.
- `/photo` is limited to 60 requests/minute per Cloudflare client IP and
  `/track` to 5 attempts/minute per grant. These are safeguards, not a
  substitute for Unsplash Production capacity monitoring.
- The app contains no direct Unsplash fallback. A missing or invalid Worker URL
  prevents photo requests instead of exposing an access key.
- `EXPO_PUBLIC_*` values are compiled into the app and must be treated as
  public. Only RevenueCat **public SDK keys** belong there. RevenueCat secret
  keys must never be used by this client.

The release operator must fill these records from live command/dashboard
output before building:

| Record | Confirmed value |
| --- | --- |
| Cloudflare account/owner | TODO |
| `CategoryPhotoPool` / `TrackingGrant` migration `v1` deployed | TODO |
| Rate-limit namespace IDs `2026073101` / `2026073102` confirmed unique | TODO |
| Worker deploy URL | TODO |
| Rotated Unsplash key installed and legacy key revoked | TODO |
| Unsplash Production approval and verified hourly limit | TODO |
| iOS simulator QA artifact | `release-evidence/2026-08-01-release-candidate.md`; observed unsigned Release path ends in `frume-ios-release.NZ3pEV`; local candidate QA only |
| Final signed iOS archive/build identifier | TODO; build `1` is unavailable |
| RevenueCat project and iOS app record | TODO |
| RevenueCat iOS public SDK key installed | TODO |
| Reviewed iOS Premium Cuts product identifier installed | TODO |
| Current offering identifier | TODO |
| Current offering package and iOS product identifier | TODO |
| Privacy policy URL | TODO |
| Support page URL | TODO |
| App Store Connect app URL | `https://appstoreconnect.apple.com/apps/1639767109/appstore` |
| App Store Connect identity | Apple ID `1639767109`; bundle `com.targix.frumenative`; SKU `EX1660458511601` |
| Existing version/review state | `1.0`; Rejected 2022-12-21, Guideline 4.2 Minimum Functionality |
| Existing TestFlight trains | `1.0.0`, `1.0.1`, `1.0.3`, `1.0.4`; build `1` appears in `1.0.0` and `1.0.4` |
| Candidate source version/build | `1.0.0 (2)`; confirm build `2` is unused before archive |
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
approval and record the live hourly limit before submission. The Worker makes
six search requests every 30 minutes (12/hour), and every started puzzle adds
one required download-tracking request. Exercise the real release traffic path,
inspect the upstream `X-Ratelimit-Limit` and `X-Ratelimit-Remaining` headers,
and configure monitoring before launch. See Unsplash's
[rate-limit documentation](https://unsplash.com/documentation#rate-limiting).

Authenticate Wrangler to the intended Cloudflare account and review the
checked-in Durable Object and Rate Limit configuration:

```sh
cd server
npm ci
npx wrangler login
npx wrangler whoami
```

`server/wrangler.jsonc` already defines `CATEGORY_POOLS`,
`TRACKING_GRANTS`, migration tag `v1`, `PHOTO_ISSUE_RATE_LIMITER`, and
`TRACKING_RATE_LIMITER`. The rate-limit namespace IDs are developer-chosen
integers, but each must be unique within the target Cloudflare account.
Confirm that `2026073101` and `2026073102` do not collide before deployment;
change and record them if they do.

Any older instruction to create or bind a `PHOTO_POOL` KV namespace is
obsolete. Do not create that namespace and do not replace either Durable Object
with KV. The checked-in `v1` migration creates both SQLite-backed classes, and
their SQL leases prevent cross-isolate refill races and tracking-token replays.
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
its public `workers.dev` account subdomain. Then deploy the reviewed `v1`
SQLite migration and newly rotated key atomically, without writing the key to
disk or exposing it as a command argument:

```zsh
printf 'Rotated Unsplash access key: '
IFS= read -r -s FRUME_ROTATED_UNSPLASH_KEY
printf '\n'
printf 'UNSPLASH_ACCESS_KEY=%s\n' "$FRUME_ROTATED_UNSPLASH_KEY" |
  ./node_modules/.bin/wrangler deploy --strict --secrets-file /dev/stdin
unset FRUME_ROTATED_UNSPLASH_KEY
```

For later secret rotation, `wrangler secret put UNSPLASH_ACCESS_KEY` is valid
because the Worker already exists. Never put the key in `wrangler.jsonc`, a
shell command argument, this document, root `.env`, EAS, or an
`EXPO_PUBLIC_*` variable. See Cloudflare's
[secret handling guidance](https://developers.cloudflare.com/workers/configuration/secrets/).

Copy the exact HTTPS URL printed by Wrangler into the release record, then
verify readiness:

```sh
WORKER_URL='paste the exact successful deploy URL here'
curl --fail --silent --show-error "$WORKER_URL/health"
```

Release readiness requires HTTP 200 with `status: "ok"` and all five checks
(`categoryPools`, `trackingGrants`, `photoIssueRateLimiter`,
`trackingRateLimiter`, and `unsplashAccessKey`) equal to `true`. Then request
all curated categories and `Surprise me` from a release build. Confirm each
photo returns a UUID grant, attribution opens an Unsplash URL, and starting a
puzzle reaches `POST /track` exactly once without revealing the Unsplash key in
a response or log. Replay the same event once and confirm it remains an
idempotent 204; a different location with the same token must be rejected.

For local Worker-only work, copy `server/.dev.vars.example` to the ignored
`server/.dev.vars` and use a newly rotated development key. Local Wrangler
Durable Object state is separate from production by default. Do not seed or
mutate production objects during local validation.

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

Local env files are not uploaded to EAS. For a local Xcode archive, make the
five reviewed Apple release values available during the release prebuild and
bundle step. If EAS is the chosen build path, add the same values to its
`production` environment:

- `EXPO_PUBLIC_PHOTO_API_URL`
- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`
- `EXPO_PUBLIC_REVENUECAT_IOS_PREMIUM_CUTS_PRODUCT_ID`
- `EXPO_PUBLIC_PRIVACY_URL`
- `EXPO_PUBLIC_SUPPORT_URL`

`.env.example` also retains `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` for a
future Android release. It is not required for the Apple 1.0 candidate and must
not be populated with an unverified value merely to make the current checklist
look complete.

These are client-visible values. If using EAS, use `plaintext` visibility.
Never use EAS to disguise a server credential as an `EXPO_PUBLIC_*` value.
Verify names without printing unrelated account data:

```sh
npx eas-cli@latest env:list --environment production
```

If EAS is used, its production profile uses the EAS production environment
because distribution is `store`. Expo documents the current behavior in
[Environment variables in EAS](https://docs.expo.dev/eas/environment-variables/).

## 3. Configure RevenueCat and store products

The 1.0 product is a **one-time lifetime unlock of Organic and Living cuts**, not
difficulty. The entitlement architecture can support later finished cuts, but
Fractal is not included, advertised, or selectable in 1.0.
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
4. Change the editable version to `1.0.0`, then attach the approved product to
   that version before submission; the read-only audit found no existing IAP
   on the app.

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
- Organic and Living cuts open the same paywall and show the localized lifetime price.
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

Choose one Apple build path and record it before creating the candidate:

- For a local build, use the checked-in archive command below with the exact
  unused build number and intended signing team. The command first regenerates
  `ios/` with a clean, non-interactive prebuild and `EXPO_NO_DOTENV=1`; a clean
  Git tree therefore cannot hide a stale or hand-edited ignored native project.
  It refuses to continue if the generated `Info.plist` does not match
  `app.config.js` and `FRUME_BUILD_NUMBER`, then verifies the identity again
  inside the resulting `.xcarchive`. Inspect the archived privacy manifests,
  entitlements, and signing identity before using Organizer to upload it.
- For EAS, authenticate and link interactively so the owner is reviewed before
  anything is created:

  ```sh
  npx eas-cli@latest login
  npx eas-cli@latest whoami
  npx eas-cli@latest project:init
  npx eas-cli@latest project:info
  npx eas-cli@latest config --platform ios --profile production
  npx eas-cli@latest build --platform ios --profile production
  ```

  `project:init` may add the real EAS project ID to `app.config.js`. Review that
  diff and confirm the Expo project URL/owner match the release record. Do not
  paste a guessed ID. Automatic build-number increments are disabled. If build
  `2` is no longer available, update `DEFAULT_IOS_BUILD_NUMBER` and its test in
  source before EAS resolves the config. Do not assume that a shell-only
  `FRUME_BUILD_NUMBER` reaches the remote builder: if an EAS override is
  deliberately used, create and verify it in the selected production
  environment. Record the number shown by `eas config` and by the completed
  build. Current command details are in the
  [EAS CLI reference](https://docs.expo.dev/eas/cli/).

### Xcode 26.6 compiler-discovery workaround

On the current release machine, Xcode 26.6's SwiftBuild service launches
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

Use the repeatable unsigned Release smoke build:

```sh
npm run ios:release:simulator
```

The signed path is guarded: it refuses to run until the reviewed team, unused
build number, Worker URL, RevenueCat iOS public key, exact non-consumable
product ID, privacy URL, and support URL are all present. After making those
values available without printing or committing them, run:

```sh
FRUME_DEVELOPMENT_TEAM=DV3YJVS7GN \
FRUME_BUILD_NUMBER=2 \
npm run ios:archive
```

The source now also defaults to build `2`. The historical TestFlight trains
`1.0.0`, `1.0.1`, `1.0.3`, and `1.0.4` use build `1` in at least the `1.0.0`
and `1.0.4` trains. Do not revert to `1`; check the relevant build history
immediately before archiving and increment beyond `2` if `2` is no longer
available.

The archive script generates a clean native project, applies the same `CC`,
`CPLUSPLUS`, and `CLANG_ENABLE_EXPLICIT_MODULES=NO` build settings, creates a
unique temporary archive path, and verifies bundle ID, marketing version, and
build number both before and after the archive. Do not archive from the Xcode
GUI on this machine until the plain compiler probe is verified not to hang,
because the GUI does not inherit these command-line settings or the release
guards.

For either path, record the reviewed commit, archive/build identifier, iOS
build number, upload receipt, and App Store Connect processing state. Install
that exact build through TestFlight and complete the iPhone/iPad QA checklist
below. A successful archive, upload, or processing result is not App Store
approval.

If EAS performed the build, submit by exact build ID, not `--latest`, so a
concurrent build cannot select the wrong artifact:

```sh
IOS_BUILD_ID='copy the reviewed iOS EAS build ID'
npx eas-cli@latest submit --platform ios --profile production --id "$IOS_BUILD_ID"
```

For a local archive, upload the inspected archive through Xcode Organizer.
After Apple finishes processing, select that exact build in App Store Connect.
The final **Submit for Review** action remains a separate, explicit action
after metadata, compliance, and reviewer information have been reviewed.

## 5. Privacy and support

Accurate public pages for the puzzle product are currently missing. The live
record's old `https://frume.vercel.app/` support URL and
`https://frume.vercel.app/privacy` privacy URL belong to the superseded
photo-frame listing and are not release evidence. Do not submit until approved
replacement URLs return HTTP 200 without authentication, redirects to unrelated
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
- Confirm bundle ID `com.targix.frumenative`, version `1.0.0`, the selected
  archive's confirmed-unused build number (currently planned as `2`), signing
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
- In review notes, explain how to reach the Organic or Living cut paywall, that the
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

1. Home and “Choose a puzzle.”
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
- Easy, medium, and hard Classic puzzles; Organic and Living before and after
  purchase; portrait and landscape; small and large iPhones plus supported iPads.
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

The latest unsigned simulator artifact is recorded in
`release-evidence/2026-08-01-release-candidate.md`. It was generated after a
clean iOS prebuild, installed on iPhone 17 Pro and Pro Max simulators, and
smoke-tested in portrait and landscape. The exact binary verifies Home, the
3-by-2 landscape and 2-by-3 portrait Gallery layouts, the repaired Animals
crop, compact inline photo failure/retry, and saved Classic restore. The prior
`release-evidence/2026-07-31-ios-simulator.md` records full Classic completion,
force-termination persistence, maximum Dynamic Type, and iPad coverage from
the same implementation line. Five opaque 1320×2868 iPhone drafts and five
opaque 2752×2064 iPad drafts cover Home, gallery, setup, Classic progress, and
completion under `assets/store/app-store/`. Premium Cuts/paywall captures are
intentionally absent. Neither local artifact has production Worker,
RevenueCat, or legal URL configuration. Neither is a signed archive,
TestFlight artifact, purchase test, physical-device result, final screenshot
set, or submission candidate.

## 8. Local validation and secret checks

Install reproducibly and run the repository's complete validation:

```sh
npm ci
npm --prefix server ci
npm run check
npm --prefix server run deploy -- --dry-run
npm audit --omit=dev
npm --prefix server audit
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
- all tests/type checks/Expo Doctor and the Worker dry run pass. The latest
  dated local receipt is 195 mobile tests, 23 Workerd tests, 28 server-client
  tests, and Expo Doctor 18/18; repeat these counts from the reviewed release
  commit.

The audit commands are evidence, not authorization for a forced dependency
rewrite. As of this handoff the mobile audit reports 12 moderate and 5 high
advisories, with no critical advisory; its remaining suggested remediation is
an unreviewed major Expo 57 migration. The Worker audit reports zero. Re-run
both from the reviewed release commit, examine any new direct/runtime
advisory, and handle the SDK migration as a separate tested change.

The current local Wrangler dry run reports both Durable Object bindings and
both Rate Limit bindings. That proves the checked-in configuration can be
packaged; it does **not** prove the namespace IDs are unique in the intended
Cloudflare account, migration `v1` is deployed, the rotated secret is
installed, or the remote Worker is healthy. Preserve the dry-run output and
record those live checks separately.

Finally, inspect the production JS bundle or EAS artifact configuration and
confirm the Unsplash credential value is absent. A rotated key is not safe if
it is shipped in the client.

## 9. Release evidence

Attach the following to the release handoff:

- reviewed commit/tag and clean working-tree output;
- `npm run check` and Worker dry-run results;
- Cloudflare deployment URL and successful `/health` response, without secret
  values;
- confirmation that the legacy Unsplash key was revoked;
- selected local-Xcode or EAS build path, exact iOS archive/build identifier,
  upload receipt, and App Store Connect processing link;
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
