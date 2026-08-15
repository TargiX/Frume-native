# Frume store metadata draft

This copy describes the 1.0 product that exists in the repository. It must be
reviewed against the exact TestFlight binary before submission. Frume 1.0 is
Apple-only and supports both iPhone and iPad. Dashboard URLs, legal names,
prices, territories, and contact details must come from the release operator;
do not invent them here.

## Existing App Store Connect record

Use the existing [Frume App Store Connect record](https://appstoreconnect.apple.com/apps/1639767109/appstore):

- Apple ID: `1639767109`
- Bundle ID: `com.targix.frumenative`
- SKU: `EX1660458511601`
- Editable platform version: `1.0`
- Review state: **Rejected** on 2022-12-21 under Guideline 4.2, Minimum
  Functionality
- Old submitted binary displayed in the record: `1.0.4 (1)`; build number `1`
  is already used and must not be reused
- Existing TestFlight build trains: `1.0.0`, `1.0.1`, `1.0.3`, and `1.0.4`;
  build `1` appears under `1.0.0` and `1.0.4`
- Invalid uploaded build: `1.0.0 (2)`; its source archive contains a RevenueCat
  test key and it must never be attached or submitted
- Current source default: marketing version `1.0.0`, build `3`; build `3`
  still requires an availability check immediately before archive

**Live dashboard state, read through the App Store Connect API on 2026-08-15.**
This supersedes the 2026-07-31 read-only audit, which described the old
photo-frame listing and is no longer true of anything below.

- Name `Frume`, subtitle `Quiet photo puzzles`, primary locale `en-US`
- Keywords
  `jigsaw,puzzle,photo,my photos,relaxing,calm,focus,brain,organic,generative`
- Primary category **Games**; no secondary category
- Age rating **4+**
- Support URL `https://support-site-one-alpha.vercel.app/`, privacy policy
  `https://support-site-one-alpha.vercel.app/privacy/`
- Content rights: `USES_THIRD_PARTY_CONTENT`
- In-app purchase `com.targix.frumenative.premiumcuts`, non-consumable, **in
  review**
- Builds 2 through 7 uploaded and valid; build 7 uploaded 2026-08-14. The 2022
  build 1 entries are expired.
- Release type `AFTER_APPROVAL` — still automatic release, not the manual
  release this document recommends below
- **Version 1.0.0 is `REJECTED`.** A review submission on 2026-08-14 sits in
  `UNRESOLVED_ISSUES` under **Guideline 2.1, Information Needed**: Apple asked
  for the App Review Information notes and a screen recording, and raised no
  functional defect. The answer is drafted under "App Store review notes" below.

The description and promotional text on the listing are the puzzle copy, not the
old photo-frame copy. Screenshots have not been verified through the API and
still need checking against the exact candidate.

Treat this section as a snapshot with a date, not as live state: re-read the API
before relying on it.

The dashboard also shows active Paid Apps and Free Apps Agreements (through
2027-07-03), plus active banking and foreign-status tax records. The base app is
free in 175 territories with Public Distribution selected. Digital Services Act
compliance for the 27 EU countries is **Rejected** while the app is identified
as a non-trader. Apple Silicon Mac and Apple Vision Pro availability are
checked, although this 1.0 has only been scoped and QA'd for iPhone and iPad.
No sensitive account, address, banking, or tax details are copied here.

The new puzzle product materially supersedes the concept Apple rejected in
2022, but the redesign is not evidence or a promise that Apple will approve a
new submission.

## Positioning

**Promise:** a calm, tactile way to turn beautiful photographs into puzzles.

**Business model:** all Classic puzzles and every size are free. Premium Cuts
is a one-time lifetime purchase that unlocks the shaped cuts — Organic, Living,
Living spectrum, Crystal, Crystal quartered, Amoeba, and Amoeba columnar.
Fractal is a future cut and is not included, advertised, or selectable in 1.0.
Frume does not sell photographs and does not paywall size.

## App Store draft

**Name**

Frume

**Subtitle**

Quiet photo puzzles

**Promotional text**

Slow down with tactile photo puzzles. Cut your own photograph or a curated
one, play every size for free, and unlock the shaped cuts forever with one
purchase.

**Description**

Turn a beautiful photograph into a quiet moment of focus.

Frume is a tactile jigsaw puzzle designed around the picture, with a calm
interface that stays out of the way. Choose a photograph, choose how many
pieces, and solve at your own pace.

FREE CLASSIC PUZZLES

- Every size is free, from 9 pieces to 196
- Cut a photograph from your own library, or a curated Nature, City, Animals,
  Travel, Food, or Ocean theme
- Pinch to look closer on a large board; one finger always plays
- Pieces wait on a shelf that gains rows as the pile grows
- Use the photo guide whenever you need it
- Leave and return without losing your puzzle

YOUR OWN PHOTOGRAPHS

Pick a picture from your library and Frume cuts that one. It stays on your
device: it is never uploaded, and Frume never gains access to your library —
the system picker hands over a single photograph and nothing else.

PREMIUM CUTS

Shaped cuts that leave the grid behind. Organic flows in irregular seams;
Living grows an even fringe of fine teeth; Living spectrum varies those teeth
across five scales; Crystal makes six-fold mineral tips and Crystal quartered
four blockier ones; Amoeba forms blobby pseudopod interlocks and Amoeba
columnar tall banded lobes. Premium Cuts is one optional, non-consumable
lifetime purchase. It does not lock any size, and it is not a subscription.

Frume does not require an account. Photographer credit is shown for photos
provided through Unsplash.

**Keywords draft**

jigsaw,puzzle,photo,my photos,relaxing,calm,focus,brain,organic,generative

**Primary category**

Games

**Games subcategory**

Puzzle, if the current dashboard supports that selection

Do not retain Photo & Video as primary or the stale Lifestyle secondary
category without a new, explicit positioning decision.

## App Store screenshot sequence

Capture the following sequence from the exact TestFlight candidate with
production services and the real localized lifetime price. Produce and review
the required iPhone and iPad device-family sets; do not stretch one family into
the other.

1. Home — “Photographs, cut differently.”
2. Theme gallery — the six curated categories.
3. Setup — photo preview, photographer credit, cut choice, and free difficulty.
4. Classic game — a partly completed board and organized tray.
5. Organic game — visibly irregular flowing seams.
6. Living game — visibly non-grid generative cells.
7. Completion — finished photograph and next/replay/home actions.
8. Premium Cuts — only when the real localized lifetime product is available.

Suggested captions:

1. **A quieter kind of puzzle**
2. **Find a photograph to solve**
3. **Every Classic difficulty is free**
4. **Pick up where you left off**
5. **Flowing Organic cuts**
6. **Generative Living cuts**
7. **One picture, piece by piece**
8. **Unlock Premium Cuts forever**

Do not show placeholder pricing, a development client, simulator chrome,
personal notifications, broken images, test products, or unfinished Fractal
controls.

## App Store review notes

Build 7 was rejected on 2026-08-14 under Guideline 2.1, Information Needed. That
rejection asked for eight specific things in the App Review Information notes
plus a screen recording; it raised no functional defect. The numbered answers
below map one-to-one onto Apple's request and are meant to be pasted into the
**Notes** field.

**These answers describe the next build, which adds anonymous product
analytics**, not build 7. Answer 5 lists it and the App Privacy declaration
below declares it; the two must never move apart. Do not paste these notes
against build 7 — that build contains no analytics, and the declaration would
then overstate what the binary does.

**One fact must be supplied before pasting, because it is about the exact
binary rather than this repository:** the device and OS list in answer 2.

### 1. Screen recording

Not a text answer. Record on a physical iPhone running the current iOS, start
from launching the app, and cover, in one take:

1. Launch to Home.
2. **Choose a photograph** → theme gallery → pick a theme.
3. Setup screen: photographer credit, cut choice, difficulty choice.
4. Start a Classic puzzle, place several pieces, complete or leave it.
5. Back to setup, tap a cut marked **Premium** → the Premium Cuts sheet opens →
   show the real localized price and the **Restore** action.
6. Complete a sandbox purchase, showing that the premium cut then plays.
7. **Choose from library** → the system photo picker → cut and start that photo.
8. **About & Support**, showing Restore purchases, the privacy and support
   links, and the **anonymous usage** switch that turns analytics off.

There is no account, no registration, no login, no account deletion, no
user-generated content, and no App Tracking Transparency prompt, so none of
those appear. The only system prompt in the flow is the photo picker in step 7,
and it is `PHPickerViewController`, which hands over one chosen photograph
without granting library access.

### 2. Devices and operating systems tested

Supply the real list from the TestFlight and device QA runs. Frume's deployment
target is **iOS 16.0** and it supports both iPhone and iPad. Do not paste a
device list that was not actually exercised — Apple treats this answer as a
factual claim.

### 3. What the app does, who it is for, and what problem it solves

Frume turns a photograph into a jigsaw puzzle that you solve by dragging pieces
into place on the device.

The audience is casual puzzle players and people who want a calm, unhurried
activity on a phone or iPad — the same audience as a physical jigsaw. The
problem it solves is that existing photo puzzle apps surround the picture with
advertising, timers, currencies, and daily-reward mechanics; Frume keeps the
photograph at the centre with an interface that stays out of the way. It shows
no advertising, requires no account, and has no timers or scores that pressure
the player.

The value is twofold: any photograph from the player's own library becomes a
puzzle, and the paid cut styles cut the picture along shapes that a
conventional grid-and-tab jigsaw cannot produce.

### 4. Setting up and reaching the main features

**No login, no credentials, no sample files are needed.** The app opens straight
into its functionality.

- **Curated photograph:** Home → **Choose a photograph** → pick one of six
  themes (Nature, City, Animals, Travel, Food, Ocean) → setup screen → choose a
  cut and a size → **Start**.
- **Own photograph:** Home → **Choose a photograph** → **choose a photo from
  your library** → the system picker returns one photograph → same setup screen.
- **Playing:** drag a piece from the tray onto the board; a correctly placed
  piece snaps and locks. Pinch to zoom on larger boards. The photo guide and
  the restart action are in the puzzle menu.
- **Resuming:** leaving and relaunching restores the puzzle in progress.

Every Classic difficulty from 3x3 (9 pieces) to 14x14 (196 pieces) is free.

An internet connection is required to load a curated photograph, because those
are fetched from the provider rather than bundled. A photograph chosen from the
library stays on the device and plays offline.

### 5. External services used

| Service | Purpose | Notes |
|---|---|---|
| Unsplash | Curated puzzle photographs and photographer attribution | Reached only through Frume's own Cloudflare Worker; the app never holds the provider credential |
| Cloudflare Workers | Frume's own server-side photo proxy | Keeps the Unsplash key off the device and registers photo use with the provider |
| RevenueCat | In-app purchase and restore handling | Anonymous app-user identifier; no Frume account |
| Apple StoreKit | The purchase itself | Via RevenueCat |
| PostHog | Anonymous product analytics | Eight fixed events about which screens and puzzle sizes are used; opt-out in About & Support |

On the analytics specifically, because it is the only thing here that observes
the player: Frume sends eight declared events, listed exhaustively in the app's
own source, carrying only a cut style identifier, a piece count, a duration, and
a screen name. It attaches a random identifier Frume generates on the device —
**not** the advertising identifier and **not** the vendor identifier — creates no
person profile, sends no IP address, records no location, and touches no
photograph or photo metadata. It can be switched off in **About & Support**, and
switching it off deletes the identifier. None of it is used for tracking as
Apple defines the term, and the app therefore shows no App Tracking Transparency
prompt.

There is no authentication service, no payment processor other than Apple, no
advertising network, no attribution SDK, and **no AI service of any kind**.
Frume's generative cut styles are deterministic geometry computed on the device
or shipped pre-computed in the bundle; nothing is generated by a model and no
data is sent anywhere to produce them.

### 6. Regional differences

**None.** Frume behaves identically in every territory. There is one language
(English), one price for the single in-app purchase in each storefront's local
currency, the same six photo themes, the same cut styles, and the same free
difficulties everywhere. No feature, photograph, or purchase is gated by region.

### 7. Regulated industry and third-party material

Frume is not in a regulated industry.

It does display third-party material: photographs provided through the
**Unsplash API**, which is why the app's content rights declaration is set to
"uses third-party content". Frume holds **production** Unsplash API access, uses
the photographs under the Unsplash API Terms, displays photographer and Unsplash
attribution on the setup screen and in the puzzle options, links that
attribution back to the source, and registers each photo use with Unsplash as
the terms require. **Frume does not sell photographs.** The paid product is the
cutting geometry, which is Frume's own work.

Photographs the player imports from their own library are their own material,
stay on the device, and are never uploaded.

### 8. What the in-app purchase sells and how to reach it

One product only: **Premium Cuts**, product ID
`com.targix.frumenative.premiumcuts`, a **non-consumable one-time purchase**,
not a subscription and not auto-renewing. Its RevenueCat entitlement identifier
is `premium_cut_styles`.

It unlocks seven cut styles that shape the pieces differently from the free
Classic cut: Organic, Living, Living spectrum, Crystal, Crystal quartered,
Amoeba, and Amoeba columnar.

**It does not unlock any difficulty or size.** Every size from 9 to 196 pieces
is free with the Classic cut, before and after purchase.

To reach it:

1. Home → **Choose a photograph**.
2. Select any theme, or choose a photograph from the library.
3. On the setup screen, select any cut marked **Premium**.
4. The **Premium Cuts** sheet opens with the price and the purchase action.

**Restore** is available both on that sheet and in **About & Support**.

### Before pasting

Add verified App Review contact information and any StoreKit sandbox account
Apple asks for. Apple's letter also asks that this information be kept in the
Notes field for future submissions, so it should stay there rather than being
sent only as a reply.

## Exact App Store dashboard update

These are pending edits, not saved dashboard state:

- Keep the existing Apple ID, bundle ID, and SKU, but change the editable
  platform version from `1.0` to the exact three-component binary version
  `1.0.0`. Never select invalid build `2`; select the planned `1.0.0 (3)`
  archive only after confirming build `3` remains unused in that train. Never
  reuse the old build number `1`.
- Replace the old photo-frame subtitle, description, promotional text,
  keywords, and screenshots with the puzzle copy and sequence above, reviewed
  against the exact TestFlight candidate.
- Set primary category to **Games** and Games subcategory to **Puzzle** if the
  current dashboard supports it. Remove the obsolete Lifestyle secondary
  category unless a new positioning review explicitly retains it.
- Change release method from **automatic** to **manual**.
- Keep the base app at **free** and retain **Public Distribution** if launch
  scope remains free Classic play plus the paid Premium Cuts IAP. Review the current
  175 territories rather than silently inheriting them.
- Disable Apple Silicon Mac and Apple Vision Pro availability for this
  iPhone/iPad-only 1.0 unless those platforms receive explicit build and QA
  coverage.
- Create the one-time Premium Cuts product as a non-consumable, complete its
  localization, price, review screenshot, and review notes, then attach it to
  version `1.0.0`. Record the exact product ID used by the binary and
  RevenueCat.
- Replace `Data Not Collected` with the declaration for the exact binary. For
  the current RevenueCat integration, declare **Purchase History** as collected
  for **App Functionality**, not linked to the user's identity, and not used for
  tracking. Re-audit the final SDK graph before confirming that no other data
  types apply.
- **Declare `Usage Data → Product Interaction` for `Analytics` and `App
  Functionality`, not linked to the user's identity, and not used for
  tracking.** Frume sends eight declared events — app opens, photo source,
  puzzle start, completion, abandonment, paywall view, purchase, and restore —
  to the PostHog project configured by `EXPO_PUBLIC_ANALYTICS_HOST` and
  `EXPO_PUBLIC_ANALYTICS_API_KEY`. Confirm the following against the final
  binary before answering, because each one is load-bearing for the answer:
  - The complete set of events and their permitted properties is the allowlist
    in `src/analytics/analyticsEvents.ts`. Values outside it are dropped before
    storage, so no photograph, filename, URL, photographer name, or free text
    can be transmitted. A build that adds an event there changes this answer.
  - The identifier is a random value Frume generates and stores on the device.
    It is not the advertising identifier, not the vendor identifier, and not
    derived from any device property, so it supports **not linked to identity**.
    `$process_person_profile: false` is sent with every event so the receiving
    project builds no person record.
  - `$geoip_disable: true` is sent with every event, so PostHog derives no
    location from the request address and no location is stored on the event.
    **Whether the raw address itself is retained is a PostHog project setting,
    not something the app controls** — Settings > Project > Privacy > "IP data
    capture configuration" must be set to discard client IP addresses, and
    `RELEASE.md` requires verifying it. With that confirmed, **do not declare
    Location**; without it, re-answer this question rather than assuming.
  - There is no advertising SDK, no third-party attribution, and no data broker,
    so **not used for tracking** holds and App Tracking Transparency is not
    required.
  - Collection is on by default and switchable off in **About & Support**, which
    also deletes the identifier and any events still queued. **This default is
    only defensible outside the EU. Resolving the Digital Services Act status
    and distributing in the EU requires making the setting opt-in or adding a
    consent step first.**
  - A build with neither analytics environment value configured sends nothing at
    all. If the submitted binary is built that way, this data type must not be
    declared.
- **Photographs the player imports are deliberately not declared as collected.**
  Apple's definition of collection is transmission off the device: an imported
  picture is copied into Frume's own storage, is never uploaded to the photo
  service, Unsplash, or anywhere else, and produces no photo-use receipt. The
  app also never gains photo-library access — `expo-image-picker` presents
  `PHPickerViewController`, which hands over one file. Confirm both facts
  against the final binary before answering the questionnaire; if a future
  feature ever sends an imported picture anywhere, this answer must change to
  **Photos or Videos**.
- The photo-library usage string is set through the `expo-image-picker` plugin
  in `app.config.js`; camera access is explicitly disabled there. Verify the
  archived `Info.plist` carries that string and no camera entry.
- Re-answer the complete age-rating questionnaire for the puzzle app, including
  the pending new social-feature questions. Do not carry forward 12+/13+ merely
  because it is the current displayed result.
- Resolve the Rejected Digital Services Act compliance state before
  distribution in the 27 EU countries. Re-review the app's non-trader
  identification and provide the dashboard action Apple requires; do not treat
  the current selection as accepted.
- Replace the old support and privacy URLs with approved public puzzle-product
  pages that return HTTP 200 without authentication, and confirm the same URLs
  open from **About & Support**.
- Replace the 2022 copyright with `2026` and the verified legal entity name; do
  not guess the entity here.
- Complete support email, App Review contact, countries/availability, app price,
  export compliance based on the final archive, and any required review access
  notes.
- Reconfirm that Paid Apps and Free Apps Agreements, banking, and tax status
  remain active before making the non-consumable available. The read-only audit
  found these prerequisites active, but did not create or save an IAP.
- Upload and review accurate iPhone and iPad screenshot sets from the exact
  production-configured candidate.

The unsigned simulator build recorded in
`release-evidence/2026-07-31-ios-simulator.md` was inspected, installed, and
launched on the target iPhone and iPad simulators. End-to-end QA covered the
iPhone Classic flow through completion. That historical run's force-termination QA restored
one of nine pieces from its local saved-photo file, closed the active timer, and
kept the Home timer unchanged after five seconds; maximum Dynamic Type and iPad
layout were also exercised. The draft workspace currently contains five opaque
1320×2868 iPhone captures and five opaque 2752×2064 iPad captures covering
Home, gallery, setup, Classic progress, and completion. Premium Cuts/paywall
captures are intentionally absent. The build still uses a loopback photo
service and has no production RevenueCat or legal URLs, so it is not the final
screenshot set or submission candidate.

## Future Google Play assets and fields

This draft and the prepared Google Play assets are retained for a later Android
release. They must not block, be uploaded as part of, or be presented as
evidence for the Apple 1.0 release.

Prepared source assets:

- `assets/store/google-play-icon.png` — 512x512 opaque PNG, under 1024 KB.
- `assets/store/google-play-feature.jpg` — 1024x500 JPEG with no alpha.

These files are not proof of upload and are not Apple 1.0 release evidence.
Before a future Android release, review them against the exact AAB and complete
the Play Console app link, Android product identifier and price, Data safety,
content rating, policy declarations, phone/tablet screenshots, and reviewer
instructions.

**Title**

Frume: Quiet Photo Puzzles

**Short description**

Calm photo puzzles with free Classic play and optional lifetime Premium Cuts.

**Full description**

Turn beautiful photographs into a quiet moment of focus.

Frume is a tactile jigsaw puzzle with a calm interface that keeps the picture
at the center. Choose a theme, select any Classic difficulty for free, and
solve at your own pace.

What you can do:

- Play Classic photo puzzles for free
- Choose Nature, City, Animals, Travel, Food, and Ocean themes
- Connect and organize pieces in a scrollable tray
- Open a photo guide when you need it
- Continue your current puzzle after leaving the app
- Restore a previous Premium Cuts purchase

Premium Cuts adds Organic, Living, Living spectrum, Crystal, Crystal quartered,
Amoeba, and Amoeba columnar geometry. All seven are available through one
optional lifetime purchase — never a subscription. Difficulty remains free.

No Frume account is required. Photo attribution is shown in the app for
photographs provided through Unsplash.
