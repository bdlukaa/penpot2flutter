---
name: penpot-to-flutter
description: Design, implement, review, test, or evolve the Penpot to Flutter design-handoff compiler. Use for Penpot Plugin API extraction, serializable IR, components, variants, tokens/themes, shared libraries, typography, assets, explicit layout/responsiveness, prototype metadata/callbacks, deterministic Flutter generation, JSON handoff bundles, diagnostics, and codegen validation. Do not use it to invent application architecture or semantics absent from Penpot.
disable-model-invocation: false
---

# Penpot to Flutter

## Goal

Build a deterministic design-handoff compiler, not an application generator.

Use this product rule for every decision:

> Compile what Penpot knows. Preserve what Penpot says. Do not infer what Penpot cannot know.

The output accelerates Flutter implementation by handing off reusable design-system code, visual compositions, assets, and prototype integration hints. Flutter developers retain ownership of application behavior and architecture.

## Start every task this way

1. Inspect the existing repository and trace the affected pipeline end to end.
2. Classify the requested output as reusable design-system code, a design composition, prototype metadata, or developer-owned application logic.
3. Reject scope that asks Penpot data to define business logic, state, application routing, localization architecture, accessibility policy, or other absent semantics.
4. Verify current `@penpot/plugin-types` and Flutter APIs before relying on version-sensitive behavior.
5. Extend the existing source snapshot, IR, registries, generators, export, and diagnostics rather than creating a parallel system.
6. State supported behavior, explicit fallbacks, and limitations.

Read:

- `references/architecture.md` for ownership and pipeline boundaries.
- `references/flutter-mapping.md` for explicit Penpot-to-Flutter mappings.
- `references/quality-gates.md` for validation and acceptance criteria.
- `references/master-prompt.md` for a reusable implementation brief.

## Product boundary

### Designer-owned source

Penpot is authoritative for tokens, themes, typography, assets, components, variants, libraries, explicit overrides, explicit Flex/Grid/absolute layout, styling, board compositions, and explicit prototype data.

### Generated handoff

The compiler owns deterministic Flutter representation, source traceability, generated assets, manifests, diagnostics, and these three authority tiers:

1. **Reusable design-system code** — components, variants, tokens, themes, typography, assets, and shared-library modules.
2. **Design compositions** — board-based implementation references or helpers, not complete production screens.
3. **Prototype metadata** — destinations, flows, interactions, and callbacks, not application routing.

### Developer-owned application

Do not generate or infer:

- application/feature architecture
- domain models or business logic
- state management, async loading, persistence, authentication, or authorization
- routing policy, route guards, deep links, or app shells
- form validation or undesigned runtime states
- localization architecture
- accessibility decisions not explicitly represented
- runtime responsiveness beyond explicit design information
- analytics or platform adaptation

## Compiler pipeline

```text
Penpot Plugin API
-> serializable source snapshot
-> normalized JSON-serializable IR
-> component / variant / token / library registries
-> Flutter generators
-> deterministic files + assets + diagnostics
```

Keep all live `penpot` access in `src/plugin.ts`. The iframe receives typed serializable messages only. The Flutter generator must consume IR, never live Penpot objects.

## IR requirements

The IR must be deterministic, JSON-serializable, and free of Penpot classes, DOM nodes, functions, circular references, and application-level assumptions.

Preserve explicit identity where available:

- source node ID and path
- component and variant identity
- library ID and scope
- token ID, set ID, theme identity, and semantic binding
- asset source ID and content hash
- prototype interaction, flow, and destination IDs

Represent explicit layout, sizing, position, style, text runs, assets, transforms, clipping, interactions, unsupported semantics, and diagnostics.

## Generation rules

Prefer direct Flutter widgets over a proprietary runtime:

- horizontal Flex -> `Row`
- vertical Flex -> `Column`
- supported Grid -> structural Flutter grid
- absolute layout -> `Stack` + `Positioned`
- explicit fill sizing -> `Expanded`/`Flexible` where valid
- fixed sizing -> `SizedBox`/constraints
- padding -> `Padding`
- rotation -> `Transform.rotate`
- clipping -> corresponding clip widget only when explicit
- vector/path -> deterministic SVG or raster asset strategy

When no explicit Flex or supported Grid semantics exist, preserve fixed/absolute source structure. Never infer Row/Column/Grid from geometry.

Generated source must be deterministic, readable, valid Dart, and traceable to source IDs. Do not silently drop visible content.

## Components, variants, tokens, and libraries

Generate one public Flutter widget per canonical Penpot component. Instances should invoke it rather than duplicate its internals. Expose conservative typed parameters only when source semantics support them.

Variant membership and selected values must remain explicit. Never derive variants from text, visual differences, or naming patterns when Penpot has not declared a variant relationship.

Preserve token identity separately from resolved literals. Do not create tokens from repeated values. Preserve complete token catalogs and map Material roles only from explicit semantic names.

Key shared libraries by stable Penpot library ID. Generate reachable shared modules once. Keep the plugin read-only; do not connect libraries automatically.

## Explicit-only responsiveness

Responsive behavior requires explicit evidence:

- explicit responsive metadata, including bounds when a runtime resolver is wanted; or
- exact semantic board-family naming used to group separate Mobile/Tablet/Desktop design compositions.

Never derive breakpoints from canvas width, geometry, orientation, or device assumptions. Never merge structurally different boards into an invented adaptive tree.

Generate separate compositions when bounds are absent. Generate a convenience `LayoutBuilder` resolver only when explicit min/max bounds are complete.

## Prototype policy

Preserve Penpot destinations, flows, triggers, actions, overlays, animation metadata, URLs, and stable IDs. Generated components/compositions may expose `onPrototypeInteraction`.

Do not select or generate an application router, navigation architecture, deep-link strategy, route guards, or app shell. Prototype output is integration metadata and callbacks only.

## Generated ownership and export

Generator-owned roots are:

```text
lib/generated/penpot/
assets/penpot/
```

Regeneration may replace both trees. Never merge developer edits into them.

The current complete export is `penpot_handoff.json`, not a ZIP. It contains generated files, text/base64 assets, `pubspec.yaml` integration metadata, and font requirements. `bin/install-handoff.mjs` validates paths, replaces the two generator-owned trees, writes files/assets, and prints manual integration steps. It must not modify developer-owned application files or `pubspec.yaml` automatically.

## Diagnostics and recommendations

Use:

- `error` for invalid or unsafe generated output;
- `warning` for unsupported, missing, or lossy semantics;
- `info` for deterministic implementation decisions;
- `design-recommendation` for non-blocking source improvements.

Recommendations must never block export or alter generated semantics. Prefer a diagnostic over guessing.

## Testing workflow

Test the compiler layers independently:

1. Penpot-like serializable source -> normalized IR.
2. IR/registries -> deterministic files and assets.
3. JSON handoff -> safe installation into generator-owned roots.
4. Representative generated Dart -> format/analyze/widget tests when Flutter tooling is available.

Cover components, variants, tokens/themes, shared libraries, typography, assets, explicit Flex/Grid/absolute layout, explicit responsive metadata, design compositions, prototype callbacks/metadata, diagnostics, deterministic regeneration, and path traversal rejection.

Do not test or require invented application behavior.

## Required task output

When modifying the project, report:

- changed files;
- the authority tier affected;
- supported behavior and limitations;
- commands actually run and their results;
- any target-project integration step.

Do not claim validation that was not run.
