# Quality gates

## Product-scope gate

- The change compiles explicit Penpot semantics and does not invent absent meaning.
- Output is classified as reusable design-system code, design composition, prototype metadata, or manifest/integration metadata.
- Developer-owned architecture, business logic, state, routing, localization, and accessibility policy remain outside generated output.
- No geometry, text, naming coincidence, or repeated literal is treated as semantic authority unless the contract explicitly defines that metadata convention.

## Penpot boundary gate

- Manifest permissions are valid and minimal.
- Read-only conversion does not mutate the Penpot document or connect libraries.
- Live `penpot` access stays inside the plugin execution boundary.
- UI/plugin messages are typed and JSON-serializable.
- No Penpot class instance, function, DOM node, or circular object crosses the boundary.
- Empty selection and selection changes are handled safely.

## Source snapshot and IR gate

- The same source produces deterministic serializable data.
- Stable node, component, variant, library, token, asset, and prototype IDs are preserved where available.
- Child order and z-order are preserved.
- Explicit Flex/Grid/absolute layout, sizing, constraints, padding, gaps, and alignment are represented.
- Token references remain distinct from resolved literals.
- Unsupported data produces source-associated diagnostics.
- No application semantics are added to the IR.

## Registry gate

- Canonical components generate once; instances retain canonical identity.
- Variant membership and selection come from explicit Penpot variant data.
- Sparse or divergent variants do not expose invalid invented combinations.
- Shared libraries are keyed by stable ID and emitted once per reachable library.
- Token/set/theme identity, ordering, aliases, dependencies, and library ownership are deterministic.
- Asset paths and hashes are stable and collisions are diagnosed.

## Layout gate

- Explicit horizontal/vertical Flex maps to Flutter Flex widgets.
- Supported explicit Grid maps structurally.
- Explicit absolute layout and unsupported Grid fallbacks preserve coordinates and z-order.
- Missing layout semantics do not trigger Row/Column/Grid inference from geometry.
- Fixed source structure may remain fixed when Penpot provides no adaptive relationship.

## Responsive gate

- Responsive families require explicit metadata or an exact documented semantic board-family convention.
- Canvas dimensions never become breakpoint thresholds.
- Each source board remains available as a separate design composition.
- A runtime resolver is emitted only with complete explicit min/max bounds.
- Missing/conflicting bounds produce diagnostics or recommendations, not guessed values.
- Structurally different variants retain independent source subtrees.

## Dart generation gate

- Same IR produces byte-for-byte deterministic source before formatting.
- Generated identifiers are valid and collision handling is deterministic.
- Imports, const propagation, assets, components, variants, and tokens are internally consistent.
- Tier 1 output is importable reusable code.
- Tier 2 output is clearly named/labeled as design composition or implementation reference.
- Tier 3 output exposes metadata/callbacks and does not call an application router.
- Visible source content is not silently dropped.
- Representative output formats and analyzes when Flutter tooling is available.

## Prototype gate

- Explicit destination, flow, interaction, trigger, action, URL, delay, overlay, animation, and source IDs are preserved when available.
- Unresolved destinations retain stable IDs and produce diagnostics.
- Affected widgets expose `onPrototypeInteraction` only as an integration callback.
- No navigation architecture, route guards, deep-link behavior, or app shell is generated.

## Asset and typography gate

- Generated assets live under `assets/penpot/`.
- Large binaries are not embedded in Dart.
- SVG/raster fallback behavior is explicit and diagnosed.
- Asset declarations and `pubspec.yaml` metadata do not reference missing payloads without a diagnostic.
- External fonts produce actionable requirements when files are unavailable.

## Generated ownership gate

- Generated files live under `lib/generated/penpot/`.
- `penpot_manifest.json` records ownership roots, tiers, source IDs, and deterministic hashes.
- Regeneration can replace both generator-owned roots without touching developer-owned files.
- No source-merge system is introduced for manual edits inside generated files.

## JSON handoff and installer gate

- Complete export is a valid `penpot_handoff.json` bundle with supported format version.
- The bundle includes generated files, assets, integration metadata, and font requirements.
- Asset text/base64 encoding round-trips correctly.
- `bin/install-handoff.mjs` rejects malformed bundles and path traversal.
- Installation removes/replaces only `lib/generated/penpot` and `assets/penpot`.
- The installer does not modify application source or `pubspec.yaml`.
- Documentation calls JSON the current archive format and does not claim ZIP support.

## Diagnostics gate

- Errors, warnings, information, and design recommendations are counted separately.
- Errors block unsafe copy/download behavior.
- Recommendations are non-blocking and never change generated semantics.
- Repeated low-severity diagnostics may be grouped without hiding source impact.
- Unsupported behavior is visible and actionable.

## Release gate

Run and report:

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Where Flutter tooling is available, install a representative bundle into a disposable target and run:

```sh
dart format lib/generated/penpot
flutter analyze
```

Document supported semantics, known approximations, required packages, asset/font integration, JSON handoff installation, and the three authority tiers. Do not claim validation that was not executed.
