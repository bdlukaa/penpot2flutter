# Penpot to Flutter

A read-only Penpot plugin that converts the current selection into deterministic, formatted Flutter/Dart widget source.

## Compiler pipeline

```text
Penpot selection
  -> normalized serializable IR
  -> Flutter widget generator
  -> formatted Dart preview, copy, or source download
```

The generator never consumes Penpot objects directly. `src/plugin.ts` is the only Penpot API boundary; the UI receives typed, JSON-serializable conversion messages.

## Implemented conversion scope

- Selection changes, empty selection state, and multiple roots through a synthetic parent
- Boards, groups, rectangles, ellipses, images, text, and vector paths
- Vector paths (`path`, `svg-raw`, `boolean`) as SVG assets rendered via `flutter_svg`
- Nested children and source/z-order preservation
- Flex rows and columns, reverse direction, spacing (`Row`/`Column.spacing`), alignment, fill sizing, and absolute children
- Simple grids containing only flex tracks and unspanned auto-positioned children, generated as `GridView.count`
- Stack/`Positioned` fallback for absolute containers and unsupported grid semantics
- Solid fills, linear gradients, radial gradients, image fills, opacity, solid borders, corner radii, and drop shadows
- Board clipping, rotation, and horizontal/vertical flips
- Text content, family, size, weight, style, decoration, line height, letter spacing, and alignment
- Mixed-style text runs as `RichText`/`TextSpan` with per-run style and color
- Deterministic Flutter asset path and `pubspec.yaml` asset snippet generation
- Preview syntax highlighting, Copy Dart, Download Dart, and per-file preview/copy/download for multi-file component output
- Explicit Penpot component definitions and component instances: one Flutter widget per canonical component, with callers generated as widget invocations
- Local and connected shared-library component resolution, including nested and cross-library component dependencies, composite library/component identity, deterministic name collision handling, and conservative text-override (`String`) parameters
- Node-associated warnings for unsupported or approximate conversion
- A `// layer-name` comment above every generated widget for traceability back to the Penpot layer

## Idiomatic Flutter output

Generated code follows Flutter conventions rather than pixel-positioning every node:

- Flex gaps use `Row.spacing`/`Column.spacing` instead of interleaved `SizedBox` spacers.
- Padding uses `EdgeInsetsDirectional.only(...)` for RTL/LTR-aware layout.
- Default-valued properties are omitted (`mainAxisAlignment: start`, `crossAxisAlignment: center`, empty `BoxDecoration`, zero padding, `clipBehavior: Clip.none`, and zero grid spacing).
- Decoration-less containers are emitted as `SizedBox`; `clipBehavior` is only emitted when a decoration box actually exists.
- Square ellipses use `BoxDecoration(shape: BoxShape.circle, ...)`; `ClipOval` is reserved for non-square ellipses where a circle shape cannot represent the geometry.

## Intentional fallbacks and limitations

- A grid containing fixed, percent, or auto tracks; spans; or manual/area placement falls back to `Stack`/`Positioned` and reports an `unsupported-grid` warning. This preserves placement instead of guessing incorrect Flutter grid constraints.
- Mixed text runs are resolved into `RichText`/`TextSpan` from the live `Text.getRange` API when Penpot reports mixed styles; when runs cannot be resolved, the common style is used with a warning.
- Inner shadows, non-solid strokes, unsupported colors, malformed geometry, and malformed image IDs report warnings.
- Vector/path shapes become `SvgPicture.asset` references; the SVG binary files themselves are not exported by the plugin yet.
- Shared components resolve first from `Shape.component()`, then from the local/connected library index. Only components reachable from the selected roots are exported.
- The plugin is read-only. A shared library that is available but not connected produces `SHARED_LIBRARY_NOT_CONNECTED` with remediation guidance; the plugin intentionally does not call `connectLibrary()` because it persistently modifies the Penpot file and requires `library:write`.
- Missing libraries, missing components, unavailable canonical instances, and failed resolution produce source-node diagnostics rather than being silently flattened.
- Component parameter inference currently supports only meaningful text overrides as defaulted `String` parameters. Color, visibility, dimensions, component swaps, and variant properties remain diagnostics/future work.
- The installed Penpot Plugin API typings do not expose component-family or variant metadata, so variant-specific Flutter APIs are not generated. This is intentionally not inferred from names or visual structure.
- Component output is generated as deterministic source files (`screens/`, `components/`, and `penpot_ui.dart`). The UI can preview, copy, and download each file individually; it does not create a ZIP bundle.
- Asset references and the pubspec snippet are generated, but original image and SVG binary files are not downloaded. The plugin does not claim to export a binary bundle because the current browser/plugin setup provides no verified, safe ZIP download path.
- Gradient coordinates are interpreted as normalized Penpot coordinates. Complex gradient transforms are not supported.

## Permissions

The manifest requests only:

```json
"permissions": ["content:read", "library:read"]
```

`content:read` allows extraction of the selected design. `library:read` allows resolution of canonical component definitions in the local and already-connected shared libraries. The plugin does not request `library:write`: connecting a library is a persistent document change. Download Dart uses a browser-generated text file and requires no Penpot content-write permission.

## Development

```sh
npm install
npm test
npm run build
npm run dev
```

- `npm test` validates source-like fixtures -> IR -> deterministic Dart and verifies representative generated output against `dart format` when the Dart SDK is available.
- `npm run build` runs strict TypeScript checking and produces the plugin in `dist/`.
- `npm run dev` hosts the manifest for local Penpot installation.

Install `http://localhost:4400/manifest.json` in Penpot’s Plugin Manager while the dev server is running. If hosted Penpot cannot access localhost due to browser/network policy, expose it through an HTTPS tunnel or deploy `dist/` to an HTTPS host.

## Manual verification

1. Create a board containing a flex row, a gradient rectangle, an ellipse, text, and an image fill.
2. Select the board and open **Penpot to Flutter**.
3. Confirm the preview uses `Row`/`Column` for flex, `LinearGradient` or `RadialGradient`, `ClipOval` for ellipses, and `Transform.rotate` for rotated layers.
4. Select a text layer with mixed styling (bold, italic, underline, or colored runs) and confirm it emits `RichText` with per-run `TextSpan`s.
5. Create a simple all-flex grid and confirm it emits `GridView.count`.
6. Add a spanning or fixed-track grid child and confirm a warning is shown and the generated widget uses a `Stack` fallback.
7. Create a local component, use several instances in a board, and override a text label. Confirm **Generated files** contains a component file and the screen calls that widget with a `String` argument instead of duplicating its internals.
8. Place a component instance inside another component and confirm the parent component imports and calls the nested component. In a second Penpot file, connect a published shared library and use its component in the selected board; confirm it resolves to the same reusable component output. A library that is available but not connected must show `SHARED_LIBRARY_NOT_CONNECTED`, not expanded markup.
9. Confirm **Copy Dart** and **Download Dart** act on the visible file; select each generated file to review component, screen, and barrel sources.
10. For images, add the displayed `pubspec.yaml` snippet and place the corresponding image files at the generated asset paths before running the Flutter app.
11. For vectors, add `flutter_svg` to your Flutter project (`flutter pub add flutter_svg`) and export the SVG assets to the generated `assets/images/*.svg` paths.

## Adding the SVG dependency

Generated code that contains vector paths references `SvgPicture.asset` from `package:flutter_svg/flutter_svg.dart`. Add it to your Flutter app:

```sh
flutter pub add flutter_svg
```

The generated `pubspec.yaml` snippet includes the `flutter_svg` dependency and the asset entries. Export each vector shape as `.svg` into the generated path (e.g. `assets/images/<node-id>.svg`) so `SvgPicture.asset` can load it.

## Project structure

```text
src/
  plugin.ts                  Penpot execution boundary
  main.ts                    Iframe UI and code preview
  core/extractor.ts          Penpot-like data -> normalized IR
  core/flutter-generator.ts  IR -> Dart source
  shared/ir.ts               Serializable compiler IR
  shared/messages.ts         Typed UI/plugin protocol
  shared/version.ts          UI version indicator
```

## Component output

For a selected screen containing component instances, the compiler emits deterministic source files such as:

```text
screens/checkout_screen.dart
components/primary_button.dart
components/product_card.dart
penpot_ui.dart
```

Each main component becomes one `StatelessWidget`; each linked instance becomes a call to that widget. A composite `libraryId:componentId` key, rather than a display name or raw component ID, defines identity. Display names only determine deterministic Dart class/file names, with a suffix added for collisions. A detached instance remains an ordinary shape tree.

## Next milestone

The remaining post-MVP work is a verified archive/download workflow for images and SVG assets, broader component parameters and variants, design tokens, responsive inference, and project-wide export.
