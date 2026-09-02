# Architecture

## Product architecture

Penpot to Flutter is a design-handoff compiler. It does not generate a production application.

```text
Designer-owned Penpot semantics
        |
        v
Penpot API boundary (`src/plugin.ts`)
        |
        v
Serializable source snapshot
        |
        v
Normalized JSON-serializable IR
        |
        +--> component / variant registries
        +--> token / theme / typography registries
        +--> shared-library registry
        +--> asset registry
        +--> prototype metadata
        +--> diagnostics and recommendations
        |
        v
Deterministic Flutter generators
        |
        +--> Tier 1 reusable design-system code
        +--> Tier 2 design compositions
        +--> Tier 3 prototype metadata/callbacks
        +--> manifest and integration metadata
        |
        v
`penpot_handoff.json`
        |
        v
`bin/install-handoff.mjs`
        |
        +--> `lib/generated/penpot/`
        +--> `assets/penpot/`
```

## Authority tiers

### Tier 1 — reusable design-system code

High-confidence output derived from designer-owned reusable semantics:

- components and explicit instance overrides
- variants and typed selectors
- tokens, token sets, token themes, and theme accessors
- typography
- asset declarations
- connected shared-library modules

This tier is intended for direct import by Flutter developers.

### Tier 2 — design compositions

Top-level boards and explicit responsive variants become visual composition helpers under `lib/generated/penpot/compositions/`.

They preserve source hierarchy, component calls, variants, tokens, assets, and explicit layout. They do not claim ownership of production screen architecture, data loading, scrolling policy, state, or runtime business behavior.

### Tier 3 — prototype metadata

Explicit Penpot destinations, flows, and interactions become metadata plus `onPrototypeInteraction` callbacks. This tier is an integration hint. It must not choose a routing framework or generate an application navigation architecture.

## Ownership boundary

### Designer-owned

Penpot controls tokens, themes, typography, visual assets, components, variants, connected libraries, explicit overrides, explicit Flex/Grid/absolute layout, visual styling, board compositions, and prototype data.

### Compiler-owned

The compiler controls deterministic normalization, registries, source identity, generated code/assets, authority labels, manifests, diagnostics, and JSON export.

### Developer-owned

Flutter application architecture, feature structure, domain models, business logic, state, async work, APIs, persistence, auth, routing, deep links, validation, localization, accessibility policy, analytics, and production composition remain outside the generated tree.

## Penpot boundary

Keep all access to the live `penpot` global in `src/plugin.ts`. Never transfer Penpot class instances, functions, DOM nodes, or circular objects to the iframe.

The UI and compiler communicate through typed serializable messages. The generator consumes normalized IR, not live Plugin API objects.

## Serializable source and IR

Preserve stable identity instead of replacing it with display-name guesses:

- node IDs
- component IDs
- variant family/member IDs
- library IDs and scope
- token IDs, set IDs, theme IDs, and semantic binding paths
- asset source IDs and hashes
- prototype destination, flow, and interaction IDs

The IR may evolve, but it must remain deterministic, serializable, and free of application semantics.

## Registry responsibilities

- **Component/variant registry:** canonical definitions, dependencies, explicit members, parameters, and stable generated names.
- **Token/theme registry:** identity, aliases, dependencies, sets, themes, resolved fallbacks, and semantic references.
- **Library registry:** stable library ownership and dependency edges; display names only influence deterministic module names.
- **Typography registry:** reusable styles and external-font requirements.
- **Asset registry:** deterministic project paths, type, dimensions, source ownership, hashes, and export payloads.
- **Prototype metadata:** explicit source interactions and flows without application routing policy.

Do not create a second extraction or generation pipeline for a feature that belongs in an existing registry.

## Layout architecture

Layout normalization records only explicit source semantics:

- Flex direction, sizing, gap, padding, alignment, and absolute children
- Grid tracks and placement where supported
- fixed/auto/fill sizing and min/max constraints
- explicit absolute coordinates and z-order
- clipping and transforms

If Flex/Grid semantics are absent, preserve the fixed/absolute structure. Geometry is data to preserve, not evidence from which to invent a different layout model.

## Explicit responsiveness

Related board compositions may be grouped through explicit metadata or exact semantic family naming. Canvas dimensions never become breakpoints.

Each variant retains its source subtree. A runtime resolver is optional and may be generated only when explicit min/max bounds are complete. Without those bounds, emit separate compositions and a recommendation rather than selecting thresholds.

## Prototype architecture

Prototype extraction preserves:

- destinations and flows
- source node IDs
- trigger and action kinds
- target IDs and URLs
- delay, scroll-preservation, animation, and overlay options

Generated widgets emit callbacks carrying this metadata. The application decides whether and how to navigate, display overlays, open URLs, or ignore the hint.

## Generated ownership

```text
lib/generated/penpot/
  components/
  compositions/
  libraries/
  theme/
  assets.dart
  prototype_destinations.dart
  penpot.dart
  penpot_manifest.json

assets/penpot/
```

Both roots are generator-owned and replaceable. Developer code must live outside them. Do not build source merging for edits inside generated files.

## JSON handoff

The current archive format is a JSON bundle:

```text
penpot_handoff.json
  formatVersion
  generatorVersion
  files[]
  assets[]
  integration.pubspecSnippet
  integration.fontRequirements[]
```

Assets are serialized as text or base64. A ZIP is not currently produced.

`bin/install-handoff.mjs` validates format version and path prefixes, removes existing generator-owned roots, writes the new files/assets, and prints integration metadata. It does not alter application files or merge `pubspec.yaml`.

## Diagnostics architecture

Diagnostics belong in extraction, normalization, registries, export, and generated-source validation. They must retain a source ID and stable code.

Use errors, warnings, information, and design recommendations distinctly. Recommendations are non-blocking and never transform source semantics.

## Security and permissions

Use least privilege. The implemented manifest uses `content:read` and `library:read`. Do not request write permissions for read-only handoff. Do not connect unavailable libraries automatically because connection mutates the Penpot document.
