# Penpot -> Flutter explicit mapping guide

This is a compiler policy guide, not a substitute for current Penpot and Flutter API documentation.

## Governing rule

Map explicit source semantics. Preserve unsupported source structure and emit diagnostics. Do not infer application meaning, responsive behavior, or a more convenient layout from appearance.

## Containers and layout

| Explicit Penpot semantics | Flutter output | Policy |
| --- | --- | --- |
| Horizontal Flex | `Row` | Preserve order, direction, sizing, gap, and alignment |
| Vertical Flex | `Column` | Preserve order, direction, sizing, gap, and alignment |
| Flex fill child | `Expanded`/`Flexible` | Only inside a compatible explicit Flex parent |
| Fixed child | `SizedBox`/constraints | Preserve explicit dimensions and min/max constraints |
| Auto child | Intrinsic widget sizing | Do not force fill behavior |
| Padding | `Padding` | Preserve directional edges |
| Supported simple Grid | `GridView.count` or equivalent structural mapping | Only when represented Grid semantics are supported |
| Unsupported Grid | `Stack` + `Positioned` fallback | Preserve placement and emit a warning |
| Explicit absolute layout | `Stack` + `Positioned` | Preserve coordinates and z-order |
| Explicit clipping | `ClipRect`, `ClipRRect`, `ClipOval`, etc. | Emit only when source clips |
| Rotation/flip | `Transform` | Emit only from explicit transform data |

When a container has no explicit Flex or supported Grid semantics, keep its fixed/absolute representation. Do not convert aligned geometry into Row, Column, Grid, wrap, or flow layout.

## Responsive compositions

Responsive behavior requires explicit evidence:

- explicit group identity and optional min/max bounds; or
- exact semantic Mobile/Tablet/Desktop family naming for related board compositions.

Rules:

1. Canvas width is preserved geometry, not a breakpoint.
2. Orientation or device class is not inferred.
3. Each board retains its own tree.
4. Separate design compositions are the default when bounds are absent.
5. Generate a `LayoutBuilder` resolver only when explicit bounds form a deterministic ordering.
6. Report incomplete or conflicting responsive metadata instead of filling gaps.

## Shapes and decoration

| Penpot | Flutter |
| --- | --- |
| Solid rectangle fill | `DecoratedBox`/`Container` + `BoxDecoration` |
| Border radius | `BorderRadius` |
| Solid stroke | `Border`/`BorderSide` where equivalent |
| Drop shadow | `BoxShadow` |
| Linear/radial gradient | Flutter gradient equivalent when representable |
| Square ellipse | `BoxShape.circle` |
| Non-square ellipse | clipped/decorated ellipse strategy |
| Opacity | color alpha or `Opacity`, preserving semantics |
| Image fill | generated asset + matching fit/alignment strategy |

Unsupported blend modes, inner shadows, malformed colors, non-solid strokes, and unsupported effects require diagnostics. Do not silently omit visible content.

## Text and typography

Preserve when exposed by Penpot:

- content and mixed runs
- family and fallback metadata
- size, weight, and style
- color/fill
- letter spacing and line height
- alignment and decoration
- explicit text transform
- max lines and overflow metadata when explicit

Use `Text` for uniform content and `RichText`/`TextSpan` for mixed runs. If mixed runs cannot be resolved, preserve the common style and diagnose the loss.

A Penpot font family is not proof that the Flutter project bundles the font. Emit a font requirement unless an asset path is available.

## Images, vectors, and assets

Prefer deterministic asset files over binary Dart literals.

- raster/image fill -> asset under `assets/penpot/`
- vector/path -> SVG when available
- unsupported vector effects -> adapter-provided raster fallback or export error
- large binary payload -> base64 in `penpot_handoff.json`, decoded by the installer

Generate `AppAssets` declarations and `pubspec.yaml` integration metadata. Keep source identity and content hashes in the asset registry/manifest.

## Components

One canonical Penpot component should produce one public Flutter widget. Component instances should call that widget.

Parameter naming priority:

1. explicit generation metadata;
2. Penpot component property or variant-axis name;
3. semantic layer name;
4. conservative structural role;
5. stable source-ID fallback.

Do not derive public parameter names from arbitrary literal text. Expose only explicit meaningful overrides; do not turn every pixel difference into an API.

## Variants

Use Penpot-declared variant membership and properties. Generate explicit enums or member selectors and preserve sparse combinations.

Never infer a variant from:

- component display-name resemblance;
- text content;
- color/style difference;
- geometry.

When member structures diverge, a private switch between complete source subtrees is valid.

## Tokens and themes

Token references are distinct from resolved literals. Preserve token, set, theme, and library identity.

Possible explicit mappings include:

- colors -> typed token namespace and `ThemeExtension`
- typography -> generated styles/theme values
- spacing/radii/sizing -> typed generated properties
- explicit Material semantic names -> matching `ThemeData` roles

Never create a token because literals repeat. Keep the complete catalog available even when only some values map to Material concepts.

Do not add a Cupertino/Material application mode. Generated design-system APIs may use standard Flutter theme types where explicit token semantics support them; application shell and platform policy remain developer-owned.

## Prototype interactions

Map explicit Penpot prototype data to:

- destination/action/trigger enums;
- interaction and flow records;
- overlay/animation metadata;
- `onPrototypeInteraction` callbacks.

Do not call an application navigator or select a routing package. The callback recipient owns navigation and other runtime behavior.

## Compositions

Top-level boards generate `*Design` classes under `lib/generated/penpot/compositions/`. They are implementation references or helpers.

A composition may preserve many `Positioned` nodes when that is what the source explicitly contains. Emit a design recommendation rather than redesigning the board.
