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
- Preview syntax highlighting, Copy Dart, and Download Dart actions
- Node-associated warnings for unsupported or approximate conversion
- A `// layer-name` comment above every generated widget for traceability back to the Penpot layer

## Idiomatic Flutter output

Generated code follows Flutter conventions rather than pixel-positioning every node:

- Flex gaps use `Row.spacing`/`Column.spacing` instead of interleaved `SizedBox` spacers.
- Padding uses `EdgeInsetsDirectional.only(...)` for RTL/LTR-aware layout.
- Default-valued properties are omitted (`mainAxisAlignment: start`, `crossAxisAlignment: center`, empty `BoxDecoration`, zero padding, `clipBehavior: Clip.none`, and zero grid spacing).

## Intentional fallbacks and limitations

- A grid containing fixed, percent, or auto tracks; spans; or manual/area placement falls back to `Stack`/`Positioned` and reports an `unsupported-grid` warning. This preserves placement instead of guessing incorrect Flutter grid constraints.
- Mixed text runs are resolved into `RichText`/`TextSpan` from the live `Text.getRange` API when Penpot reports mixed styles; when runs cannot be resolved, the common style is used with a warning.
- Inner shadows, non-solid strokes, unsupported colors, malformed geometry, and malformed image IDs report warnings.
- Vector/path shapes become `SvgPicture.asset` references; the SVG binary files themselves are not exported by the plugin yet.
- Asset references and the pubspec snippet are generated, but original image and SVG binary files are not downloaded. The plugin does not claim to export a binary bundle because the current browser/plugin setup provides no verified, safe ZIP download path.
- Gradient coordinates are interpreted as normalized Penpot coordinates. Complex gradient transforms are not supported.

## Permissions

The manifest requests only:

```json
"permissions": ["content:read"]
```

The plugin reads selected content but does not modify Penpot documents. Download Dart uses a browser-generated text file and requires no Penpot content-write permission.

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
4. Create a simple all-flex grid and confirm it emits `GridView.count`.
5. Add a spanning or fixed-track grid child and confirm a warning is shown and the generated widget uses a `Stack` fallback.
6. Confirm **Copy Dart** copies the unmodified source and **Download Dart** downloads `generated_widget.dart`.
7. For images, add the displayed `pubspec.yaml` snippet and place the corresponding image files at the generated asset paths before running the Flutter app.
8. For vectors, add `flutter_svg` to your Flutter project (`flutter pub add flutter_svg`) and export the SVG assets to the generated `assets/images/*.svg` paths.

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

## Next milestone

The remaining post-MVP work is a verified archive/download workflow for images and SVG assets, design tokens, components/variants, responsive inference, and project-wide export.
