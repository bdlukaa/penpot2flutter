# Penpot to Flutter

A read-only design-handoff compiler that converts explicit Penpot design semantics into deterministic Flutter/Dart code, assets, metadata, and diagnostics.

Penpot to Flutter is not an application generator, no-code platform, or replacement for developer-owned Flutter architecture. It compiles what Penpot knows, preserves what Penpot says, and reports what cannot be represented without guessing.

## Support the project

If Penpot to Flutter helps your design handoff workflow, you can support its continued development through [GitHub Sponsors](https://github.com/sponsors/bdlukaa).

## Quick start

### Use the published plugin

1. Open Penpot and open the **Plugin Manager**.
2. Install **Penpot to Flutter** from its published listing, or add the manifest URL supplied with the release.
3. Open a Penpot file, select a board, component, or visual layer, and launch the plugin.
4. Review the generated files by authority tier:
   - **Reusable code** — tokens, themes, typography, assets, components, variants, and libraries.
   - **Composition** — board-based implementation references.
   - **Prototype hint** — destinations, flows, and interaction callbacks.
5. Use **Download handoff** to export the complete `penpot_handoff.json` bundle.

The plugin requests only `content:read` and `library:read`. It does not modify the Penpot document.

### Requirements

- A Penpot workspace with access to the plugin.
- A Flutter project for integrating generated output.
- Node.js 22+ and npm when using the handoff installer or developing the plugin.
- Dart stable is recommended for generated-source validation. Flutter is recommended when running representative widget validation.

### Install a downloaded handoff

Keep the `bin/install-handoff.mjs` installer from the release checkout, then run it against the downloaded bundle and your Flutter project:

```sh
node bin/install-handoff.mjs /path/to/penpot_handoff.json /path/to/my_flutter_app
```

Or, from the repository root:

```sh
npm run install-handoff -- /path/to/penpot_handoff.json /path/to/my_flutter_app
```

The installer replaces only `lib/generated/penpot/` and `assets/penpot/`. It preserves application code and does not edit `pubspec.yaml`. Copy the printed dependency, asset, and font requirements into the Flutter project, then run:

```sh
flutter pub get
flutter analyze
```

For a first integration, install into a disposable branch or working copy so the generated diff is easy to review.

## Product boundary

### Penpot is authoritative for

- design tokens and token themes
- typography and visual assets
- components, instances, variants, and explicit overrides
- connected shared libraries
- explicit Flex, Grid, and absolute layout
- explicit sizing, alignment, clipping, transforms, and styling
- top-level board compositions
- explicit prototype destinations, flows, and interactions

### The generated handoff owns

- deterministic Flutter representations of explicit Penpot semantics
- reusable design-system code
- design compositions
- prototype metadata and callbacks
- generated assets and integration metadata
- source traceability, manifests, diagnostics, and designer recommendations

### Flutter developers own

- application and feature architecture
- domain models and business logic
- state management and async loading
- API integration, persistence, authentication, and authorization
- routing, route guards, deep links, and navigation policy
- form validation and production error/loading/empty states
- localization architecture
- accessibility decisions not explicitly represented by the design
- runtime responsive behavior beyond explicit design information
- analytics, platform adaptation, and production application composition

The generator does not invent these responsibilities from layer names, text, geometry, or visual similarity.

## Compiler pipeline

```text
Penpot Plugin API
  -> serializable source snapshot
  -> normalized JSON-serializable IR
  -> component / variant / token / library registries
  -> Flutter generators
  -> deterministic files + assets + diagnostics
```

`src/plugin.ts` is the Penpot API boundary. The iframe UI receives typed, JSON-serializable messages; Flutter generation does not consume live Penpot objects.

## Three generated tiers

| Tier | Output | Authority |
| --- | --- | --- |
| 1 — reusable design-system code | tokens, themes, typography, assets, components, variants, and shared-library modules | High-confidence generated API intended for direct import |
| 2 — design compositions | selected boards and explicit responsive board variants under `compositions/` | Implementation references or composition helpers, not complete production screens |
| 3 — prototype metadata | destinations, flows, interactions, and `onPrototypeInteraction` callbacks | Low-authority integration hints; application navigation remains developer-owned |

`penpot_manifest.json` records generated files, tiers, source IDs, hashes, ownership roots, libraries, assets, tokens, compositions, and prototype references.

## Implemented conversion scope

- Selection changes, empty selection state, and multiple selected roots through a synthetic parent
- Boards, groups, rectangles, ellipses, images, text, and vector/path shapes
- Nested children with source and z-order preservation
- Explicit Flex rows and columns, reverse direction, spacing, alignment, fill sizing, constraints, and absolute children
- Simple all-flex grids without spans or manual placement as `GridView.count`
- Faithful `Stack`/`Positioned` output for explicit absolute layout and unsupported Grid semantics
- Solid fills, linear/radial gradients, image fills, opacity, solid borders, corner radii, and drop shadows
- Clipping, rotation, and horizontal/vertical flips
- Text family, fallbacks, size, weight, style, decoration, line height, letter spacing, alignment, transforms, and mixed runs
- SVG, PNG, JPG, WebP, and font asset registry entries with deterministic names, content-hash deduplication, collision diagnostics, generated `AppAssets`, and `pubspec.yaml` integration metadata
- Canonical Penpot components as reusable Flutter widgets; instances call those widgets rather than duplicating their trees
- Connected shared-library component, token, and asset ownership keyed by stable Penpot library IDs
- Penpot variant families as one public widget API with explicit typed enum selection and validation of sparse combinations
- Token catalogs, sets, aliases, theme axes, generated `ThemeExtension` APIs, `ThemeData` composition, and semantic token references
- Reusable typography output and aggregated external-font requirements
- Prototype destinations, flows, triggers, actions, overlay metadata, and callbacks without selecting a Flutter routing framework
- Node-associated errors, warnings, informational decisions, and non-blocking design recommendations
- Generated-source declaration validation before copy or download

## Explicit layout and responsiveness

Layout mapping follows source semantics:

```text
horizontal Flex       -> Row
vertical Flex         -> Column
simple supported Grid -> GridView.count
absolute positioning  -> Stack + Positioned
fill sizing           -> Expanded when explicitly represented
fixed sizing          -> SizedBox / constraints
padding                -> Padding
rotation               -> Transform.rotate
clipping               -> matching Flutter clip widget
```

A source container without explicit Flex or supported Grid semantics is preserved as fixed/absolute composition. The compiler does not reinterpret geometry as a Row, Column, Grid, or responsive layout because elements happen to align visually.

Responsive output is explicit-only:

- Exact semantic board families such as `Checkout / Mobile`, `Checkout / Tablet`, and `Checkout / Desktop` may be grouped as related design compositions.
- Board widths do not become breakpoints.
- Each board keeps its own source subtree; structural differences are not merged into an invented adaptive layout.
- A `LayoutBuilder` convenience resolver is generated only when explicit min/max bounds are present and complete.
- Without explicit bounds, the compiler emits separate compositions and may recommend adding explicit metadata if a resolver is desired.

The current Penpot plugin extraction does not derive min/max bounds from canvas dimensions.

## Components, variants, tokens, and libraries

Components are a primary handoff contract. One canonical Penpot component generates one reusable Flutter widget. Explicit instances become widget invocations, and conservative explicit overrides can become typed constructor parameters.

Variant membership comes from Penpot variant APIs, never display-name or visual-difference guessing. Distinct variant structures remain distinct internally when collapsing them would lose source semantics.

Token identity is preserved independently from resolved values. Repeated literals do not silently become tokens. Local and already-connected library token catalogs are serialized in the plugin context and generated into typed namespaces and theme extensions.

Shared libraries remain keyed by stable library ID. The plugin is read-only and does not connect unavailable libraries because that would mutate the Penpot document and require write permission.

## Prototype metadata, not routing

When Penpot provides prototype data, generated output can include:

- `PenpotDestination`
- prototype action and trigger enums
- interaction and flow metadata
- overlay and animation metadata
- `onPrototypeInteraction` callbacks on affected compositions/components

Generated widgets report an interaction to application code. They do not create an application router, navigation stack, route guards, deep-link policy, or app shell.

## Generator-owned output

The handoff uses a hard ownership boundary:

```text
lib/generated/penpot/
  components/
  compositions/
  libraries/
  theme/
  assets.dart
  prototype_destinations.dart
  penpot.dart
  penpot_manifest.json

assets/penpot/
  images/
  icons/
  vectors/
  libraries/
```

Everything under `lib/generated/penpot` and `assets/penpot` is generator-owned and replaceable on regeneration. Keep application code elsewhere; do not manually edit generated files.

## JSON handoff bundle and installer

**Download handoff** creates `penpot_handoff.json` with format version `1`:

- generated files with project-relative paths and authority tiers
- exported text/base64 assets
- generated `pubspec.yaml` integration metadata
- external font requirements

Install it into a Flutter project using the installer included in this repository or release package:

```sh
node bin/install-handoff.mjs /path/to/penpot_handoff.json /path/to/flutter-project
```

Or through the package script:

```sh
npm run install-handoff -- /path/to/penpot_handoff.json /path/to/flutter-project
```

The installer:

1. validates the bundle shape and format version;
2. removes the existing generator-owned `lib/generated/penpot` and `assets/penpot` trees;
3. rejects paths outside those ownership roots and the target Flutter project;
4. writes generated Dart/JSON files and decoded assets;
5. prints the `pubspec.yaml` snippet and font requirements for manual integration.

It intentionally does not modify developer-owned `pubspec.yaml` or application files.

### Current archive limitation

The complete handoff is a JSON bundle, not a ZIP archive. The JSON contains source plus text/base64 asset payloads and is the supported input to `bin/install-handoff.mjs`. The UI also supports individual generated-file and asset downloads. No ZIP workflow is currently implemented or claimed.

## Diagnostics and recommendations

Unsupported or incomplete source semantics are not silently redesigned.

- **Error:** generated output is unsafe or invalid; copy/download is blocked.
- **Warning:** visible data may be unavailable, unsupported, or approximated.
- **Info:** deterministic implementation decision or resolved limitation.
- **Design recommendation:** non-blocking source-design improvement, such as using components/tokens or adding explicit responsive semantics.

Recommendations never change generated semantics and never block export. Missing libraries, assets, fonts, tokens, unsupported Grid behavior, sparse variants, and unresolved prototype destinations remain visible through diagnostics.

## Important limitations and fallbacks

- Unsupported Grid tracks, spans, and manual placement fall back to `Stack`/`Positioned` with a diagnostic.
- Mixed text uses `RichText` when Penpot exposes resolvable runs; otherwise the common style is preserved with a warning.
- Inner shadows, unsupported effects/colors/strokes, malformed geometry, and failed exports produce diagnostics.
- Complex vectors use SVG where available. Effects that cannot be preserved require an adapter-provided raster fallback or report `ASSET_EXPORT_FAILED`.
- Penpot exposes font metadata but not downloadable font files through the current Plugin API; the bundle reports requirements until an asset path is supplied.
- Only components reachable from the selected roots are exported.
- Visibility, dimensions, gradients/multiple fills, and component swaps are not generalized into component override parameters.
- The plugin uses `@penpot/plugin-types` `1.5.0`; token edits require **Refresh Design System** because that API version has no token-specific mutation event.
- Material theme roles are mapped only from explicit semantic token names. The complete token catalog remains available through generated token/theme APIs.
- Design compositions are valid generated Dart but are not claims of production-ready screens.

## Permissions

The manifest requests only:

```json
"permissions": ["content:read", "library:read"]
```

`content:read` allows selected design extraction. `library:read` allows canonical component and token resolution from local and already-connected libraries. The plugin does not request content or library write access.

## Development

### Set up the repository

```sh
git clone https://github.com/bdlukaa/penpot2flutter.git
cd penpot2flutter
npm ci
```

Run the checks and build:

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

The commands do the following:

- `npm run typecheck` runs strict TypeScript checking without emitting files.
- `npm run lint` runs ESLint.
- `npm test` validates extraction, IR, registries, deterministic generation, diagnostics, and handoff behavior through source-like fixtures.
- `npm run build` runs TypeScript and creates the plugin build in `dist/`.

### Run a local plugin build

Use two terminals. In the first, rebuild the plugin whenever source files change:

```sh
npm run dev
```

In the second, serve the generated `dist/` directory:

```sh
npx vite preview --host 0.0.0.0 --port 4400
```

Open the local manifest at `http://localhost:4400/manifest.json` in Penpot’s Plugin Manager. If Penpot is running in a hosted browser session and cannot reach your machine, expose the server through an HTTPS tunnel and use that tunnel URL instead. Reopen or refresh the plugin after a rebuild.

`npm run dev` is a build watcher; it does not itself start a web server.

### Validate a generated handoff

For representative generated Dart, run:

```sh
dart format lib/generated/penpot
flutter analyze
flutter test
```

These checks validate generated source and integration into a target Flutter project. They do not mean a design composition is a complete production screen; application behavior remains developer-owned.

## Release checklist

Before publishing a plugin release:

1. Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
2. Confirm `dist/plugin.js` is a standalone plugin bundle and `dist/manifest.json` points to `plugin.js`.
3. Serve `dist/` from the final public HTTPS URL.
4. Test installing that manifest in Penpot with a board, component, shared-library asset, token, and prototype selection.
5. Download a complete handoff and install it into a disposable Flutter project.
6. Copy the printed `pubspec.yaml` requirements and verify `flutter analyze`.
7. Publish the manifest URL or listing together with the matching installer and release version.

## Manual handoff check

1. Select a board or component and open **Penpot to Flutter**.
2. Inspect generated files and their labels: reusable generated code, implementation reference, prototype integration hint, or manifest.
3. Confirm explicit Flex/Grid/absolute semantics map directly and unsupported behavior is diagnosed.
4. Confirm component instances call generated widgets and token-bound properties use generated token APIs.
5. If prototype interactions exist, confirm affected widgets expose `onPrototypeInteraction` and no application routing is generated.
6. Download `penpot_handoff.json` and install it with `bin/install-handoff.mjs` into a disposable Flutter project.
7. Copy the printed `pubspec.yaml` metadata and font requirements, then run:

```sh
dart format lib/generated/penpot
flutter analyze
```
