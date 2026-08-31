# Master prompt: build Penpot to Flutter

You are a senior TypeScript, Penpot Plugin API, compiler/code-generation, and Flutter engineer. Build a production-quality Penpot plugin named **Penpot to Flutter** that converts selected Penpot designs into readable, maintainable Flutter/Dart UI code.

## Primary goal

Create a real working plugin, not a conceptual demo. The plugin must read the current Penpot selection, normalize the design into a framework-neutral intermediate representation (IR), generate idiomatic Dart widgets, show the generated code in the plugin UI, and allow the result to be copied/exported.

Optimize in this order:
1. generated Dart compiles;
2. layout semantics are correct;
3. generated code is readable/editable;
4. visual fidelity is high;
5. output is compact.

## Non-negotiable architecture

Use this compiler-style pipeline:

`Penpot selection -> Penpot extractor -> normalized serializable IR -> Flutter generator -> formatter/validator -> preview/export`

Do NOT generate Flutter directly from raw Penpot objects throughout the codebase.

Use TypeScript and the current official Penpot plugin starter conventions unless the existing repository already has a suitable setup. Keep all Penpot-global access in `plugin.ts` or the Penpot execution boundary. The iframe UI must communicate with it via typed serializable messages.

Before coding, verify the current official documentation for:
- Penpot plugin creation and manifest format;
- `@penpot/plugin-types`;
- selection and selection-change APIs;
- board/group/shape properties;
- flex/grid layout properties;
- fills, strokes, shadows, text, images, exports and libraries/tokens as needed;
- current Flutter/Dart APIs used by generated code.

Do not rely on stale examples when current documentation disagrees.

## MVP behavior

The initial plugin must:
- read `penpot.selection`;
- show a useful empty state when there is no selection;
- react to selection changes;
- support one selected root cleanly and multiple selected roots through a synthetic wrapper;
- recursively extract the selected node tree;
- generate a Dart widget preview;
- provide Copy Dart;
- surface conversion warnings;
- support an export bundle if it can be implemented safely with current Penpot browser/plugin capabilities.

## Required conversion coverage

Implement, test, and document:
- boards/groups/containers;
- Penpot flex row/column;
- fill/auto/fixed sizing semantics;
- padding and gaps;
- alignment;
- basic grid layout with a documented fallback for unsupported grid semantics;
- absolute-positioned children using `Stack`/`Positioned` fallback;
- rectangles;
- ellipses;
- text, including typography and rich text where the API exposes mixed runs;
- solid fills and opacity;
- linear/radial gradients where equivalent;
- strokes/borders;
- corner radii;
- shadows;
- rotation/transforms where practical;
- clipping;
- images/assets;
- visibility and z-order.

For arbitrary vectors/paths, prefer generating an exported SVG/image asset reference rather than producing unreadable painter code. Emit a warning whenever conversion is approximate or unsupported.

## IR requirements

Create serializable TypeScript IR types. Include a stable source ID and normalized name on every node. Represent layout, size, position, style, text, assets, transforms and diagnostics explicitly.

The IR must contain no Penpot class instances, functions, DOM nodes, or circular references and must be JSON-serializable for debugging/tests.

## Flutter generation policy

Generate idiomatic Flutter rather than absolute-positioning everything.

Prefer mappings such as:
- flex row -> `Row`;
- flex column -> `Column`;
- fill child in a Flex -> `Expanded`/`Flexible` where semantically correct;
- fixed size -> `SizedBox`/constraints;
- padding -> `Padding`;
- decoration -> `Container`/`DecoratedBox` + `BoxDecoration`;
- text -> `Text` or `RichText`;
- absolute child -> `Stack` + `Positioned`;
- rotation -> `Transform.rotate`;
- clipping -> Flutter clip widgets only where required.

Avoid redundant wrappers. Generate valid Dart identifiers from Penpot layer names. Keep output deterministic.

If emitted code needs a third-party Flutter package (for example SVG rendering), make the dependency explicit and generate/update the relevant `pubspec.yaml` snippet in the exported bundle.

## Assets

Use deterministic filenames and track all generated/exported assets in an asset manifest. Do not inline large binary blobs into Dart source. Generate the Flutter asset declaration snippet needed by the output.

## Diagnostics

Never silently drop unsupported properties. Collect node-level diagnostics and show a summary in the UI. Examples:
- complex vector exported as SVG;
- unsupported blend mode ignored;
- complex grid approximated;
- font unavailable in Flutter target;
- unsupported effect omitted.

Differentiate warning vs error.

## Tests

Create test fixtures that cover at least:
1. nested row/column;
2. flex fill vs fixed sizing;
3. padding and gaps;
4. absolute badge inside a container;
5. text style and line height;
6. border/radius/shadow;
7. image asset;
8. clipping;
9. simple grid;
10. unsupported feature diagnostics.

Test separately:
- Penpot-like source -> IR;
- IR -> Dart source;
- representative generated Dart -> formatter/analyzer/compile where Flutter tooling is available.

Use deterministic snapshot/golden tests plus targeted structural assertions.

## Development sequence

Work in vertical slices. Do not implement every Penpot feature before proving the pipeline.

Phase 1:
- bootstrap/inspect project;
- valid manifest;
- open plugin UI;
- typed message protocol;
- read/display current selection.

Phase 2:
- IR types;
- Board/Rectangle/Text extraction;
- minimal compilable Dart widget;
- preview + copy.

Phase 3:
- flex layouts;
- decoration;
- typography;
- diagnostics.

Phase 4:
- images/assets/export;
- grid;
- absolute fallback;
- clipping/transforms.

Phase 5:
- tests, generated-Dart validation, documentation and deployment instructions.

Only after the MVP is stable, design Phase 6 for:
- Penpot components -> reusable Flutter widgets;
- variants -> typed parameters/enums;
- Penpot design tokens -> generated Flutter theme/tokens;
- responsive variants/breakpoints;
- whole-page/project export;
- incremental regeneration.

## Permissions

Use least privilege. Conversion should start read-only. Add manifest permissions only when a specific implemented capability needs them and explain each one. Do not request content write access simply because examples include it.

## Required outputs from you

At each implementation milestone, provide:
- updated repository tree;
- complete contents of important new files;
- precise modifications to existing files;
- commands actually used to build/test;
- test/build results;
- what to test manually inside Penpot;
- known limitations and next milestone.

Do not say something is tested unless the command was actually executed successfully.

## First task

Start by inspecting the existing repository if one is provided. If none exists, bootstrap from the current official Penpot plugin starter template conventions. Implement Phase 1 and the smallest Phase 2 vertical slice so that selecting a simple Penpot board containing a rectangle and text produces a valid Dart widget in the plugin preview.
