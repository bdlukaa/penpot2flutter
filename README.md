# Penpot to Flutter

A read-only Penpot plugin that converts the current selection into deterministic, formatted Flutter/Dart widget source.

## Compiler pipeline

```text
Penpot selection
  -> normalized serializable IR
  -> component / variant / token registries
  -> Flutter theme and widget generators
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
- Penpot variant families as one reusable Flutter widget with deterministic typed enum axes, default values, explicit member matrices, instance arguments, and runtime rejection of undefined combinations
- First-class token IR for colors, dimensions, spacing, sizing, border widths/radii, opacity, typography values, shadows, gradients, durations, numbers, aliases, sets, and themes
- Deterministic `app_tokens.dart` generation, semantic token aliases, reachable-token filtering, token references in generated widgets/components, and literal fallbacks with token diagnostics
- Responsive screen IR and conservative Mobile/Tablet/Desktop board-family detection, with explicit metadata support for unambiguous custom groups
- Dependency-free `LayoutBuilder` breakpoint generation, responsive Row/Column and grid variants, hidden breakpoint content, component/variant preservation, and Stack fallback for overlays
- Penpot child min/max dimensions as `ConstrainedBox`, fill sizing as `Expanded`, auto sizing without forced expansion, and optional aspect-ratio constraints when source metadata provides one
- Reusable typography styles in `app_typography.dart`, fallback-family and font usage manifests, explicit unavailable-font diagnostics, Penpot weight normalization, absolute/percentage line-height conversion, text transforms, paragraph alignment, max-lines/overflow metadata, and nested mixed-style `RichText` spans
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
- `FONT_UNAVAILABLE`, `FONT_WEIGHT_APPROXIMATED`, `TEXT_LINE_HEIGHT_INVALID`, `TEXT_STYLE_UNSUPPORTED`, `TEXT_OVERFLOW_INFERRED`, and `TEXT_MIXED_STYLE_UNSUPPORTED` identify typography data that cannot be represented or packaged exactly. Penpot exposes font metadata but no downloadable font files through the current Plugin API; an adapter must provide `assetPath` values before font assets are added to `pubspec.yaml`.
- Vector/path shapes become `SvgPicture.asset` references; the SVG binary files themselves are not exported by the plugin yet.
- Shared components resolve first from `Shape.component()`, then from the local/connected library index. Only components reachable from the selected roots are exported.
- The plugin is read-only. A shared library that is available but not connected produces `SHARED_LIBRARY_NOT_CONNECTED` with remediation guidance; the plugin intentionally does not call `connectLibrary()` because it persistently modifies the Penpot file and requires `library:write`.
- Missing libraries, missing components, unavailable canonical instances, and failed resolution produce source-node diagnostics rather than being silently flattened.
- Component override inference currently supports meaningful text overrides as defaulted `String` parameters. Color, visibility, dimensions, and component swaps remain diagnostics/future work.
- Variant metadata comes from `LibraryComponent.isVariant()`, `Variants.properties`, `Variants.variantComponents()`, and `variantProps`; family membership is never inferred from display names.
- Structurally different variant members use a readable internal switch between complete member subtrees. Shared-value factoring into smaller conditional style expressions is a future optimization; public variant APIs already remain unified.
- Incomplete variant matrices generate `VARIANT_COMBINATION_UNSUPPORTED`, and unsupported constructor combinations throw an `ArgumentError` instead of selecting an arbitrary member.
- Responsive board inference only accepts exact semantic families ending in `Mobile`, `Tablet`, or `Desktop` and requires structural similarity. Low-confidence or unrelated boards remain separate and produce `RESPONSIVE_GROUP_UNRESOLVED`; explicit metadata may confirm intentionally divergent layouts.
- Inferred Mobile/Tablet/Desktop thresholds use available width (`600` and `1024`) with no device-type or orientation checks. Breakpoint branches stay inside one generated screen class; structurally divergent branches retain safe independent subtrees rather than forcing a brittle merge.
- The official Penpot API exposes min/max child constraints but no aspect-ratio or flex grow/shrink fields. The IR supports an explicit aspect ratio for future/configured adapters; unavailable semantics are never inferred from canvas geometry alone.
- The current official Penpot Plugin API and latest `@penpot/plugin-types` release (`1.4.2`) do not expose Design Token collections or shape token bindings. Penpot's Design Tokens documentation describes the plugins Tokens API as “coming soon.” The compiler, serializable token IR, diagnostics, and Flutter token generation are implemented and fixture-tested, but `src/plugin.ts` cannot discover live Penpot token usage until that public API ships. The plugin does not inspect private application state or infer bindings from equal literal values.
- Token sets and themes are preserved as deterministic generated metadata. Theme-aware runtime value switching cannot be wired to live Penpot themes until the official API exposes active theme resolution and bound-token identities.
- Component output is generated as deterministic source files (`screens/`, `components/`, `app_tokens.dart` when used, and `penpot_ui.dart`). The UI can preview, copy, and download each file individually; it does not create a ZIP bundle.
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
12. Select matching boards named `Screen / Mobile`, `Screen / Tablet`, and `Screen / Desktop`. Confirm one generated screen uses `LayoutBuilder`, omits fixed top-level board dimensions, preserves component calls, and reports inferred breakpoints.

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
  core/token-registry.ts      Token sources -> deterministic token IR
  core/responsive-analyzer.ts Responsive board analysis and breakpoint IR
  shared/ir.ts               Serializable layout, typography, token, and component IR               Serializable compiler IR
  shared/messages.ts         Typed UI/plugin protocol
  shared/version.ts          UI version indicator
```

## Component output

For a selected screen containing component instances, the compiler emits deterministic source files such as:

```text
screens/checkout_screen.dart
components/primary_button.dart
components/product_card.dart
app_tokens.dart
penpot_ui.dart
```

Each main component becomes one `StatelessWidget`; each linked instance becomes a call to that widget. A composite `libraryId:componentId` key, rather than a display name or raw component ID, defines identity. Display names only determine deterministic Dart class/file names, with a suffix added for collisions. A detached instance remains an ordinary shape tree.

## Next milestone

The remaining post-MVP work is factoring structurally identical responsive breakpoint trees into shared conditional values, wiring live Design Token extraction when Penpot publishes its promised Plugin Tokens API, a verified archive/download workflow for images and SVG assets, broader component override parameters, finer-grained factoring of variant-member differences, and project-wide export.
