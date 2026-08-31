import { extractSelection, type PenpotSourceShape } from "./core/extractor.js";
import { generateFlutterWidget, generatePubspecAssetsSnippet } from "./core/flutter-generator.js";
import type { PluginToUiMessage } from "./shared/messages.js";

penpot.ui.open("Penpot to Flutter", `?theme=${penpot.theme}`, { width: 720, height: 640 });

function isUiToPluginMessage(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const message = value as { source?: unknown; type?: unknown };
  return message.source === "penpot-to-flutter" && message.type === "request-conversion";
}

function sendConversion(): void {
  const selection = penpot.selection as unknown as readonly PenpotSourceShape[];
  const result = selection.length === 0 ? undefined : extractSelection(selection);
  const message: PluginToUiMessage = {
    source: "penpot-to-flutter",
    type: "conversion",
    selectionCount: selection.length,
    ...(result === undefined
      ? {}
      : {
          result,
          dart: generateFlutterWidget(result.root),
          pubspecAssets: generatePubspecAssetsSnippet(result.assets),
        }),
  };
  penpot.ui.sendMessage(message);
}

penpot.ui.onMessage<unknown>((message) => {
  if (isUiToPluginMessage(message)) {
    sendConversion();
  }
});

penpot.on("selectionchange", () => {
  sendConversion();
});

sendConversion();
