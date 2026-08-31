# Quality gates

## Penpot plugin gate

- Production build succeeds.
- Manifest is valid and uses only required permissions.
- Plugin opens successfully from its manifest URL.
- Selection can be read.
- Selection-change handling does not leak listeners.
- UI and `plugin.ts` communicate through typed serializable messages.
- No UI script depends directly on the Penpot global.

## Extractor/IR gate

- Same source node produces deterministic IR.
- Child order and z-order are preserved.
- Flex sizing, padding, gap, and alignment are represented explicitly.
- Absolute children are marked explicitly.
- Unsupported properties produce diagnostics.
- IR can be JSON-serialized.

## Dart generation gate

- Same IR produces byte-for-byte deterministic source before formatting.
- Output parses and formats successfully with Dart tooling when available.
- Representative fixture output passes `flutter analyze` or the narrowest available Dart analyzer.
- No invalid Dart identifiers.
- No references to missing assets without an accompanying asset manifest/instruction.
- No hidden unsupported-node drops.

## Visual gate

Use a small fixture gallery rather than a huge demo design. Include:
1. card with padding, text, radius, shadow
2. horizontal toolbar with fill/fixed children
3. nested column/row layout
4. positioned badge overlay
5. image card
6. grid sample
7. rich text sample

Compare dimensions, alignment, spacing, typography, colors, radii, shadows, and clipping.

Pixel-perfect output is not the only criterion: penalize generated code that achieves fidelity through excessive absolute positioning when structural Flutter layout can represent the design.

## Release gate

Document:
- supported Penpot node types
- supported layout features
- known approximations
- required Flutter packages, if any
- asset/font setup
- plugin installation/deployment steps
- one end-to-end example
