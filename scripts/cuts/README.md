# Reproducible cut studies

This is an offline benchmark, review, and catalog assembly workflow. It does
not start a server or run as part of the normal test suite. Generation and
review write staging files; the explicit assembly step selects a new catalog.

## Existing styles: primary product work

Living, Living Spectrum, Crystal, Crystal Quartered, Amoeba and Amoeba Columnar
are already installed. Preserve their profiles and fine detail. The Organic
and Rounded experiments later in this document do not replace those families.
The [installed-library audit](INSTALLED-LIBRARY-2026-09-26.md) records inventory,
findings and the expansion order.

Audit the exact installed library, including all supported rotations:

```sh
FRUME_CUT_LIBRARY_AUDIT_OUT=.context/cut-study/installed-review \
  fnm exec --using=24.16.0 node node_modules/vitest/vitest.mjs run \
  --config scripts/cuts/vitest.config.mjs scripts/cuts/auditLibrary.test.ts
```

The report separates invalid partitions from thin regions, acute corners and
area variation. Very small measured gaps trigger a ten-times-finer contact
check. Gallery files show original installed geometry with isolated pieces;
click a tile to see marked narrow locations. No repair is applied.

After reviewing the profiles, an explicit staging batch can generate every
existing style at 100 and 196 pieces:

```sh
FRUME_BAKE=1 \
FRUME_BAKE_OUT=.context/cut-study/large-existing-styles \
FRUME_BAKE_GRIDS='[[10,10,2],[14,14,2]]' \
  fnm exec --using=24.16.0 node node_modules/vitest/vitest.mjs run \
  src/puzzle/cutters/biomorphic/bakeCutLibrary.test.ts \
  -t 'writes every style, grid and seed' --maxWorkers=1
```

Each tuple is `[rows, columns, numberOfIndependentVariants]`. The example is
24 potentially expensive full-resolution solves; it is not part of normal
tests. `FRUME_BAKE_STYLES=living-fringe` selects a bounded first batch.
`FRUME_BAKE_SEED_OFFSET=8` starts at new variant indices, useful for enlarging
existing small-grid pools. Generation keeps each style's profile and 96 samples
per piece. Do not substitute the experiments' cheaper 48-sample recipes.

All bakes write staging files (default `.context/cut-bake`); `assets/cuts` is
the immutable historical catalog and is refused as an output. Custom plans
also require staging. The baker never rewrites the installed module.
The baker checks decoded partitions and all supported rotations, preserving
the shape. `quality-review.json` records thin regions, acute corners and area
outliers for review, including on resume. These findings are not silently
smoothed to meet the experimental broad-lobed threshold. An invalid partition
still blocks writing that asset.

Selection depends on pool length. Saved descriptors therefore pin an immutable
`bakedLibraryVersion`; historical descriptors without that field use catalog 1.
Never append to or replace payloads in a historical catalog.

### Local correction of complex styles

Review either the historical catalog 1 assets or a staging batch without
replacing them:

```sh
FRUME_COMPLEX_REVIEW_FROM=assets/cuts \
FRUME_COMPLEX_REVIEW_TO=.context/cut-study/complex-review \
  fnm exec --using=24.16.0 node node_modules/vitest/vitest.mjs run \
  --config scripts/cuts/vitest.config.mjs scripts/cuts/reviewComplexLibrary.test.ts
```

`prepareComplexCut` targets extreme gaps below 1% of a cell with a 0.005% curve
flattening tolerance. A narrow pointed wedge at a real shared endpoint is
reported separately; crossing checks still apply there. This preserves the
intentional pointed Crystal junctions. Real necks on the same piece remain
eligible for correction.

The existing spline tension, shared edges, endpoint positions and frame are
retained. At most 64 local passes may move knots by 1.5% of a cell. Independent
checks limit curve movement to 2%, total seam-length change to 0.5%, any single
seam-length change to 5%, and piece-area change to 1.5% of the mean piece area.
Codec quantization allowance is included in movement bounds. A rejected cut
has no accepted payload. These are conservative geometry and shape-retention
limits, not a calibrated minimum finger width or a device usability claim.

The output includes immutable source snapshots and input/output hashes,
`*.receipt.json`, `accepted/`, before/after sheets, 330 px photo previews,
isolated pieces, and `gallery-{pieceCount}-{variant}.html`. The source files
must remain unchanged during a review. A rerun resumes only matching receipts
and output hashes; a changed implementation requires a new output directory.
The report distinguishes accepted and rejected geometry from test completion.

After a planned batch is complete, exercise every variant and supported
rotation through the six app cutters, create an engine, serialize and read the
full session, then restore the saved descriptor at a different board size:

```sh
FRUME_COMPLEX_BUNDLE_REVIEW=.context/cut-study/large-run/review \
FRUME_COMPLEX_BUNDLE_PLAN=.context/cut-study/large-run/manifest.json \
  fnm exec --using=24.16.0 node node_modules/vitest/vitest.mjs run \
  --config scripts/cuts/vitest.config.mjs scripts/cuts/verifyComplexBundle.test.ts
```

The plan contains `styles` and `grids` (the same three-element grid tuples as
the baker). This gate fails if a requested candidate is missing or rejected,
if payload hashes changed, or if variants are duplicates/rotated copies. A
successful run writes `game-verification.json`; it does not install assets.

Build an interactive, offline review from the old- and large-grid reports:

```sh
fnm exec --using=24.16.0 node scripts/cuts/makeComplexGallery.mjs \
  .context/cut-study/complex-installed-review \
  .context/cut-study/large-run/review \
  .context/cut-study/complex-gallery
```

Open `complex-gallery/index.html` to switch styles, sizes and independent
variants. `phone-preview.html` keeps every photo board at 330 CSS pixels.

Standalone PNG figures use the installed CanvasKit software renderer. They
plot decoded shared curves and isolated pieces directly, without a browser:

```sh
FRUME_COMPLEX_PLOT_REVIEW=.context/cut-study/large-run/review \
  fnm exec --using=24.16.0 node node_modules/vitest/vitest.mjs run \
  --config scripts/cuts/vitest.config.mjs scripts/cuts/renderComplexPlots.test.ts
```

The figures go in `review/plots/`. They are geometry illustrations, not native
screenshots or physical-device evidence. Partial batches only produce figures
for sizes/variants that already contain all six styles.

### Assemble an immutable app catalog

After the complete planned batch passes the app-cutter and persistence gate:

```sh
fnm exec --using=24.16.0 node scripts/cuts/exportComplexCandidates.mjs \
  .context/cut-study/complex-installed-review \
  .context/cut-study/large-run/review \
  assets/cuts-v2
fnm exec --using=24.16.0 node scripts/cuts/assembleCutCatalog.mjs 2 1 assets/cuts-v2
```

The exporter verifies input/output hashes and retains only corrected existing
payloads plus the new batch. Unchanged old cuts are shared with catalog 1.
The assembler checks corrections against the base catalog, requires contiguous
variant indices, freezes a complete `assets/cut-catalogs/2.json` manifest and
`bakedLibrary.v2.ts`, and selects version 2 in `bakedLibrary.generated.ts`.
All historical versions remain registered. Repeating assembly accepts only
identical frozen files; further changes require a new version and directory.

The app pins the current catalog when creating a game, while restore and
resize use the saved version. A new play gets a random seed even for the same
photograph; saved seeds remain deterministic. Random hash selection can repeat
an existing geometry. Four rotations do not count as four independent cuts.

Session schema 4 preserves catalog identity; schemas 1–3 remain readable.
Schema 3's guide mode and the earlier timer migration retain their original
semantics. Older app versions reject schema 4 instead of dropping its catalog
field. Library shelf IDs also distinguish newer catalogs without changing
historical IDs. The size picker reads the current catalog automatically.

## Separate broad-lobed experiments

Use the project's pinned Node version:

```sh
FRUME_CUT_STUDY_OUT=.context/cut-study/my-run \
  fnm exec --using=24.16.0 node node_modules/vitest/vitest.mjs run \
  --config scripts/cuts/vitest.config.mjs
node scripts/cuts/summarize.mjs .context/cut-study/my-run
```

The default set contains 72 attempts: Organic and Rounded, each on the same
12 seeds at 25, 49, and 100 pieces. A benchmark test completing means its
receipt was written. Acceptance is the receipt's `status`, not Vitest's pass
count. Failed generation and rejected final geometry are both recorded.

For a bounded selection or a resolution comparison, set
`FRUME_CUT_STUDY_CASES` to a JSON array:

```json
[
  {"recipe":"organic-v1","grid":3,"seed":"refinement-00","samplesPerPiece":48},
  {"recipe":"organic-v1","grid":3,"seed":"refinement-00","samplesPerPiece":96}
]
```

Cases require explicit seeds. Variant names never implicitly change the seed.
Recipes convert piece-relative wavelengths and amplitudes into samples while
preserving physical piece size, interface width, and simulated duration as
resolution changes. This removes parameter-unit confounding; it is not proof
that the raster simulation has converged. Initialization, finite stencils,
projection cadence, and geometric simplification still affect that comparison.

Each receipt records the full settings, source fingerprint (including local
uncommitted source), Git revision, Node version, extraction attempts, before
and after audits, repairs, and elapsed time. Keep source files unchanged while
a run is in progress. An existing receipt is reused only when settings and
source match; accepted payloads are revalidated before reuse. Use another
output directory after implementation changes.

`*.before.json` files are diagnostic inputs, including invalid candidates.
Only `accepted/*.json` passed the gate. A rejection has no payload in that
directory. All saved SVGs clearly identify accepted versus rejected output.
`report.html` includes every attempt and groups custom resolutions separately.
`comparison.html` selects an accepted 25-piece pair with the same seed and
resolution, when one exists. `phone-preview.html` shows matched pairs at a
fixed 330 CSS pixels per board. They are static local files and require no
server. The larger before/after review sheets scale to the browser width.

The first 72-case study is documented in [RESULTS-2026-09-26.md](RESULTS-2026-09-26.md).

## Acceptance and repair

The gate inspects the actual decoded baked geometry and each supported quarter
turn. It checks shared-edge ownership and direction, closed simple contours,
positive piece area, complete rectangular frame, intersections, retracing,
narrow regions, area outliers, and acute junction angles. Curve flattening has
an explicit control-hull error bound; narrow-gap acceptance adds twice that
bound. This is numerical validation at the stated tolerance, not an exact
symbolic certificate for arbitrary Bezier curves.

Defaults are a 6% minimum gap, a flattening error of 0.05% of the smaller cell
side, and a 20-degree minimum junction angle. The pinch list reports the
narrowest detected location per affected piece, distinguishing an interior
neck from an exterior gap. Area sum is a consistency check alongside the
partition checks, not a polygon-union metric. Preview the intended board size
and aspect ratio before selecting a product threshold.

Local repairs move the shared seam for both neighboring pieces. They preserve
edge endpoints, ownership, and the outer frame. Every proposal is encoded,
decoded, and audited; it is kept only if its defect score improves without
adding topology errors, crossings, or area outliers. Knot displacement is
bounded to 6% of a cell, plus the documented codec quantization allowance.
After at most 24 passes, unresolved candidates are rejected. Angular or area
defects need not be repairable by this local step.

These full thresholds apply to the experimental Organic/Rounded study.
The existing-style `FRUME_BAKE` job uses the partition gate described above and
preserves fine detail for visual review. Work in staging before selecting any
product-library changes.

Phone-size photo previews use the repository's existing nature image. They
exercise the reconstructed curves and game piece conversion; they do not
replace Skia, physical-device interaction, or release validation.

## Recheck saved simulations after changing the validator

```sh
FRUME_CUT_REVALIDATE_FROM=.context/cut-study/my-run \
FRUME_CUT_REVALIDATE_TO=.context/cut-study/my-recheck \
  fnm exec --using=24.16.0 node node_modules/vitest/vitest.mjs run \
  --config scripts/cuts/vitest.config.mjs scripts/cuts/revalidate.test.ts
node scripts/cuts/summarize.mjs .context/cut-study/my-recheck
```

This reuses the recorded input geometry without rerunning growth. New receipts
retain the original simulation fingerprint and receipt path, hash the input
geometry, and identify the current validation source separately. Generation
time comes from the original run; validation time is measured again. The
summary's total seconds sum those two stages, which can run under different
machine loads. Use a fresh target directory; revalidation never overwrites the
source study or existing target receipts.
