# Cut styles: what ships, what is measured, what is left

Working notes for the phase-field cutter. The point of the file is that the
next person — or the next session — does not re-derive what was already
measured or re-try what was already ruled out.

## The constraint that shapes everything

A cut cannot be generated on the device. Measured on a laptop, so a phone is
three to ten times slower again:

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

One style across three grids with 24 seeds is about 530 KB. Six styles fit in
roughly 3 MB, which is a bundle, not a download. Bake time is the only real
budget: a few hundred cuts at about a minute each, parallel across cores, is
an hour of offline work.

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

Nothing is committed to yet; the candidate set is being looked at. Written here
so the decision, once made, has somewhere to live.

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
