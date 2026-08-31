# Architecture

## Recommended pipeline

```text
Penpot selection
    |
    v
Penpot extractor (plugin.ts boundary)
    |
    v
Normalized IR (serializable TypeScript)
    |
    +--> diagnostics
    +--> asset requests
    |
    v
Flutter generator (pure TypeScript)
    |
    +--> widget.dart
    +--> generated_theme.dart (optional)
    +--> asset manifest
    |
    v
Formatter / validation
    |
    v
Preview + copy/export UI
```

## Why an IR is mandatory

Penpot and Flutter model layout differently. Directly rendering raw Penpot nodes into Dart spreads Penpot-specific assumptions throughout the generator and makes testing difficult. A normalized IR creates a stable contract for extraction, heuristics, warnings, code generation, and future targets.

## Suggested project structure

```text
src/
  plugin.ts
  main.ts
  messages.ts
  extractor/
    extractSelection.ts
    extractNode.ts
    extractLayout.ts
    extractStyle.ts
    extractText.ts
  ir/
    types.ts
    diagnostics.ts
  flutter/
    generateWidget.ts
    generateLayout.ts
    generateDecoration.ts
    generateText.ts
    naming.ts
    dartWriter.ts
  assets/
    collectAssets.ts
    names.ts
  ui/
    state.ts
    render.ts
  tests/
    fixtures/
    extractor.test.ts
    generator.test.ts
public/
  manifest.json
```

Adapt to the starter template rather than forcing this exact tree if the repository uses another organization.

## Message protocol

Use discriminated unions, e.g. commands such as:
- `REQUEST_SELECTION`
- `SELECTION_CHANGED`
- `GENERATE_FLUTTER`
- `GENERATION_RESULT`
- `GENERATION_FAILED`
- `COPY_RESULT`
- `EXPORT_BUNDLE`

Keep messages serializable. Never send live Penpot objects into the iframe.

## Suggested IR sketch

```ts
type IrNode =
  | IrContainer
  | IrText
  | IrShape
  | IrImage
  | IrVector;

interface IrBase {
  id: string;
  name: string;
  visible: boolean;
  width: number;
  height: number;
  opacity: number;
  rotation: number;
  position?: IrPosition;
  style?: IrStyle;
  diagnostics?: Diagnostic[];
}

interface IrContainer extends IrBase {
  kind: 'container';
  layout: IrFlexLayout | IrGridLayout | IrStackLayout | IrFreeLayout;
  children: IrNode[];
}
```

The exact shape may evolve, but generator code should depend on the IR, not Penpot types.

## Selection strategy

Default to `penpot.selection` for focused exports. Listen to selection changes so the UI can update without reopening the plugin. If no selection exists, show an actionable empty state rather than automatically exporting an entire file.

A future whole-page mode may use `currentPage`, but it should be a deliberate mode because project-wide generation creates naming, component, asset, and performance concerns.

## Security and permissions

Use least privilege. Conversion should not mutate the Penpot document. Avoid write permissions unless a requested feature needs them. Treat download/export permissions as capability-specific and verify current Penpot documentation before adding them.
