# AGENTS.md

## Project Identity

This repository contains **Penpot to Flutter**, a design-handoff compiler that converts explicit Penpot design semantics into deterministic Flutter code and assets.

This project is **not** an application generator, no-code platform, low-code platform, or FlutterFlow replacement.

The core product goal is:

> Help designers hand off themes, tokens, typography, assets, components, variants, libraries, and visual compositions to Flutter developers quickly and repeatably.

The generator should accelerate implementation. It should not attempt to infer application architecture, business logic, state management, data models, complex navigation, or behavior that Penpot does not explicitly describe.

## Product Principle

Use this rule for every implementation decision:

> **Do not make the generator smarter than the source.**

And this more precise rule:

> **Compile what Penpot knows. Preserve what Penpot says. Do not infer what Penpot cannot know.**

When source structure is poor, preserve it faithfully and emit diagnostics. Do not guess a better application implementation.

## Ownership Boundary

### Designer-owned source

Penpot is authoritative for:

- design tokens
- token themes
- typography
- visual assets
- components
- component instances
- variants
- explicit component overrides
- shared libraries
- explicit Flex layouts
- explicit Grid layouts
- explicit absolute positioning
- explicit sizing and alignment
- visual styling
- top-level board compositions
- explicit prototype destinations and simple interactions

### Generated handoff layer

The compiler owns:

- deterministic Flutter representation of explicit Penpot semantics
- generated design-system code
- generated component APIs
- generated variant APIs
- generated token/theme APIs
- generated assets
- generated visual compositions
- diagnostics
- source traceability
- export manifests
- deterministic file output

### Developer-owned application layer

The Flutter developer owns:

- application architecture
- feature architecture
- domain models
- business logic
- state management
- async loading
- API integration
- persistence
- authentication
- authorization
- form validation
- complex navigation architecture
- route guards
- deep links
- analytics
- localization architecture
- platform adaptation
- accessibility decisions not explicitly represented by the design
- runtime responsive behavior beyond explicit design information
- complex animations
- error/loading/empty states not explicitly designed
- production application composition

Do not generate these unless the repository later adds an explicit, opt-in specification outside Penpot.

## Compiler Pipeline

Preserve the compiler architecture:

```text
Penpot Plugin API
→ serializable source snapshot
→ normalized IR
→ component / variant / token / library registries
→ Flutter generators
→ deterministic generated files + assets + diagnostics
```

The Flutter generator must not consume live Penpot objects directly.

`src/plugin.ts` remains the Penpot API boundary.

The UI receives typed, JSON-serializable messages only.

## Generation Confidence Tiers

Treat generated artifacts differently according to their semantic authority.

### Tier 1 — Reusable design-system code

High-confidence, designer-owned generated output:

- tokens
- themes
- typography
- assets
- components
- variants
- shared-library modules

These are intended to be imported directly by application developers.

Example:

```text
lib/generated/penpot/
  theme/
  components/
  libraries/
  assets.dart
```

### Tier 2 — Design compositions

Medium-confidence generated output:

- screens
- boards
- page compositions
- responsive board variants

These are **implementation references or composition helpers**, not authoritative production application screens.

Prefer names and documentation that reflect this distinction.

For example:

```text
screens/home_design.dart
screens/checkout_design.dart
```

or equivalent repository conventions.

A generated screen composition may be imported directly if useful, copied, adapted, or used as a visual reference.

Do not claim it is a complete production screen implementation.

### Tier 3 — Prototype metadata

Low-authority integration hints:

- simple navigation targets
- prototype links
- overlay relationships
- flow metadata

Preserve these as metadata, callbacks, destination enums, or optional helpers.

Do not turn prototype links into a complete application routing architecture.

## Core Architecture Rules

### Penpot boundary

Keep all `penpot` access inside the plugin execution context.

Do not pass live Penpot classes, DOM nodes, or functions across the iframe boundary.

### IR

The IR must be:

- JSON-serializable
- deterministic
- free of Penpot class instances
- free of DOM elements
- free of functions
- free of circular references

Preserve explicit source identity wherever possible:

- node ID
- component ID
- library ID
- token ID
- token set ID
- variant identity
- source path
- source name

### No semantic guessing

Do not infer:

- business meaning
- domain entities
- state machines
- data sources
- application routes
- pagination
- loading behavior
- empty states
- validation
- form models
- scroll ownership
- responsive behavior not explicitly represented
- semantic accessibility roles without explicit evidence
- localization architecture

If required information is absent, either:

1. preserve the source representation literally;
2. expose a generic integration point;
3. emit a diagnostic.

## Flutter Generation Philosophy

Prefer direct Flutter widgets over a proprietary runtime.

Good:

```dart
Row(...)
Column(...)
Stack(...)
Positioned(...)
Text(...)
DecoratedBox(...)
SvgPicture.asset(...)
```

Avoid introducing exporter-specific runtime abstractions unless they materially improve the handoff contract and are explicitly justified.

### Explicit layout mapping

When Penpot explicitly defines:

```text
horizontal flex
→ Row

vertical flex
→ Column

grid
→ Flutter grid representation where supported

absolute positioning
→ Stack + Positioned

fill sizing
→ Expanded/Flexible when the semantics are explicit

fixed sizing
→ SizedBox / constraints

padding
→ Padding

rotation
→ Transform.rotate

clipping
→ ClipRect / ClipRRect / ClipOval as appropriate
```

Do not reinterpret an absolute layout as Flex because it "looks like" a row.

Do not reinterpret a fixed design into a responsive layout unless the responsive relationship is explicit.

## Components

Components are one of the highest-value generated artifacts.

Treat the generated component API as the primary designer/developer contract.

A canonical Penpot component should generate one reusable Flutter widget.

Instances should generate widget invocations, not duplicated internal trees.

Example:

```dart
ProductCard(
  variant: ProductCardVariant.raven,
  title: 'Raven',
  priceLabel: 'from €23.95',
)
```

Prefer semantic public APIs.

### Component API naming

Use this priority:

1. explicit code-generation metadata
2. Penpot component property or variant-axis name
3. semantic layer name
4. conservative structural role
5. stable generic source-ID-based fallback

Do not normally derive public parameter names from literal text content.

Bad:

```dart
from2095
paris
```

Prefer:

```dart
priceLabel
title
```

when source semantics support that interpretation.

If semantics are uncertain, use a neutral stable name rather than inventing domain meaning.

### Overrides

Support explicit, meaningful component overrides.

Prefer conservative typed parameters such as:

- `String`
- `Color`
- `bool`
- `double`
- `Widget`
- enums

Do not expose every pixel difference as a public constructor parameter.

## Variants

A Penpot variant family should generate one public Flutter widget API whenever it represents one conceptual component.

Variant selection must remain explicit.

Do not infer selected variants from text or styling differences.

Example:

```dart
ProductCard(
  variant: ProductCardVariant.raven,
)
```

Variant-specific defaults must remain internally consistent.

Do not use family-wide constructor defaults that are incorrect for non-default members.

Variant internals may use:

- shared structure + typed variant spec
- private builders
- full subtree switches when structures genuinely diverge

Optimize for readable generated code, but never collapse distinct source semantics incorrectly.

## Design Tokens and Themes

Preserve token identity.

A token reference is not the same as its resolved literal.

Generated code should use token/theme APIs where Penpot explicitly binds a value to a token.

Good:

```dart
context.penpot.colors.primary
```

Do not invent tokens based only on repeated literals.

Repeated raw colors or typography may produce design recommendations, but must not silently become semantic tokens.

Token themes may generate:

- `ThemeExtension`
- `ThemeData`
- typed nested namespaces
- semantic theme accessors

Preserve the complete token catalog even when only part maps cleanly to Material roles.

## Typography

Generate reusable typography styles when Penpot explicitly provides repeatable typography semantics.

Preserve:

- family
- fallback metadata
- size
- weight
- style
- line height
- letter spacing
- alignment
- decoration
- mixed spans

Do not pretend external fonts are bundled when Penpot cannot provide them.

Emit clear font requirements.

## Assets

Use a deterministic asset pipeline.

Prefer:

```text
simple Flutter primitive
→ native widget

vector
→ SVG asset when appropriate

complex visual
→ SVG or raster export

photo
→ raster asset
```

Use content-hash deduplication.

Use semantic or source-stable names where possible.

Do not silently drop visible assets.

Unresolved visual content should preserve appearance where possible and emit diagnostics.

## Shared Libraries

Preserve stable library identity.

Use Penpot library IDs, not display names alone.

Generate one reusable Flutter module per reachable shared library.

Do not duplicate shared component implementations into every screen.

The plugin remains read-only by default.

Do not automatically connect unavailable libraries if doing so mutates the Penpot document.

## Screens and Boards

Treat top-level boards as **design compositions**, not production application screens.

The compiler may generate:

```dart
HomeDesign
CheckoutDesign
ProductsDesign
```

or equivalent naming.

These outputs should communicate:

- visual hierarchy
- component usage
- variant selection
- token usage
- spacing
- assets
- approximate composition

They do not need to solve:

- production scrolling architecture
- state ownership
- data loading
- navigation architecture
- application shell structure
- runtime business behavior

### Poor source structure

If a board contains hundreds of absolute nodes, generated output may legitimately use `Stack` and `Positioned`.

Do not "fix" the source by guessing Flex or responsive behavior.

Instead, emit a design recommendation.

## Responsive Design

Support responsive behavior only when explicit.

Examples of acceptable explicit evidence:

- `Screen / Mobile`
- `Screen / Tablet`
- `Screen / Desktop`
- explicit generation metadata
- explicit Penpot layout semantics

Do not reverse-engineer breakpoint behavior from arbitrary geometry.

If multiple explicit responsive boards exist, generate separate design compositions and optionally a small deterministic convenience resolver.

Do not infer device semantics from canvas dimensions alone.

## Navigation and Prototype Interactions

Treat Penpot prototype links as integration hints.

Prefer generated metadata or callbacks.

Example:

```dart
enum PenpotDestination {
  home,
  all,
  trending,
}
```

or:

```dart
Navigation(
  onNavigate: onNavigate,
)
```

Do not hard-code reusable components to:

- `Navigator`
- `go_router`
- `auto_route`
- app-specific route classes

Application routing belongs to developer-owned code.

A simple optional navigation helper may exist, but it must be clearly separate from the reusable component layer.

## Generated Output Ownership

Use a hard ownership boundary.

Recommended:

```text
lib/generated/penpot/
assets/penpot/
```

Everything inside these directories is generator-owned.

Developers should not manually edit generated files.

Application code should live elsewhere:

```text
lib/app/
lib/features/
lib/core/
```

Do not build a complex AST merge system to preserve developer edits inside generated files.

Regeneration should be allowed to replace the generated tree entirely.

Deterministic output and Git diffs are more important than source merging.

## Export Strategy

Production handoff should support exporting the complete generated tree.

Prefer:

```text
lib/generated/penpot/
assets/penpot/
penpot_manifest.json
pubspec integration metadata
```

A ZIP bundle and/or companion CLI is appropriate.

The project integration workflow must preserve developer-owned files.

## Diagnostics Philosophy

Diagnostics are more important than semantic guessing.

The compiler should tell users when the source design will produce poor or limited Flutter output.

Do not silently redesign the source.

### Developer-facing diagnostics

Examples:

- invalid generated Dart
- unresolved shared component
- missing library
- missing font
- failed SVG export
- unsupported Penpot feature
- token resolution failure

### Designer-facing recommendations

Examples:

- repeated literal colors without tokens
- repeated typography without tokens
- many absolute-positioned children
- repeated structure not represented as a component
- detached component instance
- poor layer naming
- missing responsive board family
- component overrides that cannot become meaningful parameters

Designer recommendations must never block export.

They must never change generated semantics automatically.

## Diagnostic Severity

Use categories such as:

- error
- warning
- info
- design recommendation

Resolved implementation details such as deterministic asset renames should normally be info, not high-priority warnings.

Group repeated low-severity diagnostics.

Prioritize visible data loss and invalid generated code.

## Correctness Boundary

The generator is still responsible for valid generated source.

Even though screen compositions are not production-ready application code, generated Dart must remain syntactically valid and internally consistent.

The generator must guarantee, where its validation environment allows:

- correct Dart syntax
- correct imports
- correct const propagation
- correct variant selection
- deterministic identifiers
- valid asset paths
- valid cross-file references

Do not confuse "not a production app generator" with permission to emit broken Dart.

## Testing Strategy

Test compiler correctness, not invented application behavior.

### Layer 1

```text
Penpot-like source
→ normalized IR
```

### Layer 2

```text
IR
→ deterministic Dart/assets
```

### Layer 3

Where Flutter tooling is available:

```text
generated handoff package
→ dart format
→ flutter analyze
→ targeted widget tests
```

Test:

- components
- variants
- tokens
- themes
- typography
- assets
- libraries
- explicit Flex/Grid
- explicit absolute layouts
- design compositions
- prototype metadata
- diagnostics
- deterministic regeneration

Do not create tests that require the compiler to infer application semantics absent from Penpot.

## Generated Screen Testing

Screen composition tests should validate:

- source structure is preserved
- correct component calls are used
- correct variants are selected
- correct tokens are referenced
- correct assets are referenced
- generated Dart compiles

They do not need to prove that the screen is a complete production application page.

## Development Priorities

Prioritize work in this order:

1. component API quality
2. variant correctness
3. token/theme fidelity
4. shared-library fidelity
5. typography and font requirements
6. asset correctness
7. deterministic full-project export
8. designer-facing diagnostics
9. design-composition output
10. prototype/navigation metadata
11. fast deterministic regeneration

Deprioritize:

- automatic application architecture
- state generation
- domain model generation
- complex navigation
- inferred responsive behavior
- inferred accessibility architecture
- inferred localization architecture
- application-level form behavior
- automatic business logic
- no-code runtime systems

## Change Discipline

Before editing:

1. inspect existing architecture;
2. identify whether the feature belongs to designer-owned generated code, design composition, prototype metadata, or developer-owned application logic;
3. reject scope creep into application generation;
4. extend existing IR/registries/generators rather than creating parallel systems.

While editing:

- keep changes focused;
- preserve determinism;
- preserve source identity;
- prefer explicit source semantics;
- do not hide unsupported behavior;
- do not guess absent semantics;
- do not introduce proprietary runtime abstractions without strong justification.

After editing:

1. run TypeScript checks;
2. run lint;
3. run tests;
4. run build;
5. validate representative generated Dart when Flutter tooling is available;
6. report limitations accurately.

## Definition of Done

A feature is complete when:

- explicit Penpot semantics are preserved;
- generated public APIs are stable and meaningful;
- output is deterministic;
- unsupported behavior is diagnosed;
- no developer-owned application semantics are invented;
- generated Dart is internally valid;
- documentation reflects whether the output is reusable design-system code, a design composition, or prototype metadata.

## Product Definition

Penpot to Flutter is successful when this workflow is fast and reliable:

```text
Designer updates Penpot
→ generator refreshes design-system code and compositions
→ developer sees a clear deterministic diff
→ developer imports updated tokens/components/assets
→ developer adapts application-owned logic as needed
```

The goal is not:

```text
Penpot
→ complete production Flutter application
```

The goal is:

```text
Penpot design system + visual compositions
→ high-quality Flutter handoff layer
→ developer-owned application implementation
```
