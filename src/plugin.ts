import { extractSelection, type PenpotSourceShape, type PenpotSourceTextRun } from "./core/extractor.js";
import { generateFlutterWidget, generatePubspecSnippet } from "./core/flutter-generator.js";
import type { PluginToUiMessage } from "./shared/messages.js";

interface LiveTextRange {
  readonly fontFamily?: unknown;
  readonly fontSize?: unknown;
  readonly fontWeight?: unknown;
  readonly fontStyle?: unknown;
  readonly lineHeight?: unknown;
  readonly letterSpacing?: unknown;
  readonly textDecoration?: unknown;
  readonly fills?: unknown;
}

interface LiveTextShape extends PenpotSourceShape {
  readonly getRange?: (start: number, end: number) => LiveTextRange;
}

penpot.ui.open("Penpot to Flutter", `?theme=${penpot.theme}`, { width: 720, height: 640 });

function isUiToPluginMessage(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const message = value as { source?: unknown; type?: unknown };
  return message.source === "penpot-to-flutter" && message.type === "request-conversion";
}

function sendConversion(): void {
  const rawSelection = penpot.selection as unknown as readonly PenpotSourceShape[];
  const selection = rawSelection.map(enrichShape);
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
          pubspecAssets: generatePubspecSnippet(result.assets),
        }),
  };
  penpot.ui.sendMessage(message);
}

function enrichShape(shape: PenpotSourceShape): PenpotSourceShape {
  if (shape.type === "text") {
    const runs = textRunsOf(shape as LiveTextShape);
    return runs === undefined ? shape : { ...shape, runs };
  }
  const children = shape.children;
  return children == null || children.length === 0 ? shape : { ...shape, children: children.map(enrichShape) };
}

function textRunsOf(shape: LiveTextShape): readonly PenpotSourceTextRun[] | undefined {
  if (typeof shape.getRange !== "function") return undefined;
  if (!hasMixed(shape.fontFamily, shape.fontSize, shape.fontWeight, shape.fontStyle, shape.textDecoration)) return undefined;
  const characters = typeof shape.characters === "string" ? shape.characters : "";
  if (characters.length === 0) return undefined;
  try {
    const runs: PenpotSourceTextRun[] = [];
    for (let start = 0; start < characters.length; ) {
      const style = rangeStyleOf(shape.getRange(start, start + 1));
      let end = start + 1;
      while (end < characters.length && sameStyle(style, rangeStyleOf(shape.getRange(end, end + 1)))) end++;
      runs.push({ ...style, characters: characters.slice(start, end) });
      start = end;
    }
    return runs.length <= 1 ? undefined : runs;
  } catch {
    return undefined;
  }
}

function hasMixed(...values: readonly unknown[]): boolean {
  return values.some((value) => value === "mixed");
}

function rangeStyleOf(range: LiveTextRange): Omit<PenpotSourceTextRun, "characters"> {
  return {
    ...(range.fontFamily == null || range.fontFamily === "mixed" ? {} : { fontFamily: String(range.fontFamily) }),
    ...(range.fontSize == null || range.fontSize === "mixed" ? {} : { fontSize: String(range.fontSize) }),
    ...(range.fontWeight == null || range.fontWeight === "mixed" ? {} : { fontWeight: String(range.fontWeight) }),
    ...(range.fontStyle === "italic" ? { fontStyle: "italic" } : range.fontStyle === "normal" ? { fontStyle: "normal" } : {}),
    ...(range.lineHeight == null || range.lineHeight === "mixed" ? {} : { lineHeight: String(range.lineHeight) }),
    ...(range.letterSpacing == null || range.letterSpacing === "mixed" ? {} : { letterSpacing: String(range.letterSpacing) }),
    ...(range.textDecoration === "underline" || range.textDecoration === "line-through" ? { textDecoration: range.textDecoration } : {}),
    ...(range.fills === undefined || range.fills === "mixed" ? {} : { fills: range.fills as PenpotSourceTextRun["fills"] }),
  };
}

function sameStyle(a: Omit<PenpotSourceTextRun, "characters">, b: Omit<PenpotSourceTextRun, "characters">): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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
