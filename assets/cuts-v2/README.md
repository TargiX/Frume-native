# Reviewed complex cuts

This export retains 24 independently generated large cuts and 20 locally corrected existing cuts. All six original styles keep their profiles and 96 samples per piece.

The JSON payloads passed decoded-geometry and rotation checks. The large batch also passed 96 app-cutter layouts and 96 descriptor restores at a different board size. Physical-device interaction remains separate.

An immutable catalog under `assets/cut-catalogs` selects these payloads for new games. Saved descriptors pin their catalog; versionless historical descriptors retain catalog 1. The original 168 geometries remain available in `assets/cuts`.

See `manifest.json` for input/output hashes, local shape changes and verification fingerprints. See `scripts/cuts/README.md` for the generation and review workflow. Variant indices in filenames start at zero; the visual reviewer numbers them from one.
