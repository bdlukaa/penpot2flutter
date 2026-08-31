# Penpot -> Flutter mapping guide

This is a policy guide, not a substitute for checking the current Penpot and Flutter APIs.

## Containers

| Penpot semantics | Preferred Flutter output | Notes |
| --- | --- | --- |
| Flex row | `Row` | Map main/cross axis alignment and sizing |
| Flex column | `Column` | Preserve child order |
| Flex fill child | `Expanded` or `Flexible` | Only when parent is a Flutter Flex |
| Auto/fixed child | intrinsic widget / `SizedBox` | Avoid forcing dimensions unnecessarily |
| Padding | `Padding` | Collapse symmetric/all forms when readable |
| Gap | spacing widgets or generated gap policy | Preserve deterministic child order |
| Absolute child | `Stack` + `Positioned` | May be mixed with normal layout via nested stack |
| Clipping | `ClipRect`, `ClipRRect`, etc. | Generate only when source clips |
| Simple grid | Grid/table/custom structural mapping | Choose based on track semantics |
| Complex unsupported grid | documented fallback | Emit warning |

## Shapes and decoration

| Penpot | Flutter |
| --- | --- |
| Rectangle fill | `Container`/`DecoratedBox` + `BoxDecoration` |
| Border radius | `BorderRadius` |
| Stroke | `Border` / `BorderSide` where equivalent |
| Shadow | `BoxShadow` |
| Linear/radial gradient | Flutter gradient equivalents |
| Ellipse/circle | `BoxShape.circle` when square, otherwise clipped/decorated ellipse strategy |
| Opacity | `Opacity` or color alpha | Prefer local alpha when semantically equivalent |
| Rotation | `Transform.rotate` | Avoid if zero |

## Text

Map, when available:
- content
- font family
- size
- weight
- style
- color/fill
- letter spacing
- line height
- alignment
- decoration
- casing only if source behavior requires transformation

Use `Text` for uniform runs and `RichText`/`TextSpan` for mixed runs.

Font family presence in Penpot does not guarantee the target Flutter project has that font. Generate a warning or asset/font setup instructions when the font is not known to be available.

## Images and vectors

Prefer asset files over embedded bytes.

For image fills, preserve crop/fit semantics using the closest `BoxFit` plus alignment/clipping strategy.

For complex vectors:
1. prefer an SVG asset when the target Flutter setup supports SVG rendering;
2. otherwise export an appropriate raster image;
3. use `CustomPainter` only when the user explicitly wants native vector code or an asset is unsuitable.

## Styling/tokens

For an MVP, emit literal styles but centralize them in generator code.

For token-aware generation, map repeated Penpot tokens to generated Dart concepts such as:
- colors -> `ColorScheme` / constants
- typography -> `TextTheme` / styles
- spacing/radii -> generated token constants or a `ThemeExtension`

Never infer a design token solely because two numeric values happen to match; use actual Penpot token/library references where available.

## Responsiveness

Do not invent breakpoints from a single static board unless requested.

Base responsive behavior first on explicit Penpot flex/grid sizing semantics. If multiple boards represent breakpoints, a later phase can infer responsive variants and emit `LayoutBuilder`, constraints, or breakpoint helpers with explicit diagnostics.
