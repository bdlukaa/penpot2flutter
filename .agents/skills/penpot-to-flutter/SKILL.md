---
name: penpot-to-flutter
description: Design, implement, review, test, or evolve a Penpot plugin that converts Penpot designs into maintainable Flutter/Dart UI code. Use for Penpot-to-Flutter architecture, Penpot Plugin API extraction, shape/layout normalization, intermediate representation (IR) design, Flutter widget generation, design-token mapping, asset export, responsive layout heuristics, plugin UI/message protocols, test fixtures, codegen quality, debugging, and implementation planning for a Penpot Flutter exporter.
disable-model-invocation: false
---

# Penpot to Flutter

## Goal

Build a reliable Penpot plugin that turns selected Penpot design nodes into readable, reusable Flutter code. Optimize for maintainability and visual fidelity rather than a one-off screenshot-to-code dump.

Treat conversion as a compiler pipeline:

`Penpot API -> extractor -> normalized IR -> Flutter code generator -> formatter/validator -> preview/export`

Never couple Dart generation directly to raw Penpot objects when an IR can isolate the two systems.

## Start every implementation task this way

1. Inspect any existing repository or files before proposing replacements.
2. Verify the current official Penpot plugin documentation and `@penpot/plugin-types` API before relying on an API detail that may have changed.
3. Verify current Flutter/Dart APIs when generated code depends on version-sensitive framework behavior.
4. State the supported conversion scope and unsupported cases.
5. Implement the smallest end-to-end vertical slice before broadening coverage.

For architecture details, read `references/architecture.md`.
For Penpot-to-Flutter mappings, read `references/flutter-mapping.md`.
For validation and acceptance criteria, read `references/quality-gates.md`.
For a ready-to-run build prompt, read `references/master-prompt.md`.

## Default product scope

Unless the user specifies otherwise, target this progression.

### MVP

Support:
- selected Penpot board/group/shape tree
- board and group hierarchy
- flex layouts
- basic grid layouts
- absolute positioning fallback
- rectangles and ellipses
- text and common typography
- solid fills and opacity
- gradients where Flutter has a close equivalent
- strokes/borders
- corner radii
- shadows
- transforms where practical
- image fills/assets
- visibility
- generated Dart preview in the plugin UI
- copy-to-clipboard
- export of generated source/assets when supported safely

Prefer a single selected root. If multiple shapes are selected, wrap them in a synthetic root rather than silently dropping nodes.

### Later phases

Add only after the MVP pipeline is stable:
- reusable Penpot components -> reusable Flutter widgets
- variants -> typed widget parameters or enums
- Penpot tokens -> Flutter `ThemeExtension`, `ColorScheme`, `TextTheme`, constants, or generated token classes
- responsive breakpoint inference
- reusable asset manifest generation
- Material/Cupertino modes
- project-wide export
- incremental regeneration and stable node IDs

## Plugin architecture rules

Use the official Penpot plugin starter approach unless an existing repository dictates otherwise. Prefer TypeScript + Vite.

Keep these boundaries:

- `plugin.ts`: code that accesses the global Penpot API.
- iframe/plugin UI: settings, code preview, warnings, export controls.
- message contracts: typed messages between `plugin.ts` and UI.
- extractor: transforms Penpot nodes into serializable source data or directly into the normalized IR.
- IR: framework-neutral normalized tree.
- Flutter generator: pure functions from IR to Dart source.
- asset pipeline: produces deterministic asset names and references.

Do not access the Penpot global from UI code running in the iframe.

Use the minimum manifest permissions needed. Read-only conversion should normally begin with `content:read`; add other permissions only for a feature that demonstrably needs them.

## IR requirements

Define a serializable TypeScript IR. It must not contain Penpot class instances, browser DOM nodes, functions, or circular references.

Every node should include, when applicable:

- stable source ID
- sanitized name
- node kind
- width/height
- layout mode
- child order
- positioning mode
- padding, gap, margins
- alignment and sizing behavior
- fill/background
- border/stroke
- radius
- opacity
- shadows
- rotation/transform metadata
- clipping
- text runs/style data
- image/asset reference
- warnings or unsupported properties

Keep geometry in source units and centralize any conversion policy. Do not scatter magic multipliers throughout generators.

## Layout decision tree

For every container:

1. If Penpot exposes a flex layout, generate Flutter flex-oriented composition first.
2. If Penpot exposes a grid layout, map simple grids structurally; use a documented fallback for unsupported track behavior.
3. If children are intentionally absolute, use `Stack` + `Positioned`.
4. If no explicit layout exists, infer only conservatively from geometry. Prefer a faithful `Stack` fallback over aggressive, brittle inference.
5. Preserve z-order.

Do not generate `Stack` for everything. The generated output must remain editable by Flutter developers.

## Flutter generation rules

Prefer idiomatic widgets and readable nesting.

Typical mappings:
- horizontal flex -> `Row`
- vertical flex -> `Column`
- spacing -> `Padding`, `SizedBox`, flex gap helpers/patterns, or generated wrapper logic
- alignment -> `mainAxisAlignment`, `crossAxisAlignment`, `Align`
- fill sizing -> `Expanded` / `Flexible` when semantically valid
- fixed geometry -> `SizedBox` / `ConstrainedBox`
- styled rectangle -> `Container` or `DecoratedBox`
- text -> `Text` / `RichText`
- ellipse -> decorated box with circular/elliptical shape when equivalent
- arbitrary paths/SVG -> asset/SVG strategy rather than hand-written `CustomPainter` unless explicitly requested
- absolute layout -> `Stack` + `Positioned`
- clipping -> Flutter clip widgets only when source semantics require it

Avoid unnecessary wrappers. Deduplicate repeated decoration/style expressions when doing so improves readability.

Run or emulate `dart format` on emitted code where execution is available. Generated code must be deterministic for identical IR input.

## Names and components

Sanitize Penpot names into valid Dart identifiers.

Prefer semantic names from the design. Fall back to deterministic source-derived names rather than random suffixes.

When component generation is enabled:
- generate one Dart widget per reusable component/root
- expose obvious variant/content differences as typed parameters
- avoid embedding instance-specific coordinates inside reusable widgets unless the source demands them

## Asset policy

Never embed large binary assets directly in Dart source.

Create deterministic asset filenames. Track an asset manifest in the conversion result. Generate the `pubspec.yaml` asset stanza or an explicit snippet when exporting a standalone bundle.

For unsupported vector shapes, prefer SVG export when licensing and platform support permit it; otherwise document the chosen raster fallback.

## Error and warning behavior

Never silently discard unsupported design properties.

Attach warnings at node level and summarize them in the plugin UI, for example:
- unsupported blend mode
- complex vector converted to SVG asset
- grid track approximated
- unavailable font substituted
- effect ignored

A conversion that succeeds with warnings is different from a conversion that failed.

## Testing workflow

Build conversion logic as pure modules wherever possible.

Maintain fixtures covering:
- nested Row/Column
- flex fill/auto/fixed sizing
- padding and gaps
- absolute child in flex container
- text alignment and line height
- border radius/stroke/shadow
- image asset
- clipping
- simple grid
- unsupported feature warning

Test three layers independently:
1. Penpot shape -> IR
2. IR -> Dart string
3. representative generated Dart -> static analysis/compile when Flutter tooling exists

Use golden/snapshot tests for deterministic codegen, but keep at least a few structural assertions so snapshots do not become blind approvals.

## Execution order for building the actual plugin

1. Bootstrap or inspect the Penpot plugin project.
2. Establish manifest and typed Penpot/UI message protocol.
3. Read current selection and show basic metadata in the UI.
4. Implement IR types.
5. Convert one Board/Rectangle/Text vertical slice.
6. Generate a minimal compilable Flutter widget.
7. Add code preview and copy.
8. Add flex layout conversion.
9. Add decoration/typography.
10. Add images/assets and export bundle.
11. Add grid/absolute fallbacks.
12. Add warnings/diagnostics.
13. Add fixtures and codegen tests.
14. Validate Penpot build and Flutter output.
15. Only then add components, tokens, variants, and responsive inference.

## Required implementation output

When asked to create or modify the plugin, return concrete code rather than only prose. Include:

- changed file tree
- complete contents for new core files
- focused diffs or complete files for modifications, depending on repository context
- commands to install, build, test, and run
- manifest permissions with rationale
- known limitations
- next test case to verify inside Penpot

Do not claim code was tested unless the relevant command actually ran successfully.

## Product-quality principles

Prioritize, in order:
1. generated Dart compiles
2. layout semantics are correct
3. output is readable and editable
4. visual fidelity is high
5. code is compact

Do not optimize code size at the expense of maintainability or semantics.
