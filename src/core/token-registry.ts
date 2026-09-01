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
  readonly sourceType?: string;
  readonly references?: readonly string[];
  readonly aliasTargetId?: string;
  readonly setId?: string;
  readonly setIndex?: number;
  readonly unsupportedReason?: string;
}

export interface PenpotTokenSetSource {
  readonly id: string;
  readonly name: string;
  readonly index?: number;
  readonly active?: boolean;
  readonly tokenIds: readonly string[];
}

export interface PenpotTokenThemeSource {
  readonly id: string;
  readonly externalId?: string;
  readonly name: string;
  readonly group?: string;
  readonly active?: boolean;
  readonly activeSetIds?: readonly string[];
  /** Backwards-compatible fixture input. */
  readonly enabledSets?: readonly string[];
}

export interface TokenRegistryResult {
  readonly tokens: readonly IrToken[];
  readonly sets: readonly IrTokenSet[];
  readonly themes: readonly IrTokenTheme[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface ResolvedTokenMap {
  readonly tokens: ReadonlyMap<string, IrToken>;
  readonly diagnostics: readonly Diagnostic[];
}

/** Resolves ordered sets by semantic name. Later sets override earlier sets. */
export function resolveTokenSets(
  tokens: readonly IrToken[],
  sets: readonly IrTokenSet[],
  activeSetIds: ReadonlySet<string>,
): ResolvedTokenMap {
  const definitions = new Map(tokens.map((token) => [token.id, token]));
  const effective = new Map<string, IrToken>();
  for (const set of sets) {
    if (!activeSetIds.has(set.id)) continue;
    for (const tokenId of set.tokenIds) {
      const token = definitions.get(tokenId);
      if (token !== undefined) effective.set(token.sourceName, token);
    }
  }
  const diagnostics: Diagnostic[] = [];
  const resolved = new Map<string, IrToken>();
  const resolving = new Set<string>();
  const visit = (name: string): IrToken | undefined => {
    const cached = resolved.get(name);
    if (cached !== undefined) return cached;
    const token = effective.get(name);
    if (token === undefined) return undefined;
    if (resolving.has(name)) {
      diagnostics.push({ severity: "error", sourceId: token.id, code: "TOKEN_ALIAS_CYCLE", message: `Design token alias cycle detected at "${name}".` });
      return token;
    }
    resolving.add(name);
    let value = token.value;
    const alias = wholeAlias(token.rawValue);
    if (alias !== undefined) {
      const target = visit(alias);
      if (target === undefined) diagnostics.push({ severity: "warning", sourceId: token.id, code: "TOKEN_ALIAS_UNRESOLVED", message: `Design token "${name}" references unavailable token "${alias}".` });
      else value = target.value;
    }
    resolving.delete(name);
    const result = value === token.value ? token : { ...token, value };
    resolved.set(name, result);
    return result;
  };
  for (const name of effective.keys()) visit(name);
  return { tokens: resolved, diagnostics };
}

function wholeAlias(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return /^\{([^{}]+)\}$/.exec(value.trim())?.[1].trim();
}

const supportedTypes = new Set<IrTokenType>([
  "color",
  "dimension",
  "spacing",
  "sizing",
  "border-width",
  "border-radius",
  "opacity",
  "rotation",
  "typography",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-case",
  "text-decoration",
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
  const tokens = sources.map((source): IrToken => {
      const type = supportedTypes.has(source.type as IrTokenType) ? source.type as IrTokenType : "unknown";
      if (type === "unknown" || source.unsupportedReason !== undefined) {
        diagnostics.push({ severity: "warning", sourceId: source.id, code: "TOKEN_TYPE_UNSUPPORTED", message: source.unsupportedReason ?? `Design token "${source.name}" has unsupported type "${source.type}"; its raw identity and resolved fallback are preserved.` });
      }
      if ((source.references?.length ?? 0) > 0 && wholeAlias(source.rawValue) === undefined) {
        diagnostics.push({ severity: "warning", sourceId: source.id, code: "TOKEN_ALIAS_UNRESOLVED", message: `Design token "${source.name}" contains composite token references; its references and resolved fallback are preserved, but only whole-token aliases are resolved by the Flutter runtime.` });
      }
      const path = tokenPath(source.name, source.id);
      const dartClass = tokenClass(type);
      const classNames = usedNames.get(dartClass) ?? new Set<string>();
      usedNames.set(dartClass, classNames);
      const baseName = dartIdentifier(memberPath(type, path).join(" "), "token");
      const dartName = uniqueName(baseName, classNames);
      if (dartName !== baseName) {
        diagnostics.push({ severity: "warning", sourceId: source.id, code: "TOKEN_DART_NAME_COLLISION", message: `Design token "${source.name}" collides after Dart name normalization; generated ${dartClass}.${dartName}.` });
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
        ...(source.sourceType === undefined ? {} : { sourceType: source.sourceType }),
        references: [...(source.references ?? [])],
        ...(source.aliasTargetId === undefined ? {} : { aliasTargetId: source.aliasTargetId }),
        ...(source.setId === undefined ? {} : { setId: source.setId }),
        ...(source.setIndex === undefined ? {} : { setIndex: source.setIndex }),
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

  const sets = setSources.map((set, sourceIndex): IrTokenSet => {
    for (const tokenId of set.tokenIds) {
      if (!sourceById.has(tokenId)) diagnostics.push({ severity: "warning", sourceId: set.id, code: "TOKEN_SET_EXTRACTION_FAILED", message: `Token set "${set.name}" references unavailable token ${tokenId}.` });
    }
    if (set.index !== undefined && set.index !== sourceIndex) diagnostics.push({ severity: "error", sourceId: set.id, code: "TOKEN_SET_ORDER_INVALID", message: `Token set "${set.name}" has index ${set.index}, expected ${sourceIndex}.` });
    return { id: set.id, name: set.name, index: sourceIndex, active: set.active === true, tokenIds: [...set.tokenIds] };
  });
  diagnoseTokenPathCollisions(tokens, diagnostics);
  const setIds = new Set(sets.map((set) => set.id));
  const themes = themeSources.map((theme): IrTokenTheme => {
    const activeSetIds = theme.activeSetIds ?? theme.enabledSets ?? [];
    for (const setId of activeSetIds) {
      if (!setIds.has(setId)) diagnostics.push({ severity: "error", sourceId: theme.id, code: "TOKEN_THEME_SET_UNRESOLVED", message: `Token theme "${theme.name}" references unavailable set ${setId}.` });
    }
    return { id: theme.id, ...(theme.externalId === undefined ? {} : { externalId: theme.externalId }), name: theme.name, group: theme.group ?? "", active: theme.active === true, activeSetIds: [...activeSetIds] };
  });
  diagnoseThemeGroupCollisions(themes, diagnostics);
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
    case "rotation": return "AppRotation";
    case "typography": return "AppTypography";
    case "font-family": return "AppFontFamilies";
    case "font-size": return "AppFontSizes";
    case "font-weight": return "AppFontWeights";
    case "line-height": return "AppLineHeights";
    case "letter-spacing": return "AppLetterSpacing";
    case "text-case": return "AppTextCase";
    case "text-decoration": return "AppTextDecoration";
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
    case "font-family":
    case "text-case":
    case "text-decoration": return typeof value === "string";
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

function diagnoseTokenPathCollisions(tokens: readonly IrToken[], diagnostics: Diagnostic[]): void {
  const unique = [...new Map(tokens.map((token) => [token.sourceName, token])).values()];
  const byDartPath = new Map<string, IrToken>();
  for (const token of unique) {
    const dartPath = token.path.map((segment) => dartIdentifier(segment, "token")).join(".");
    const previous = byDartPath.get(dartPath);
    if (previous !== undefined && previous.sourceName !== token.sourceName) {
      diagnostics.push({ severity: "error", sourceId: token.id, code: "TOKEN_DART_NAME_COLLISION", message: `Design tokens "${previous.sourceName}" and "${token.sourceName}" both normalize to Dart path "${dartPath}".` });
    } else {
      byDartPath.set(dartPath, token);
    }
  }
  const names = new Set(unique.map((token) => token.sourceName));
  for (const token of unique) {
    for (let index = 1; index < token.path.length; index++) {
      const prefix = token.path.slice(0, index).join(".");
      if (names.has(prefix)) diagnostics.push({ severity: "error", sourceId: token.id, code: "TOKEN_PATH_COLLISION", message: `Design token "${prefix}" is both a value and a namespace containing "${token.sourceName}"; this cannot be represented as one typed Dart field path.` });
    }
  }
}

function diagnoseThemeGroupCollisions(themes: readonly IrTokenTheme[], diagnostics: Diagnostic[]): void {
  const groups = new Map<string, string>();
  for (const theme of themes) {
    const normalizedGroup = dartIdentifier(theme.group, "theme");
    const previousGroup = groups.get(normalizedGroup);
    if (previousGroup !== undefined && previousGroup !== theme.group) {
      diagnostics.push({ severity: "error", sourceId: theme.id, code: "TOKEN_THEME_GROUP_COLLISION", message: `Theme groups "${previousGroup}" and "${theme.group}" both normalize to Dart name "${normalizedGroup}".` });
    } else {
      groups.set(normalizedGroup, theme.group);
    }
  }
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
