import type { ConversionResult, GeneratedFile } from "./ir.js";

export interface RequestConversionMessage {
  readonly source: "penpot-to-flutter";
  readonly type: "request-conversion";
}

export type UiToPluginMessage = RequestConversionMessage;

export interface ConversionMessage {
  readonly source: "penpot-to-flutter";
  readonly type: "conversion";
  readonly selectionCount: number;
  readonly result?: ConversionResult;
  readonly dart?: string;
  readonly pubspecAssets?: string;
  readonly files?: readonly GeneratedFile[];
}

export type PluginToUiMessage = ConversionMessage;

export function isUiToPluginMessage(value: unknown): value is UiToPluginMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { source?: unknown }).source === "penpot-to-flutter" &&
    (value as { type?: unknown }).type === "request-conversion"
  );
}

export function isPluginToUiMessage(value: unknown): value is PluginToUiMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { source?: unknown }).source === "penpot-to-flutter" &&
    (value as { type?: unknown }).type === "conversion"
  );
}
