# Frume product roadmap

Written 2026-08-15. This is the **product and go-to-market** plan.

It does not replace the other two documents and does not overlap with them:

- [`RELEASE.md`](./RELEASE.md) — operator runbook for the 1.0 submission.
- [`BACKLOG.md`](./BACKLOG.md) — engineering work and external release gates.
- **This file** — what to build, in what order, and how we decide whether the
  product is working.

The premise of the whole plan: the app is engineered far above the category
average, has zero users, zero distribution, and zero measurement. Every item
below is ordered by expected impact per unit of effort, not by how interesting
it is to build.

---

## Contents

- [Reality baseline](#reality-baseline)
- [Phase 0 — Ship (Aug 15 – Sep 12)](#phase-0--ship-aug-15--sep-12)
  - [1. Ship 1.0](#1-ship-10)
  - [2. Analytics before submission](#2-analytics-before-submission)
  - [3. App Store surface (ASO)](#3-app-store-surface-aso)
- [Phase 1 — Learn (Sep 12 – Oct 17)](#phase-1--learn-sep-12--oct-17)
  - [4. Daily puzzle](#4-daily-puzzle)
  - [6a. Free taste of a premium cut](#6a-free-taste-of-a-premium-cut)
  - [9. Twenty player interviews](#9-twenty-player-interviews)
  - [7. Apple featuring nomination](#7-apple-featuring-nomination)
  - [8. Short-form video](#8-short-form-video)
- [Phase 2 — Grow (Oct 17 – Dec 5)](#phase-2--grow-oct-17--dec-5)
  - [5. Second photo source, cacheable and ownable](#5-second-photo-source-cacheable-and-ownable)
  - [6b/6c. Price test and a second SKU](#6b6c-price-test-and-a-second-sku)
  - [Own photo as the headline](#own-photo-as-the-headline)
- [Phase 3 — Decide (Dec 15)](#phase-3--decide-dec-15)
  - [10. Direction gate](#10-direction-gate)
- [Metrics we watch weekly](#metrics-we-watch-weekly)
- [Explicitly not doing this year](#explicitly-not-doing-this-year)

---

## Reality baseline

These are category base rates, not measurements of Frume. We have no
measurements of Frume — that is what item 2 fixes.

| Scenario | Installs | Conversion | Revenue |
|---|---|---|---|
| Ship as-is, no marketing | 50–200 first month, then decay | 1–3% | $5–40/mo |
| ASO + daily puzzle + video | 10–50/day by month 3–6 | 2–4% | $50–400/mo |
| Apple editorial feature | 10k–100k in a week | 2–5% | $2–20k spike, then decay |

The jigsaw category is dominated by Easybrain and Zimad, who win on user
acquisition budget and daily live-ops content, not on craft. We do not compete
there. Frume's plausible path is the premium/design lane: Apple editorial,
design press, and word of mouth from the own-photo hook.

**The one thing that is genuinely differentiated:** seven deterministic
generative cut algorithms — Organic, Living, Living spectrum, Crystal, Crystal
quartered, Amoeba, Amoeba columnar. No competitor has this. Every marketing
decision below leans on it.

---

## Phase 0 — Ship (Aug 15 – Sep 12)

**Goal: a live 1.0 in the App Store within four weeks, instrumented, with a
store listing built for search.** Nothing else on this roadmap has any value
until this phase closes.

### 1. Ship 1.0

The blocker is not the market, it is that `BACKLOG.md` lists 14 P1 external
gates and some of them are perfectionism rather than submission requirements.
Triage:

**Genuinely blocking — must be done:**

- Deploy the Cloudflare Worker to the real account, install the rotated
  Unsplash Access Key and an independent tracking-token HMAC secret, verify
  `/health`, `/photo`, `/track` under normal, forged, and exhausted-budget
  conditions. Record the active version ID. The app does not function without
  this.
- Publish genuinely public privacy and support pages. Both current URLs
  redirect anonymous visitors to Vercel authentication — Apple rejects on this
  alone. Verify anonymous HTTP 200, no redirect, then install the URLs in the
  production Expo environment and in App Store Connect.
- Create the iOS non-consumable Premium Cuts product, wire it to RevenueCat
  entitlement `premium_cut_styles` and a package in the current offering,
  compile the exact reviewed product identifier into the release environment.
- Archive build `3` (never `1`, never the invalid `2`) from a clean reviewed
  revision with the production `appl_` RevenueCat key, pass the archived-bundle
  scan, then run the iPhone/iPad/physical-device/TestFlight QA matrix.
- Complete App Privacy, age rating, export compliance, iPhone and iPad
  screenshots from the exact candidate, reviewer notes.
- Disable Apple Silicon Mac and Apple Vision Pro availability. Thirty seconds
  of dashboard work; shipping to platforms with no QA coverage invites a
  rejection.
- Set primary category **Games**, subcategory **Puzzle**. Remove the stale
  Photo & Video / Lifestyle categories.

**Cut from 1.0 — deliberately deferred:**

- **Digital Services Act / EU distribution.** The DSA trader status is
  Rejected. Do not fix it now. **Launch in US, UK, Canada, Australia, and New
  Zealand only.** Same language, no localization cost, and it removes the
  single slowest gate from the critical path. Add the EU in 1.1 once the trader
  declaration is resolved. Note that the EU is now gated on a second thing as
  well: analytics ships on by default with an opt-out, which is defensible
  outside the EU but must become opt-in, or gain a consent step, before an EU
  storefront opens. That switch lives in
  `src/analytics/analyticsPreference.ts`.
- **Remote crash service and symbolication.** Explicitly accept Apple Organizer
  reports plus the in-app redacted diagnostic export as the 1.0 contract, and
  write that acceptance down in `RELEASE.md`. A remote crash pipeline is a
  scale problem, and we have no scale.
- **Everything in "Puzzle feel and depth" and "Cut styles after 1.0."**
  Connected cluster dragging, connection sound, ghost guide, Fractal. None of
  these are why the app will or will not sell.

**Week plan:**

| Week | Dates | Work |
|---|---|---|
| 1 | Aug 15–22 | Worker deploy + secrets + health verification. Public privacy/support pages. Item 2 (analytics). Item 3 (ASO copy). |
| 2 | Aug 22–29 | RevenueCat product + App Store Connect IAP. Build 3 archive. Upload to TestFlight. |
| 3 | Aug 29 – Sep 5 | Device QA matrix. Screenshots from the real candidate with the real localized price. App Privacy, age rating, metadata. |
| 4 | Sep 5–12 | Submit. Reserved as buffer for exactly one rejection round. |

**Done when:** the app is live in the App Store in five English-language
storefronts.

**Note on the Unsplash quota.** The 1000 requests/hour ceiling is shared across
all players and `download_location` must fire on every real use, so the hard
ceiling is roughly 1000 started games/hour — about 24,000/day. At any plausible
launch volume this is not a constraint. It becomes a constraint only if we
succeed, which is why the fix is item 5 in Phase 2 and not a launch blocker.

### 2. Analytics before submission

**Why:** the only telemetry today is RevenueCat, which answers "did they pay"
and nothing about where players fall out. Dependencies list confirms no
analytics SDK. Without a funnel, items 4–10 are guesses.

**Vendor:** PostHog, over its documented HTTP capture endpoint rather
than the React Native SDK. The SDK would add a native dependency to a tree that
the release archive scan and `npm run security:dependencies` both gate, and it
autocaptures screens, lifecycle, and device context that would then have to be
switched off one property at a time. A hand-written client keeps the entire
outbound payload readable in one file, which is what the App Privacy answer
asserts. No person profiles, no advertising identifier, no address, no photo
metadata.

**Region: US** (`https://us.i.posthog.com`), project `Frume` in the `Dreamseed`
organization. An earlier draft of this file recommended EU cloud on the reasoning
that the connected tooling already pointed there; that was simply wrong — the
connected account is US-only, and the project was created in it. The two regions
are separate deployments, and a host that disagrees with the project's region
fails silently, so `RELEASE.md` now treats matching them as a release step.

**Status: built and verified end to end.** `src/analytics/` holds the contract,
transport, durable queue, opt-out preference, anonymous identifier, and
lifecycle driver. Delivery was confirmed by querying the project directly:
check events are stored with `$geoip_disable` true and
`$process_person_profile` false, and the `persons` table stays empty, which is
the evidence behind the "not linked to identity" App Privacy answer. See
`README.md` for the module boundary and `STORE_METADATA.md` for that answer.

**Event schema — exactly these eight, no more.** A schema that grows without a
question behind each event becomes noise.

| Event | Properties | Fired from |
|---|---|---|
| `app_opened` | `cold_start` | `App.tsx` |
| `photo_source_chosen` | `source` (`theme`\|`own_photo`), `theme_id` | `src/features/play/screens/GalleryScreen.tsx` |
| `puzzle_started` | `cut_id`, `piece_count`, `source` | `src/puzzle/context/PuzzleSessionContext.tsx` |
| `puzzle_completed` | `cut_id`, `piece_count`, `duration_s` | `src/features/play/screens/GameScreen.tsx` |
| `puzzle_abandoned` | `cut_id`, `piece_count`, `progress_pct` | session replace/restart path |
| `paywall_shown` | `trigger_cut_id` | `src/features/play/components/PremiumCutsSheet.tsx` |
| `purchase_completed` | `product_id` | `src/premium/PremiumAccessContext.tsx` |
| `restore_completed` | — | `src/premium/PremiumAccessContext.tsx` |

`puzzle_started` fires from `DifficultyScreen` on a confirmed start rather than
from inside the session hook, and `puzzle_completed` / `puzzle_abandoned` fire
from `GameScreen`. Instrumenting at the screen layer leaves the puzzle engine —
the most heavily tested and audited part of the app — untouched.

**Implementation shape:** one module, `src/analytics/`, exposing a narrow
`track(event, props)` and a no-op implementation used in tests and when the
player opts out. Screens must not import the PostHog SDK directly — a single
seam keeps the vendor swappable and keeps the privacy surface auditable in one
file.

**Privacy consequences, which are not optional:**

- Add an **Analytics** toggle to `AboutSupportScreen.tsx`, default on, opt-out
  respected before the first event fires.
- `STORE_METADATA.md` currently declares only Purchase History. It must gain
  **Product Interaction / Usage Data → App Functionality and Analytics, not
  linked to identity, not used for tracking.**
- Do this in week 1, before metadata and screenshots freeze. Changing the
  privacy declaration after submission means resubmitting.

**Effort:** one day of code, half a day of dashboard setup.

**Done when:** a funnel in PostHog shows install → started → completed →
paywall → purchase, and TestFlight traffic populates it.

### 3. App Store surface (ASO)

**Why:** the icon, the first screenshot, the title, and the keyword field
determine roughly 90% of installs from search. This outranks every remaining
line of code.

**Name (30 chars).** `Frume` is a meaningless token for search and wastes the
most heavily weighted field in the index.

```
Frume: Photo Jigsaw Puzzle          (26 chars)
```

**Subtitle (30 chars).** The current draft, "Quiet photo puzzles," spends
searchable characters on a word nobody searches.

```
Make puzzles from your photos       (29 chars)
```

**Keywords (100 chars).** Words already in the name and subtitle are indexed
and must not be repeated here.

```
jigsaw,picture,relax,calm,brain,zen,mosaic,art,offline,tiles,game,family,daily,image,piece
```

**Icon.** Current icon is abstract. Category winners show a recognizable puzzle
piece plus a fragment of a photograph, readable at 60×60. Produce two
candidates and pick with fresh eyes, not with the eyes that designed it.

**Screenshot 1** must communicate "your photo becomes a puzzle" in under one
second, with a text overlay. The sequence in `STORE_METADATA.md` currently
opens with a Home screenshot and the caption "A quieter kind of puzzle" — that
sells a mood to someone who has not yet decided to care. Reorder:

1. Your photograph → a puzzle. **Any photo becomes a puzzle**
2. Organic game, visibly irregular seams. **Cuts no other puzzle has**
3. Classic game partly complete. **Every size free, 9 to 196 pieces**
4. Theme gallery. **Or start from a curated photograph**
5. Completion. **One picture, piece by piece**
6. Premium Cuts. **Unlock the shaped cuts forever**

**Effort:** one day of copy, one to two days of icon and screenshot work.

**Done when:** `STORE_METADATA.md` is updated and the App Store Connect listing
matches it.

---

## Phase 1 — Learn (Sep 12 – Oct 17)

**Goal: find out whether anyone comes back on day two, and give them a reason
to.** Five weeks, one shipped update (1.1), and the first real conversations
with players.

### 4. Daily puzzle

**Why:** every surviving puzzle app has one, and Frume currently has no reason
to be opened tomorrow. This is the highest-leverage retention mechanic in the
category and it is cheap.

**Design:**

- New `/daily` route in `server/src/index.ts`, alongside `/photo` and `/track`.
- Deterministic by UTC date against a **pinned curated list** of roughly 365
  pre-selected photo IDs — not a live search. One photo per day, identical for
  every player, edge-cacheable.
- No account. Streak is a local counter in AsyncStorage. Losing a streak on
  device reset is acceptable and is not worth an account system.
- Client: a "Today's puzzle" card at the top of
  `src/features/play/screens/PlayHomeScreen.tsx`, above the existing primary
  action.
- Fires `daily_puzzle_opened`; add it to the schema in item 2 when it lands.

**Quota note:** the daily puzzle collapses the *photo fetch* to roughly one
upstream request per day for the entire player base, but while the source is
Unsplash each play still fires its own `download_location` tracking call. The
real ceiling fix is item 5.

**Effort:** three to four days including curation of the photo list.

**Done when:** shipped in 1.1, and `daily_puzzle_opened` shows repeat players
across consecutive days.

### 6a. Free taste of a premium cut

**Why:** the paywall currently asks players to buy an aesthetic they have only
read about. Description does not sell texture. Letting them feel it once
converts better than describing it seven times.

**Design:** each premium cut may be played **once, ever**, at any size, before
it locks. Not a timer, not a daily allowance — a one-time demo per cut,
persisted locally. Seven cuts means up to seven demo games, which is generous
enough to be felt and bounded enough to still need the purchase.

Implementation touches `src/premium/PremiumAccessContext.tsx` and
`src/features/play/components/PremiumCutsSheet.tsx`; the gate stays keyed on
cutter id, per the existing monetization contract.

**Effort:** one to two days.

**Done when:** shipped in 1.1, and the `paywall_shown → purchase_completed`
rate is measurable before and after.

### 9. Twenty player interviews

**Why:** the app is built to its author's taste — quiet, minimal, restrained.
The mass jigsaw audience skews 45+, and wants many pretty pictures, large
grids, collections, and visible progress. Both are legitimate strategies, but
picking one on purpose beats landing on one by accident. Twenty conversations
cost less than one more month of code.

**Where:** r/Jigsawpuzzles, Facebook jigsaw groups, and the recent one- and
two-star reviews of the top three competitors — negative reviews are the
cheapest source of unmet demand in the category.

**The six questions:**

1. What puzzle app do you play now, and what made you install it?
2. When did you last pay inside a puzzle app, and what for?
3. What annoys you most about the app you use?
4. How do you decide which picture to solve?
5. Have you ever made a puzzle out of your own photograph? What happened?
6. What would make you delete a puzzle app in the first five minutes?

**Effort:** two to three hours a week for four weeks.

**Done when:** twenty conversations are written up and there is a one-page
answer to "who is this for."

### 7. Apple featuring nomination

**Why:** free distribution, and the only realistic path to a five-figure
outcome. Semi-controllable rather than pure luck — there is a submission form.

**When:** two to three weeks after launch, once there are real ratings and no
crash spikes. Not before.

**How:** App Store Connect → App Store → Featuring Nominations. The pitch
should lead with the generative cutting algorithms, because that is the part
that is genuinely new and the part an editor can show in a screenshot. Supply
the iPad build prominently — Apple's editorial team over-weights iPad quality —
and lead the supporting notes with no ads, no account, no tracking, full
accessibility, which is exactly the profile of the "Apps We Love" and wind-down
collections.

Also note for the calendar: Apple Design Award submissions open in spring 2027.
Frume's craft level is in range; put a reminder in March.

**Effort:** two hours.

### 8. Short-form video

**Why:** pieces separating along a Crystal or Amoeba seam and snapping into
place is ready-made "oddly satisfying" material. It is the one channel where a
solo developer beats a funded competitor with a zero budget, because the asset
is the product itself.

**Format:** 9:16, five to fifteen seconds, no voice-over, no text for the first
two seconds. One cut style per clip. Close on the snap.

**Cadence:** three per week for eight weeks — twenty-four posts. Expect twenty
to do nothing. This is a volume game with a fat tail, and it does not work at
low volume.

**Channels:** TikTok, Reels, YouTube Shorts. Plus r/oddlysatisfying and
r/Jigsawpuzzles, respecting each subreddit's self-promotion rules.

**Effort:** two to three hours a week, ongoing from launch.

---

## Phase 2 — Grow (Oct 17 – Dec 5)

**Goal: remove the ceiling on both traffic and revenue.** Everything here is
driven by what Phase 1 measures — if the funnel says players never reach the
paywall, item 6 changes shape.

### 5. Second photo source, cacheable and ownable

**Why:** three problems, one fix.

1. **Quota ceiling.** 1000 requests/hour shared across all players means
   success equals outage.
2. **Offline breakage.** Curated photographs are hotlinked, so a saved puzzle
   needs the network on relaunch. That is a retention bug, not a footnote.
3. **Revenue ceiling.** Unsplash terms forbid reselling the photographs, so
   photo content can never be a product while Unsplash is the only source.

**Sources.** Public-domain museum collections, all CC0 or equivalent, all
cacheable, all sellable:

- Art Institute of Chicago — open API, no key, IIIF imagery.
- The Metropolitan Museum of Art Open Access.
- Rijksmuseum — free key required.
- Smithsonian Open Access.

Aesthetically these beat generic stock for puzzles: high detail, strong colour
blocks, recognizable subjects. That is also literally what physical puzzle
manufacturers license.

**Work:**

- Introduce a `PhotoProvider` abstraction in `server/src/index.ts` and move the
  existing `CATEGORIES` Unsplash path behind it.
- Add one museum provider, with local caching enabled because the licence
  permits it.
- Rename `src/services/unsplash/` to `src/services/photos/` on the client and
  keep provider attribution generic — Unsplash attribution stays mandatory,
  museum attribution becomes a courtesy line.

**Effort:** two to three weeks.

**Done when:** a puzzle from a museum collection resumes with the network off.

### 6b/6c. Price test and a second SKU

**6b — price.** Category one-time unlocks sit between $3.99 and $9.99. Launch
at **$6.99**. After 500 `paywall_shown` events, test $4.99 and $9.99 by
storefront and keep whichever produces more revenue per paywall view, not
higher conversion.

**6c — a second SKU.** Cut styles are a one-time novelty: once a player has
seen Crystal, the buying impulse is spent. Photograph collections are
consumable, which is why the whole category monetizes content rather than
mechanics. Item 5 makes this legal and possible: curated museum collections —
Impressionists, Japanese woodblock, botanical illustration, maps — as
individually priced packs, or a bundle.

This does not violate the standing monetization contract. Difficulty stays free
at every grid size. We are selling curation and licensed content, not comfort.

**Effort:** one week after item 5 lands.

### Own photo as the headline

**Why:** "make a puzzle out of our photograph" is the emotionally strongest
thing the app does, the only mechanic that produces word of mouth and gifting,
and the place where big competitors are weakest. Today it is buried — the home
screen's primary action goes to the theme gallery, and the library import sits
inside `GalleryScreen.tsx` as a secondary affordance.

**Change:** promote own-photo import to a first-class action on
`PlayHomeScreen.tsx`, peer to the curated path rather than nested under it.
This is a layout change, not new capability — the import, downsampling, backup
exclusion, and ownership logic already exist and are audited.

**Then measure:** `photo_source_chosen` splits by source. If own-photo share
rises materially and those sessions complete more often, that is the signal to
reposition the entire store listing around it.

**Effort:** one day.

---

## Phase 3 — Decide (Dec 15)

### 10. Direction gate

Ninety days after launch, read the numbers and pick a lane. Deciding on a
scheduled date rather than on a feeling is the entire point of this section.

| Signal | Green — double down | Yellow — iterate | Red — change direction |
|---|---|---|---|
| Organic installs | >1000/mo | 300–1000/mo | <300/mo |
| D1 retention | >25% | 15–25% | <15% |
| Paywall conversion | >2% | 1–2% | <1% |
| Revenue | >$300/mo | $50–300/mo | <$50/mo |

**Green:** keep going. Add localization, the EU storefront, Android, and the
remaining cut styles in `BACKLOG.md`.

**Yellow:** the product works and distribution does not. Spend the next quarter
entirely on channels — paid UA test with a small budget, more video volume, a
second featuring nomination, press outreach.

**Red:** the asset is not the puzzle app. It is the cutter library. Three
options, most to least realistic:

1. **Physical print-on-demand puzzles.** The cutter already produces a die-line
    — the exact contour a puzzle press cuts. "Upload your photograph, choose a
   cut, receive a real puzzle" sells for $30–60 against a $6.99 IAP, roughly a
   tenfold LTV improvement, with printing and fulfilment outsourced. The app
   becomes the storefront rather than the product. This is a different business
   and the most lucrative available. First step: one manufacturer quote and one
   test order of a custom-cut puzzle from an existing die-line.
2. **Gifting.** "A puzzle of us" as a shareable link. Lighter than option 1 and
   tests the same emotional hypothesis. First step: measure whether own-photo
   sessions already dominate after the Phase 2 change.
3. **License the cutter.** Ship the cut library as a standalone package for
   other developers and for the web. Little revenue, little work, some brand
   distribution. A side effect, not a plan.

**Not an option:** competing head-on in mass-casual jigsaw against Easybrain
and Zimad. That contest is decided by user-acquisition budget.

---

## Metrics we watch weekly

Six numbers, reviewed every Monday from launch. If a number cannot be produced,
the instrumentation is wrong and that is the week's first fix.

1. Installs (App Store Connect)
2. D1 and D7 retention (PostHog)
3. First-session completion rate — `puzzle_started` → `puzzle_completed`
4. Paywall view rate — share of players who ever see `paywall_shown`
5. Conversion — `paywall_shown` → `purchase_completed`
6. Revenue, net of Apple's cut

---

## Explicitly not doing this year

Each of these is real work that would improve the app, and each is worth less
than every numbered item above. They are listed so that they stop competing for
attention.

- Android and Google Play.
- The Fractal cutter, and the Infinity / Wave / Impact styles.
- Connected cluster dragging, connection sound, ghost-photo guide.
- Localization, until the English listing has proven it converts.
- A remote crash service.
- Accounts, cloud sync, leaderboards, social features.
- Any new cut style before the existing seven have demonstrated they sell.
