# AGENTS.md

## Project

This repository contains **Penpot to Flutter**, a Penpot plugin that converts selected Penpot designs into readable, maintainable, and compilable Flutter/Dart UI code.

Use this compiler-style pipeline:

```text
Penpot Selection
→ Penpot Extractor
→ Normalized Intermediate Representation (IR)
→ Flutter Generator
→ Dart Formatting / Validation
→ Preview / Export
```

Do not generate Flutter directly from raw Penpot objects throughout the codebase.

## Priorities

Optimize decisions in this order:

1. Generated Dart compiles.
2. Layout semantics are correct.
3. Generated code is readable and editable.
4. Visual fidelity is high.
5. Generated output is reasonably compact.

Prefer working vertical slices over speculative abstractions.

## Technology

Use the repository's existing toolchain when present.

For a new implementation, prefer:

- TypeScript
- Vite
- current official Penpot plugin conventions
- `@penpot/plugin-types`
- Flutter/Dart for generated output

Before changing Penpot API integrations, verify the current official Penpot documentation. Before relying on Flutter behavior that may have changed, verify the current Flutter/Dart APIs.

## Architecture

### Penpot execution context

Keep access to the global `penpot` object inside the Penpot plugin execution context.

Do not pass live Penpot objects into the iframe UI. Convert them into typed, serializable data before crossing the message boundary.

### Intermediate Representation

The Flutter generator must consume the IR, not Penpot types.

IR objects must be:

- JSON serializable
- deterministic
- free of Penpot class instances
- free of DOM elements
- free of functions
- free of circular references

Each IR node should capture applicable properties such as:

- source Penpot ID
- semantic/sanitized name
- node type
- width and height
- visibility
- opacity
- rotation
- positioning
- layout
- child order
- padding
- gap
- sizing behavior
- alignment
- fills
- borders/strokes
- border radius
- shadows
- clipping
- text
- typography
- asset references
- diagnostics

### Flutter generation

Prefer semantic Flutter layouts over pixel-positioned output.

| Penpot | Flutter |
| --- | --- |
| Horizontal flex | `Row` |
| Vertical flex | `Column` |
| Fill flex sizing | `Expanded` / `Flexible` |
| Fixed sizing | `SizedBox` / constraints |
| Padding | `Padding` |
| Alignment | `Align`, `MainAxisAlignment`, `CrossAxisAlignment` |
| Styled rectangle | `Container` / `DecoratedBox` |
| Text | `Text` |
| Mixed text styles | `RichText` / `TextSpan` |
| Absolute positioning | `Stack` + `Positioned` |
| Rotation | `Transform.rotate` |
| Clipping | `ClipRect` / `ClipRRect` |

Do not use `Stack` + `Positioned` for every element.

When layout intent cannot be inferred reliably, prefer a faithful absolute-positioned fallback over an incorrect semantic guess.

Avoid unnecessary Flutter wrappers.

The same IR must always produce the same Dart output.

## MVP Scope

The first usable implementation should support:

- current Penpot selection
- selection-change events
- empty selection
- one selected root
- multiple roots through a synthetic parent
- recursive traversal
- Dart code preview
- Copy Dart action
- diagnostics and warnings

Initial design support should include:

- Board
- Group
- Rectangle
- Ellipse
- Text
- Flex layout
- basic Grid layout
- absolute positioning
- width and height
- fixed/fill/auto sizing
- padding
- gap
- alignment
- solid fills
- opacity
- gradients
- strokes
- border radius
- shadows
- rotation
- clipping
- images
- visibility
- child/z order

For complex vector content, prefer SVG or raster asset export over unreadable generated `CustomPainter` code.

## Diagnostics

Never silently discard unsupported Penpot features.

Unsupported or approximated behavior must produce a diagnostic associated with the source node when possible.

Use:

- `info`
- `warning`
- `error`

Examples include unsupported blend modes, approximated grids, unavailable fonts, unsupported effects, or vectors exported as assets.

## Plugin UI

At minimum, provide:

- current selection information
- Generate Flutter action
- generated Dart preview
- Copy Dart action
- diagnostics/warnings
- export controls when export exists

React to Penpot selection changes without requiring the plugin to be reopened.

Use typed message contracts between the Penpot execution context and iframe UI. Typical message concepts:

```text
REQUEST_SELECTION
SELECTION_CHANGED
GENERATE_FLUTTER
GENERATION_RESULT
GENERATION_FAILED
EXPORT_BUNDLE
```

Do not transfer live Penpot objects between contexts.

## Permissions

Follow least privilege.

The converter should be read-only by default. Request only permissions required by implemented features and document why each manifest permission exists.

Do not add write permissions just because examples use them.

## Assets

Do not embed large binary assets directly in Dart.

Use deterministic asset names and maintain an asset manifest.

When exporting assets, also generate the required Flutter `pubspec.yaml` declarations.

Preferred vector strategy:

1. SVG when appropriate
2. raster export when SVG is unsuitable
3. `CustomPainter` only when specifically justified

## Naming

Sanitize Penpot layer names into valid Dart identifiers.

Prefer meaningful semantic names over names such as `container1`, `widget2`, or `group3`.

Use compiler-oriented names internally, for example:

- `extractPenpotNode`
- `normalizeLayout`
- `IrNode`
- `FlutterEmitter`
- `emitTextWidget`

## Testing

Keep tests separated by compiler stage.

### Extraction

```text
Penpot-like fixture
→ IR
```

### Generation

```text
IR fixture
→ Dart source
```

### Validation

```text
Generated Dart
→ formatter / analyzer / Flutter compiler
```

Maintain fixtures for at least:

1. nested Row and Column
2. fill vs fixed flex sizing
3. padding and gaps
4. absolute badge overlay
5. text style and line height
6. border, radius and shadow
7. image
8. clipping
9. grid
10. unsupported-feature diagnostics

Use deterministic snapshot/golden tests plus targeted structural assertions.

When Flutter tooling is available, run:

```bash
dart format
flutter analyze
```

Run compilation tests where practical.

Never claim generated code was validated unless the relevant commands actually succeeded.

## Development Phases

### Phase 1 — Plugin foundation

Implement:

- manifest
- plugin startup
- UI shell
- typed message protocol
- selection reading
- selection-change handling

### Phase 2 — First compiler slice

Implement:

- IR
- Board extraction
- Rectangle extraction
- Text extraction
- Flutter generation

First end-to-end milestone:

```text
Select a Penpot board containing a rectangle and text
→ click Generate Flutter
→ receive valid Dart widget code in the plugin
```

### Phase 3 — Layout and styling

Add:

- Row
- Column
- sizing semantics
- padding
- gap
- alignment
- colors
- gradients
- borders
- radius
- shadows
- typography
- diagnostics

### Phase 4 — Advanced visuals

Add:

- images
- asset export
- Grid
- Stack/Positioned fallback
- clipping
- transforms
- vectors
- export bundle

### Phase 5 — Quality

Add:

- automated tests
- Dart formatting
- Flutter analysis
- fixture gallery
- documentation
- deployment instructions

### Post-MVP

Only after the core converter is stable, consider:

- Penpot Components → reusable Flutter widgets
- Penpot Variants → typed Dart parameters/enums
- Penpot Design Tokens → theme/token code
- responsive boards → responsive Flutter layouts
- whole-page conversion
- project-level export
- incremental regeneration

## Change Discipline

Before editing:

1. Inspect the relevant existing files.
2. Understand the current architecture.
3. Preserve working behavior unless the task explicitly changes it.
4. Extend existing abstractions instead of creating parallel systems.

While editing:

- keep diffs focused
- do not refactor unrelated code
- do not add dependencies without a clear need
- do not weaken type safety to make implementation easier
- do not suppress errors that should become diagnostics
- do not present placeholders as completed features

After editing:

1. Run relevant tests.
2. Run TypeScript checks, lint, and build if configured.
3. Run generator tests.
4. Run Dart/Flutter validation when applicable.
5. Report failures accurately.

## Agent Response Expectations

For implementation tasks, report:

1. what changed
2. important files added or modified
3. architectural decisions
4. commands/tests run
5. actual results
6. known limitations
7. next sensible milestone

Prefer implementing working code over long theoretical explanations.

If repository-specific conventions conflict with this file, preserve those conventions unless they undermine compiler architecture, correctness, or determinism.

## Definition of Done

A feature is complete only when:

- implementation exists
- relevant tests exist or were updated
- tests pass
- generated output remains deterministic
- unsupported behavior is surfaced through diagnostics
- documentation is updated when developer behavior changes

Minimum project-level success criterion:

> A user selects a simple Penpot board containing a rectangle and text, opens Penpot to Flutter, clicks Generate Flutter, and receives valid Flutter/Dart widget code in the plugin preview.
