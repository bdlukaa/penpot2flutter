import type { TokenCatalogStats } from "../penpot/token-catalog.js";
import type { Diagnostic, GeneratedFile } from "./ir.js";

export interface RequestConversionMessage {
  readonly source: "penpot-to-flutter";
  readonly type: "request-conversion";
}

export type UiToPluginMessage = RequestConversionMessage;

export interface TokenBindingStats {
  readonly colors: number;
  readonly spacing: number;
  readonly typography: number;
  readonly radius: number;
  readonly other: number;
}

export interface ConversionMessage {
  readonly source: "penpot-to-flutter";
  readonly type: "conversion";
  readonly selectionCount: number;
  readonly tokenCatalog: TokenCatalogStats;
  readonly tokenCatalogDiagnostics: readonly Diagnostic[];
  readonly tokenBindings: TokenBindingStats;
  readonly result?: { readonly diagnostics: readonly Diagnostic[] };
  readonly dart?: string;
  readonly pubspecAssets?: string;
  /** Selection-specific files plus the merged penpot.dart barrel. */
  readonly files?: readonly GeneratedFile[];
  /** Stable catalog-derived files, sent once and cached by the iframe. */
  readonly designSystemFiles?: readonly GeneratedFile[];
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
