# Existing complex cut library: 26 September 2026

## Product direction

Preserve Living, Living Spectrum, Crystal, Crystal Quartered, Amoeba and Amoeba
Columnar, including their intricate edges. The separate Organic/Rounded study
is not a replacement proposal. The work is to find actual geometry defects,
correct them locally, and then add independent variants and larger boards.

## Current catalog 2

The app now selects catalog 2 for new games: **192 geometries** across all six
original styles. Each style has eight variants at 9, 16 and 25 pieces, four
at 49, and **two independent variants at both 100 and 196 pieces**. All profiles
retain their original formulas and 96 samples per piece.

The completed large batch contains 24 accepted cuts. Fourteen retained their
original encoded curves; ten received bounded local corrections. There were
19 affected-piece reports before correction and none afterwards under the 1%
micro-gap policy. Maximum changes in this large batch were:

- Curve movement bound: 0.708% of a cell side.
- Total internal seam length: 0.000684%.
- Any single seam length: 0.310%.
- Any piece's area: 0.077% of the mean piece area.

All 24 independent geometries passed decoded-geometry and rotation checks.
The final app gate checked 96 cutter layouts, engine creation, full session
serialization/loading, and 96 descriptor restores at a different board size.
It checked for exact duplicate/rotated-copy candidates and found none.
This is not physical-device interaction evidence.

`assets/cuts-v2` contains 44 new files: 20 corrected old cuts and 24 larger
cuts, totalling 4,463,724 bytes. Catalog 2 references 7,450,679 bytes of JSON,
sharing 148 unchanged files with catalog 1. The old 168 files remain intact;
all 212 unique payload files occupy 8,075,039 bytes before compression.

New games store `bakedLibraryVersion: 2` and receive a fresh random seed even
for the same photograph. Saved descriptors keep their version and seed.
Versionless historical descriptors select the frozen catalog 1. Session schema
4 retains this identity and reads schemas 1–3, while the library shelf preserves
historical IDs and distinguishes newer catalogs.

Durable manifests and exact recipe settings are in `assets/cut-catalogs/2.json`
and `assets/cuts-v2/manifest.json`. The completed run and review are in
`.context/cut-study/complex-large-v2/`; the interactive comparison of all 192
cuts is `.context/cut-study/complex-gallery/index.html`. Standalone CanvasKit
geometry figures are in `complex-large-v2/review/plots/`. Browser automation
could not open the local HTML because its URL policy forbids `file://`; the
linked files and geometry figures were checked separately.

Verification after integration: 627 app/unit tests passed (one opt-in bake
skipped), with the expensive solver test file excluded from that run; TypeScript
passed. The projector optimization separately passed exact serialized-output
comparisons for all six styles at 3x3 and 100 pieces (12 cases), plus the
existing per-step topology test. Changes are local; no release or device run
was performed.

## Historical catalog 1

Each row has 28 independent baked geometries:

| Style | 9 pieces | 16 pieces | 25 pieces | 49 pieces | 100 pieces | 196 pieces |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Living | 8 | 8 | 8 | 4 | 0 | 0 |
| Living Spectrum | 8 | 8 | 8 | 4 | 0 | 0 |
| Crystal | 8 | 8 | 8 | 4 | 0 | 0 |
| Crystal Quartered | 8 | 8 | 8 | 4 | 0 | 0 |
| Amoeba | 8 | 8 | 8 | 4 | 0 | 0 |
| Amoeba Columnar | 8 | 8 | 8 | 4 | 0 | 0 |

Total: 168 geometries, approximately 3.61 MB of JSON. Four rotations are
available per square-board geometry. They are orientations of existing cuts,
not newly simulated shapes, and hash selection can repeat before every option
has appeared.

`cutStyles.ts` retains the existing formulas. All use 96 samples per piece.
Living and both Crystal profiles share the 16/8-sample perturbation waves,
amplitudes 6/3 and 3,000 growth iterations. Crystal adds preferred six-way
growth (strength 0.3); Quartered uses four-way growth (0.5). Their shared
structure helps explain the family resemblance. The current asset galleries
have different seeds by style, so they are not a controlled same-seed study.

## Audit findings

- All 168 original assets passed partition checks in all four supported
  rotations: 672 checks, with no detected intersection or topology error.
- Nine cuts with especially small measured gaps were also checked with a
  ten-times-smaller curve approximation error in all four rotations. No
  intersection or topology error was detected there either.
- The broad-lobed study's generic 6% width / 20-degree corner criteria passed
  only one of 168 original assets. Applying that as a product-wide gate would
  reject nearly all existing complex styles. It is not a calibrated product
  requirement for the fine fringe.
- The audit still records narrow regions and three acute-corner cases. Some
  gaps are extremely small, especially in Living Spectrum; these deserve
  targeted visual/device review and local correction where needed.
- Numerical partition validity does not establish touch usability, full visual
  quality, or exact symbolic separation of arbitrary curves.

Raw and refined results are in `.context/cut-study/installed-v2/summary.json`
and the per-asset `.audit.json` files. Original-shape galleries are
`gallery-25.html` and `gallery-49.html`. Screenshots of the same originals were
captured under `.context/cut-study/installed-v1/` before refinement.

## Completed local correction review

The subsequent complex-style review used a 1% micro-gap threshold and 0.005%
curve approximation tolerance, retaining acute tips at actual seam junctions.
All 168 cuts passed the corrected-geometry gate and supported rotations:

| Style | Unchanged cuts | Locally corrected candidates |
| --- | ---: | ---: |
| Living | 23 | 5 |
| Living Spectrum | 20 | 8 |
| Crystal | 24 | 4 |
| Crystal Quartered | 26 | 2 |
| Amoeba | 28 | 0 |
| Amoeba Columnar | 27 | 1 |
| Total | 148 | 20 |

The unchanged candidates preserve their original JSON bytes. The 20 corrected
cuts remove tiny spline overshoots or extreme close approaches, with these
maximum measured changes across the entire library:

- Curve movement bound: 0.775% of a cell side.
- Total internal seam length: 0.0041%.
- Any single seam length: 0.177%.
- Any piece's area: 0.054% of the mean piece area.

There were 36 affected-piece reports before correction and none afterwards
under this policy; a shared defect can appear for both neighboring pieces, so
this is not a count of 36 distinct defects. Three intentional pointed-junction
reports remain separately recorded. The Crystal example keeps its pointed
junction exactly while a different seam on the same board is corrected.

Receipts, source snapshots, input/output hashes and accepted candidate files
are in `.context/cut-study/complex-installed-v2/`. Catalog 2 selects the corrected
candidates; original catalog 1 assets and seed mappings remain unchanged.
These geometry checks do not certify
physical-device interaction or every possible visual quality issue.

## Corrections made to the workflow

The installed-style baker now preserves the generated shape, validates the
decoded partition and all supported rotations, and writes `quality-review.json`
for thickness, corners and area findings. The separate experimental repair
workflow retains its stricter thresholds. A regression test uses a real Living
asset to ensure fine fringe is preserved; another ensures broken ownership is
still rejected.

The bake plan accepts selected styles, arbitrary positive grid dimensions,
variant counts and seed offsets. Custom batches require a staging directory
and cannot overwrite the installed import index. See [README.md](README.md)
for commands for 100/196-piece batches. A separate full-resolution trial batch
was started in `.context/cut-study/complex-large-v1/`: all six styles, two
independent seeds at both 100 and 196 pieces. Completed cuts were retained in
`complex-large-v2`; the remaining solves used an exact cached projector.
All six resumed jobs finished successfully. The migration receipt records the
deliberately stopped superseded jobs and retained payload hashes.

The initial inventory work passed 58 targeted tests; the actual bake resume
path rechecked 168 copied assets and left every geometry file byte-identical.
The completed migration now selects catalog 2 through the current import
module while preserving the frozen catalog 1 module and payloads.

## Further expansion

1. Keep the original curves as references. Investigate the few extreme narrow
   locations locally; compare repaired pieces with those references and avoid
   changing a whole profile solely to satisfy a generic thickness target.
2. Review the completed 100/196-piece batch on a physical device, including
   rendered photos, zoom and touch behavior.
3. Further independent seeds can extend all six styles. Record exact profiles
   and numerical settings per batch and use a new immutable catalog version.
4. Keep catalogs 1 and 2 available. Selection still uses modulo pool length;
   a saved library version must continue to resolve its original pool.

The app size ladder already includes 100 and 196. For longer-term context,
the physical World Jigsaw Puzzle Championship 2026 uses 500 pieces for the
individual category and 1,000 for the pairs final; these are physical formats,
not validated phone UX targets ([official rules](https://worldjigsawpuzzlechampionship.com/wjpc/2026/rules)).

The reference direction also includes more than one algorithm: Nervous System's
original dendritic puzzles use multiphase growth, while its tightly interwoven
Maze style uses growing elastic rods. Complexity remains a design objective
([original method](https://n-e-r-v-o-u-s.com/works/puzzles/),
[Geode/Maze](https://n-e-r-v-o-u-s.com/projects/albums/geode-puzzle/)).
