import type {
  Diagnostic,
  GradientFill,
  IrToken,
  IrTokenSet,
  IrTokenTheme,
  IrTokenType,
  IrTokenValue,
} from "../shared/ir.js";

export interface PenpotTokenSource {
  readonly id: string;
  readonly name: string;
  readonly type: IrTokenType | string;
  readonly value: unknown;
  readonly rawValue?: unknown;
  readonly aliasTargetId?: string;
  readonly setId?: string;
}

export interface PenpotTokenSetSource {
  readonly id: string;
  readonly name: string;
  readonly tokenIds: readonly string[];
}

export interface PenpotTokenThemeSource {
  readonly id: string;
  readonly name: string;
  readonly enabledSets: readonly string[];
}

export interface TokenRegistryResult {
  readonly tokens: readonly IrToken[];
  readonly sets: readonly IrTokenSet[];
  readonly themes: readonly IrTokenTheme[];
  readonly diagnostics: readonly Diagnostic[];
}

const supportedTypes = new Set<IrTokenType>([
  "color",
  "dimension",
  "spacing",
  "sizing",
  "border-width",
  "border-radius",
  "opacity",
  "typography",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "shadow",
  "gradient",
  "duration",
  "number",
]);

export function buildTokenRegistry(
  sources: readonly PenpotTokenSource[] = [],
  setSources: readonly PenpotTokenSetSource[] = [],
  themeSources: readonly PenpotTokenThemeSource[] = [],
): TokenRegistryResult {
  const diagnostics: Diagnostic[] = [];
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const usedNames = new Map<string, Set<string>>();
  const tokens = [...sources]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((source): IrToken => {
      const type = supportedTypes.has(source.type as IrTokenType) ? source.type as IrTokenType : "unknown";
      if (type === "unknown") {
        diagnostics.push({ severity: "warning", sourceId: source.id, code: "TOKEN_TYPE_UNSUPPORTED", message: `Design token "${source.name}" has unsupported type "${source.type}"; literal property values will be used.` });
      }
      const path = tokenPath(source.name, source.id);
      const dartClass = tokenClass(type);
      const classNames = usedNames.get(dartClass) ?? new Set<string>();
      usedNames.set(dartClass, classNames);
      const baseName = dartIdentifier(memberPath(type, path).join(" "), "token");
      const dartName = uniqueName(baseName, classNames);
      if (dartName !== baseName) {
        diagnostics.push({ severity: "warning", sourceId: source.id, code: "TOKEN_NAME_COLLISION", message: `Design token "${source.name}" collides after Dart name normalization; generated ${dartClass}.${dartName}.` });
      }
      if (!validValue(type, source.value)) {
        diagnostics.push({ severity: "warning", sourceId: source.id, code: "TOKEN_VALUE_INVALID", message: `Design token "${source.name}" has an invalid value for type "${source.type}"; literal property values will be used.` });
      }
      const rawValue = serializableValue(source.rawValue);
      const value = serializableValue(source.value) as IrTokenValue | undefined;
      return {
        id: source.id,
        sourceName: source.name,
        path,
        type,
        value: value ?? 0,
        ...(rawValue === undefined ? {} : { rawValue }),
        ...(source.aliasTargetId === undefined ? {} : { aliasTargetId: source.aliasTargetId }),
        ...(source.setId === undefined ? {} : { setId: source.setId }),
        dartClass,
        dartName,
      };
    });

  for (const token of tokens) {
    if (token.aliasTargetId !== undefined && !sourceById.has(token.aliasTargetId)) {
      diagnostics.push({ severity: "warning", sourceId: token.id, code: "TOKEN_UNRESOLVED", message: `Design token "${token.sourceName}" references unavailable token ${token.aliasTargetId}; its resolved fallback value will be used.` });
    }
  }
  detectAliasCycles(tokens, diagnostics);

  const sets = [...setSources].sort((a, b) => a.id.localeCompare(b.id)).map((set): IrTokenSet => {
    for (const tokenId of set.tokenIds) {
      if (!sourceById.has(tokenId)) diagnostics.push({ severity: "warning", sourceId: set.id, code: "TOKEN_SET_UNRESOLVED", message: `Token set "${set.name}" references unavailable token ${tokenId}.` });
    }
    return { id: set.id, name: set.name, tokenIds: [...set.tokenIds].sort() };
  });
  const setIds = new Set(sets.map((set) => set.id));
  const themes = [...themeSources].sort((a, b) => a.id.localeCompare(b.id)).map((theme): IrTokenTheme => {
    for (const setId of theme.enabledSets) {
      if (!setIds.has(setId)) diagnostics.push({ severity: "warning", sourceId: theme.id, code: "TOKEN_THEME_UNSUPPORTED", message: `Token theme "${theme.name}" references unavailable set ${setId}.` });
    }
    return { id: theme.id, name: theme.name, enabledSets: [...theme.enabledSets] };
  });
  return { tokens, sets, themes, diagnostics };
}

function detectAliasCycles(tokens: readonly IrToken[], diagnostics: Diagnostic[]): void {
  const byId = new Map(tokens.map((token) => [token.id, token]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const reported = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      if (!reported.has(id)) {
        reported.add(id);
        diagnostics.push({ severity: "warning", sourceId: id, code: "TOKEN_ALIAS_CYCLE", message: `Design token alias cycle detected involving token ${id}; resolved fallback values will be used.` });
      }
      return;
    }
    visiting.add(id);
    const target = byId.get(id)?.aliasTargetId;
    if (target !== undefined && byId.has(target)) visit(target);
    visiting.delete(id);
    visited.add(id);
  };
  for (const token of tokens) visit(token.id);
}

function serializableValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return undefined;
  }
}

function tokenPath(name: string, fallback: string): readonly string[] {
  const parts = name.split(".").map((part) => part.trim()).filter(Boolean);
  return parts.length === 0 ? [fallback] : parts;
}

function memberPath(type: IrTokenType, path: readonly string[]): readonly string[] {
  const category = path[0]?.toLowerCase().replace(/[^a-z0-9]/g, "");
  const prefixes: Partial<Record<IrTokenType, readonly string[]>> = {
    color: ["color", "colors"],
    spacing: ["spacing", "space"],
    sizing: ["sizing", "size"],
    "border-width": ["borderwidth", "strokewidth"],
    "border-radius": ["borderradius", "radius"],
    opacity: ["opacity"],
    typography: ["typography", "type"],
    "font-family": ["fontfamily"],
    "font-size": ["fontsize"],
    "font-weight": ["fontweight"],
    "line-height": ["lineheight"],
    "letter-spacing": ["letterspacing"],
    shadow: ["shadow", "shadows"],
    gradient: ["gradient", "gradients"],
    duration: ["duration", "durations"],
    dimension: ["dimension", "dimensions"],
    number: ["number", "numbers"],
  };
  return path.length > 1 && prefixes[type]?.includes(category) === true ? path.slice(1) : path;
}

function tokenClass(type: IrTokenType): string {
  switch (type) {
    case "color": return "AppColors";
    case "spacing": return "AppSpacing";
    case "sizing": return "AppSizing";
    case "border-width": return "AppBorderWidths";
    case "border-radius": return "AppRadius";
    case "opacity": return "AppOpacity";
    case "typography": return "AppTypography";
    case "font-family": return "AppFontFamilies";
    case "font-size": return "AppFontSizes";
    case "font-weight": return "AppFontWeights";
    case "line-height": return "AppLineHeights";
    case "letter-spacing": return "AppLetterSpacing";
    case "shadow": return "AppShadows";
    case "gradient": return "AppGradients";
    case "duration": return "AppDurations";
    case "dimension": return "AppDimensions";
    default: return "AppNumbers";
  }
}

function validValue(type: IrTokenType, value: unknown): boolean {
  switch (type) {
    case "color":
    case "font-family": return typeof value === "string";
    case "typography": return typeof value === "object" && value !== null && !Array.isArray(value);
    case "shadow": return Array.isArray(value);
    case "gradient": return isGradient(value);
    case "unknown": return false;
    default: return typeof value === "number" && Number.isFinite(value);
  }
}

function isGradient(value: unknown): value is GradientFill {
  if (typeof value !== "object" || value === null) return false;
  const gradient = value as Partial<GradientFill>;
  return (gradient.type === "linear" || gradient.type === "radial") && Array.isArray(gradient.stops);
}

function uniqueName(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}${suffix++}`;
  used.add(candidate);
  return candidate;
}

function dartIdentifier(value: string, fallback: string): string {
  const pascal = value.split(/[^A-Za-z0-9]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
  const camel = pascal === "" ? fallback : pascal.charAt(0).toLowerCase() + pascal.slice(1);
  return /^[A-Za-z]/.test(camel) ? camel : `${fallback}${camel}`;
}
