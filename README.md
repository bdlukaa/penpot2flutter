# Penpot to Flutter

A Penpot plugin that generates readable Flutter widget source from the current selection.

## Current slice

This first vertical slice implements the compiler boundary:

```text
Penpot selection -> serializable IR -> Dart widget source -> iframe preview
```

Supported input:

- a selected board, rectangle, or text layer;
- nested board/group children, preserving their source order;
- solid `#RRGGBB` fills and fill opacity;
- board/shape geometry through a faithful `Stack`/`Positioned` fallback;
- common text content, font family, size, weight, line height, letter spacing, and alignment;
- selection changes, an empty selection state, multiple selection roots via a synthetic group, and copying generated Dart.

The plugin only requests `content:read`. It neither changes Penpot content nor downloads project files.

## Development

```sh
npm install
npm test
npm run build
npm run dev
```

`npm test` checks source-to-IR extraction, diagnostics, deterministic IR-to-Dart generation, and formats the emitted Dart with the installed Dart SDK. `npm run build` produces the installable plugin in `dist/`.

To try the plugin locally, start the dev server and install `http://localhost:4400/manifest.json` through Penpot’s Plugin Manager. The Vite server and preview server explicitly enable CORS and private-network preflight access because `design.penpot.app` is an HTTPS origin. Restart the existing dev process after changing `vite.config.ts`; only one process can listen on port 4400. If the hosted Penpot browser cannot access localhost because of its network/browser policy, expose port 4400 through an HTTPS tunnel or deploy `dist/` to an HTTPS host instead.

The official starter convention exposes `manifest.json` at the server root and emits `plugin.js` next to `index.html`.

## Manual verification

1. Create a 360×240 Penpot board with a filled rectangle and a text layer.
2. Select the board and open **Penpot to Flutter**.
3. Confirm the preview contains a `StatelessWidget`, a `Container`, `Positioned` children, the rectangle color, and the text style.
4. Change selection and confirm the preview updates. Clear the selection and confirm the empty state appears.
5. Use **Copy Dart** and paste the result into a Flutter project.

## Known limitations

This is deliberately the smallest end-to-end slice. It uses absolute `Stack` layout until flex/grid semantics are implemented. It does not yet convert padding/gaps, constraints/fill sizing, radius/borders/shadows, gradients, ellipses, clipping, transforms, images/assets, rich text ranges, or vectors. Unsupported shapes and fills produce visible warnings rather than being silently ignored. Asset export and download bundles are deferred, so no download permission is requested.

## Next milestone

Add flex extraction and Flutter `Row`/`Column` generation, then map padding, gaps, child sizing, and basic decoration while retaining the IR and generator boundary.
