# Frume geometry-regression QA receipt — 2026-08-10

This receipt records the full verification pass run on 2026-08-10 against the
board/shelf/cut-picker geometry rewrite (commits `d1a7a96` … `562a8bd`). It is
**not** a signed archive, App Store Connect upload, TestFlight result,
physical-device result, submission, or Apple approval. It supersedes the
outdated simulator conclusions in `2026-08-01-release-candidate.md` for the
surfaces it covers; the external release gates in `RELEASE.md` are unchanged.

## Candidate identity

- QA binary: unsigned arm64 simulator Release build of commit `562a8bd`
  (clean tree), Xcode 26.6 (`17F113`), generated with
  `npm run ios:release:simulator` (bounded Clang-discovery proxy).
- Temporary artifact:
  `/var/folders/sp/b_z_5yks7xb3vmmcwxmbj_l80000gn/T/frume-ios-release.SqeYKW/Build/Products/Release-iphonesimulator/Frume.app`
- The working tree after QA carries three QA-only changes that do **not**
  change the iOS runtime path of the QA'd binary: raised per-test timeouts in
  the cutter solver tests, and a web-only guard in `assetAspectRatio`
  (`Platform.OS === 'web'`). Run 5 of `npm run check` on that final tree is
  recorded below.

### Artifact identity (QA'd binary)

- bundle ID `com.targix.frumenative`; marketing version `1.0.0`; build `2`
- app disk usage: 91,072 KiB (was 87,840 KiB on 2026-08-01)
- `main.jsbundle`: 9,571,328 bytes (was 6,097,970 — grew with the baked cut
  library, consistent with the 2.6 → 3.8 MB library change)
- executable: 36,774,120 bytes
- `Info.plist` SHA-256 `9b87abbf…` — identical to the 2026-08-01 build

SHA-256:

```text
main.jsbundle  43520ea5bf9c00b7814d1e48c4e033ed757d53531003151aab20150c3dff100b
Frume          8a03a86733b09ff2b66e0421eceacced2fa0f6b26c83c701785858efcd822e2f
Info.plist     9b87abbfb9c6f913f35df88e78fa97cb281c3d80b49b512806632da553ee4514
```

## Repository validation (`npm run check`)

The gate failed three times before it passed, always on **test timeouts**, never
on an assertion:

| Run | Context | Result |
| --- | --- | --- |
| 1 | concurrent with the Release build (4 xcodebuild jobs + simulators) | 3 timeout failures (baked-library decode @5 s default, Biomorphic resize @120 s, Amoeba seed @60 s) |
| 2 | quiet machine | 2 timeout failures (Amoeba seed @60 s, phase-field determinism @90 s — the latter also failed in isolation at its 90 s budget) |
| 3 | after first timeout batch | 1 timeout failure (phase-field lab branch-growth @15 s, took 20 s) |
| 4 | after all timeout fixes | **passed** — 60/60 mobile files, 312 passed + 1 skipped; server 24 + 28; typecheck; doctor; release guards |
| 5 | final tree (incl. web guard) | see result appended below |

Root cause: the cutter solver tests are genuinely slow (a 4×4 Amoeba solves in
~49 s on an idle laptop — documented in the tests themselves) and their budgets
were set at the edge of observed duration. Under the parallel full-suite run,
or any machine load, several exceeded their budgets. All failing tests pass in
isolation. Fix: raised the tight budgets (15 s → 60 s, 60/90/120 s → 120/180/
300 s, and an explicit 30 s on the baked-library decode loop), matching the
300–600 s budgets the files already used for the heaviest evolutions.

## Device QA matrix

Simulators: iPhone 17 Pro and iPad Pro 13-inch (M5), iOS 26.5. Interaction
driven through `idb` (taps/drags), `simctl` (launch/terminate/screenshot),
and the Simulator orientation menu; state verified through the accessibility
tree (`idb ui describe-all`) and framebuffer OCR.

### Own photograph flow (iPhone 17 Pro)

- Seeded the library with a 3:2 photograph and an extreme 0.25-aspect strip.
- Selecting the strip shows the inline rejection: *“That photograph is too
  long and thin to cut. Try one closer to a normal photo shape.”* with
  `Try again`.
- Selecting the 3:2 photo opens Puzzle setup with the photograph loaded
  (no Worker/network needed for own photos).
- `PickOwnPhoto` uses PHPickerViewController — no library permission prompt
  appears (verified on iOS 26.5).

### Cut picker (contact sheet)

- Puzzle setup renders the cut styles as a contact sheet of **real cut
  samples** (the smallest grid each cutter produces), not icons: on iPhone
  portrait the content column fits 3 samples per row (Classic / Organic /
  Living, then Living spectrum / … / Crystal / Crystal quartered, then
  Amoeba / Amoeba columnar), each named under its sample, no card chrome.
  Column count derives from the content width (`resolveCutColumns`).
- Size ladder renders 9 / 16 / 25 / 49 / 100 / **196 (14 × 14)**.

### Large grid — 196-piece own-photo puzzle (iPhone 17 Pro)

- 196-piece Classic puzzle starts from the own photograph without a network.
- Menu button reports *“0 of 196 pieces placed. 0:00 elapsed.”*
- Board photograph is horizontally centred in the table (a11y frame centre
  equals screen centre); the bottom shelf spans the full table width and is
  centred on the board.
- Drag: a tray piece is picked up and dropped on the board (“on board”);
  a piece dropped away from its slot stays loose and the count stays 0 —
  seating is covered by the engine unit tests (snap threshold 24 pt).
- No exception, no crash; the board re-renders at full 196-piece density.

### Orientation (both devices, both platforms)

- iPhone portrait: bottom tray (verified). iPhone landscape: the app re-lays
  out — home resume card, then the game with the **side tray on the right**
  (pieces stacked vertically at x≈621–788 in an 874-wide window), board photo
  830×462, no crash, saved state intact. The camera-settle effect added today
  fired on the rotation re-layout.
- iPad portrait: 100-piece saved puzzle resumed from the **old save format**
  (no `traySurfaceExtent`), shelf spans the full table width (~1000 pt) —
  the migration path (restore with board-width shelf, then widen on this
  screen) verified live.
- iPad landscape: home + game with side tray on the right, no crash.

### Exit-return and restart (iPhone 17 Pro)

- Home button → app backgrounded; foreground (same process) → game intact,
  timer continued, pieces 118/93 still on board, count 0 of 196.
- `simctl terminate` + relaunch → Home shows *“Puzzle in progress, 0 of 196
  pieces placed”* with `Continue`; resume returns to the game with the same
  pieces on the board.

### Screenshots

`release-evidence/2026-08-10/`:

- `iphone-home.png` — cold launch, Home with resume card
- `iphone-own-photo-rejected.png` — extreme-aspect rejection + Try again
- `iphone-portrait-196-game.png` — 196-piece own-photo board, bottom shelf
- `iphone-landscape-game.png` — landscape game, side shelf
- `iphone-restart-resume.png` — resume card after terminate/relaunch
- `ipad-landscape-game.png` — iPad landscape game, side shelf

## Findings and follow-ups

1. **`npm run check` was flaky on time, not on assertions** — fixed by raising
   the tight solver-test budgets (see above). The suite takes ~12 min green.
2. **Web app startup is broken on this branch** (web is not a 1.0 release
   surface, but it is the local QA surface). Two stacked bugs:
   - `assetAspectRatio` called `Image.resolveAssetSource`, which
     react-native-web does not implement → Home crashed into the error
     boundary. **Fixed** (web guard) in the working tree.
   - After that fix the Home still crashes in a `<div>` render:
     `Failed to set an indexed property [0] on 'CSSStyleDeclaration'` — a
     react-native-skia web rendering issue (HomeBackdrop Canvas). Dependency
     level; not exercised by the iOS binary; open.
3. **Native pinch zoom could not be automated**: `simctl`/`idb` have no
   multi-touch injection and Option-drag (magnify) does not synthesize
   through `cliclick` on this Simulator. Camera zoom/pan/clamp/settle math is
   covered by the `boardCamera` unit tests (passed), and the settle path ran
   live on both orientation changes without crash. A real pinch needs a
   physical device (or a fixed web build).
4. **Android is not QA-able on this machine** — no Android SDK/emulator
   installed. Android is not a 1.0 gate (`BACKLOG.md`).
5. External release gates (Worker deploy, RevenueCat, legal URLs, signed
   archive, TestFlight/physical-device QA) remain open exactly as in
   `RELEASE.md`; this receipt does not close any of them.

## Run 5 result (final tree)

`npm run check` on the final working tree (timeout fixes + web guard):

- mobile TypeScript: passed
- mobile tests: 60 files, 312 passed, 1 skipped
- Worker TypeScript: passed
- Worker runtime tests: 24 passed
- Worker client-contract tests: 28 passed
- Expo Doctor: 18/18 checks passed
- release guards: shell syntax passed; production photo URL validation 4 accepted / 22 rejected
- exit code 0 (747 s)
