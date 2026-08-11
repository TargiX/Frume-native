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
- Current source candidate: marketing version `1.0.0`, build `2`; build `2`
  still requires an availability check immediately before archive

The live listing still represents the superseded photo-frame product: obsolete
subtitle, description, keywords, and screenshots; primary category Photo &
Video and secondary Lifestyle; automatic release; Support URL
`https://frume.vercel.app/`; Privacy Policy URL
`https://frume.vercel.app/privacy`; `Data Not Collected`; no in-app purchase;
12+/13+ age rating with new social-feature questions pending; and 2022
copyright. This was a read-only audit on 2026-07-31. No App Store Connect change
described in this document has been saved.

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

jigsaw,puzzle,photo,my photos,relaxing,calm,offline,brain,organic,generative

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

1. Home — “A quiet place to solve photographs.”
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

## App Store review notes draft

Frume does not require an account. Classic cuts and all three difficulty
choices are free.

To reach the in-app purchase:

1. Open **Choose a puzzle**.
2. Select any theme.
3. On the setup screen, select **Organic** or **Living**.
4. The **Premium Cuts** sheet opens.

The product is a non-consumable lifetime unlock, not a subscription. Its
RevenueCat entitlement identifier is `premium_cut_styles`. A restore action is
available on the paywall and in **About & Support**.

Loading a new puzzle photo requires network access. An unfinished puzzle is
stored locally and can be resumed. Photo attribution links open outside the
app.

Before submitting these notes, add only verified App Review contact information
and any StoreKit sandbox instructions Apple requires.

## Exact App Store dashboard update

These are pending edits, not saved dashboard state:

- Keep the existing Apple ID, bundle ID, and SKU, but change the editable
  platform version from `1.0` to the exact three-component binary version
  `1.0.0`. Select the planned `1.0.0 (2)` archive only after confirming build
  `2` remains unused in that train; never reuse the old build number `1`.
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
iPhone Classic flow through completion. Current force-termination QA restored
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

Organic cuts add irregular, flowing seams. Living cuts replace the regular
grid with free-form generative cells and variable neighbor patterns. Both are
available through one optional lifetime purchase — never a subscription.
Difficulty remains free.

No Frume account is required. Photo attribution is shown in the app for
photographs provided through Unsplash.
