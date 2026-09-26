# Cut styles: what ships, what is measured, what is left

Working notes for the phase-field cutter. The point of the file is that the
next person — or the next session — does not re-derive what was already
measured or re-try what was already ruled out.

## The constraint that shapes everything

Cuts are baked offline. The following historical laptop measurements used
earlier profiles/resolutions; they are not phone benchmarks or timings for
the 100/196-piece batch:

| grid | Living | Amoeba |
| --- | --- | --- |
| 3×3 | 7.5 s | 19 s |
| 4×4 | 20 s | 47 s |
| 5×5 | 39 s | 102 s |

So every cut ships baked. That is settled, not a preference.

Storage is not a constraint, which was a surprise. The control points of each
cubic are a fixed function of its neighbours and the tension, so they never
need to be stored: keep the point sequence, rebuild the curve on load. With
16-bit fixed point over the unit board:

| grid | as JSON, gzipped | points only, gzipped |
| --- | --- | --- |
| 3×3 | 53 KB | 4 KB |
| 4×4 | 112 KB | 6 KB |
| 5×5 | 190 KB | 12 KB |

Those earlier storage measurements describe small grids. The actual cost of
a new batch should be measured from its JSON files; compression and decoded
memory are different quantities. Full-resolution large boards take much
longer to simulate than the small-grid timing table suggests.

## What makes two styles actually different

The rule of thumb from watching these side by side: a style earns its place if
the *character of a piece* changes, not the arrangement of pieces. Two cuts
that differ only in where the seeds landed read as the same style with a
different seed, because that is what they are.

Three levers change character, in rough order of how much they change it:

- **Perturbation spectrum.** The interface is unstable between roughly 8 and 16
  samples, peaking near 8 — measured by seeding a single harmonic on a straight
  seam and watching the boundary grow: 1.29× at 4 samples, 3.07× at 8, 2.58× at
  16, 1.11× at 64. Harmonics inside that band grow into teeth; anything outside
  it is erased. Moving `lambda1`/`lambda2` inside or outside the band is the
  loudest change available.
- **Anisotropy.** Tips prefer four or six compass headings instead of growing
  every way equally, with each piece rotated its own way. This is the only
  lever that produces a family the paper does not have.
- **Interface width.** Sets the capillary length, so it decides how fine the
  teeth can be before surface tension damps them. Cheap to move, but it damps
  the whole fringe rather than any particular feature.

Seed layout — blue noise, jittered lattice, exact lattice, cell stretch —
changes the *arrangement*. Worth having, but two styles that differ only here
will likely not read as two styles.

## Shipping now

The installed library contains Living, Living spectrum, Crystal, Crystal
quartered, Amoeba, and Amoeba columnar. `cutStyles.ts` defines their recipes;
`bakedLibrary.generated.ts` defines the assets actually loaded by the product.
The older timing and spectrum measurements above describe those earlier
profiles and resolutions, not the experiments below.

The product direction is to preserve these complex families, particularly
Living's fine fringe, and expand their independent variants and piece counts.
The broad-lobed experimental recipes below are separate research controls;
their acceptance rate is not a reason to replace the existing styles.

Current catalog 2 contains 192 cuts: each of the six styles has eight variants
at 9, 16, and 25 pieces, four at 49, and two independent variants at both 100
and 196. The new 24 cuts use the original 96-sample recipes. Catalog 2 also
selects 20 locally corrected small-grid cuts; 148 old files are shared unchanged.
The original 168-cut catalog remains frozen for historical saved descriptors.

The 26 September installed-library audit checked all 168 cuts and supported
rotations. Validation found no crossing or partition error, including a
ten-times-finer check of nine cuts with very small measured gaps. Thin
regions, acute junctions and area outliers are separate review findings.
The experimental 6% thickness target flagged almost every existing cut; it is
not a calibrated product requirement for these complex styles. The library
baker therefore preserves the original geometry, blocks invalid partitions,
and emits a quality review report. Local correction of extreme defects must
preserve the surrounding fringe and be compared against the original.

## Experimental organic and rounded recipes (2026-09-26)

`cutRecipes.ts` defines `organic-v1` and `rounded-v1` with lengths relative to
one piece. The reference solve uses 48 samples per piece, dx 0.012, and dt
0.00003. Refining the resolution preserves physical piece size and simulated
duration; it does not establish convergence of the raster solver. Both members
of the paired 3x3 experiment at 48 and 96 samples pass the final validator;
that single pair is not convergence evidence.

Both recipes are available as candidate presets in the lab. The lab shows the
growth simulation. The offline study additionally performs bounded local seam
repair, encoding/decoding, and acceptance checks. Its accepted payloads are
separate from the installed product library.

`auditCut.ts` now checks final curve contacts, retracing, ownership, contour and
frame integrity, narrow regions, acute junctions, and area outliers. The gap
test works on adaptive line segments; its error budget is explicit. The area
sum is only a consistency check. `prepareBakedCut.ts` repairs local shared
seams within a displacement budget, then rejects unresolved geometry. The
experimental study enforces those full thresholds. The installed-style bake
uses partition validity and records shape findings for separate visual review.

See the [offline study workflow](../../../../scripts/cuts/README.md) for the
72-case matrix, receipts, previews, acceptance limits and catalog assembly.
The experimental recipes do not change saved-game geometry. The separate
complex-style migration pins `bakedLibraryVersion` in new descriptors and
maps versionless saves to catalog 1. Session schema 4 preserves the version
while reading schemas 1–3. New plays receive random seeds; restore and resize
keep the saved seed and catalog. Future pool changes require another immutable
catalog version. Rotations are orientations of existing cuts, not additional
independent geometries. None of these checks establish physical-device QA.

## Candidates for later

- **Grown outer edge** (`freeRim`). The solver already grows pieces into free
  melt around the board, which is where the reference puzzles get their
  dramatic border. The vectorizer cannot trace a non-rectangular outer contour
  yet and says so rather than pretending. This is the largest visible feature
  still missing.
- **Whimsies.** The paper places recognisable figures as reflective boundary
  conditions. Nothing in the solver forbids it.
- **Seeds as shapes rather than points.** The paper's initialization diffuses
  seed *shapes* — lines, curves — into a generalized Voronoi diagram. Line
  seeds would give banded pieces that no amount of point placement reaches.
- **Per-region parameter sets.** The paper varies parameters across regions of
  one puzzle, so a single board carries more than one cut style. `pieceVariation`
  is the seam-level version of this; the regional version is not built.
- **Eight orientations per baked cut.** Four rotations and a mirror multiply a
  library eightfold for free. Cheap, but it decouples the cut from the picture,
  which may or may not be acceptable — decide after the base styles are settled.

## Ruled out, with the reason

- **Generating on the server per request.** A worker hits its CPU limit on the
  first 5×5. A queue plus durable objects is a lot of machinery for something a
  static file solves.
- **Raising the interface width to remove thin necks.** It works — necks go from
  1.4% of a piece to 5% — but it damps the whole fringe, and the result reads as
  a dead, smoothed cut. Thin necks are removed after the solve instead.
- **Opening each piece to remove thin necks.** Cannot work: erosion splits the
  piece and dilation joins it straight back. Keeping only the largest eroded
  core does break the neck, but hands the severed lobe to a neighbour where it
  hangs by a thread of its own. The same sliver is an isthmus of one piece and a
  finger of the other, so any per-piece pass only moves it. `roundPartition`
  treats the board as one partition, which is why it works.
