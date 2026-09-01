import type { TokenCatalogStats } from "../penpot/token-catalog.js";
import type { Diagnostic, GeneratedFile } from "./ir.js";

export interface RequestConversionMessage {
  readonly source: "penpot-to-flutter";
  readonly type: "request-conversion";
}

export interface RefreshDesignSystemMessage {
  readonly source: "penpot-to-flutter";
  readonly type: "refresh-design-system";
}

export type UiToPluginMessage = RequestConversionMessage | RefreshDesignSystemMessage;

export interface TokenBindingStats {
  readonly colors: number;
  readonly spacing: number;
  readonly typography: number;
  readonly radius: number;
  readonly other: number;
}

export interface ExportedAsset {
  readonly filename: string;
  readonly type: "svg" | "png" | "jpg" | "webp";
  readonly content: string;
  readonly encoding: "utf8" | "base64";
}

export interface ConversionMessage {
  readonly source: "penpot-to-flutter";
  readonly type: "conversion";
  readonly selectionCount: number;
  /** Selection was received; token-backed conversion is waiting for its shared index. */
  readonly pending?: boolean;
  readonly tokenCatalog: TokenCatalogStats;
  readonly tokenCatalogDiagnostics: readonly Diagnostic[];
  readonly tokenBindings: TokenBindingStats;
  readonly result?: { readonly diagnostics: readonly Diagnostic[] };
  readonly dart?: string;
  readonly pubspecAssets?: string;
  /** Exportable asset payloads. Binary payloads are base64 to keep the message serializable. */
  readonly exportedAssets?: readonly ExportedAsset[];
  /** Selection-specific files plus the merged penpot.dart barrel. */
  readonly files?: readonly GeneratedFile[];
  /** Stable catalog-derived files, sent once and cached by the iframe. */
  readonly designSystemFiles?: readonly GeneratedFile[];
}

export interface DesignSystemIndexMessage {
  readonly source: "penpot-to-flutter";
  readonly type: "design-system-index";
  readonly index: {
    readonly status: "idle" | "loading-metadata" | "indexing" | "ready" | "stale" | "error";
    readonly readiness: { readonly metadata: boolean; readonly selectionDependencies: boolean; readonly fullIndex: boolean };
    readonly metadata?: TokenCatalogStats;
    readonly progress?: { readonly processed: number; readonly total: number; readonly phase: "tokens" | "aliases" | "themes" | "bindings" };
    readonly diagnostics: readonly Diagnostic[];
    readonly timings: Readonly<Record<string, number>>;
    readonly error?: string;
  };
}

export type PluginToUiMessage = ConversionMessage | DesignSystemIndexMessage;

export function isUiToPluginMessage(value: unknown): value is UiToPluginMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { source?: unknown }).source === "penpot-to-flutter" &&
    ((value as { type?: unknown }).type === "request-conversion" ||
      (value as { type?: unknown }).type === "refresh-design-system")
  );
}

export function isPluginToUiMessage(value: unknown): value is PluginToUiMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { source?: unknown }).source === "penpot-to-flutter" &&
    ((value as { type?: unknown }).type === "conversion" ||
      (value as { type?: unknown }).type === "design-system-index")
  );
}
