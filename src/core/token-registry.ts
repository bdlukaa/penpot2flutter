import { dartIdentifierSegment, dartMemberName } from "./token-naming.js";
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
  readonly sourceLibraryId?: string;
  readonly sourceLibraryScope?: "local" | "shared";
  readonly name: string;
  readonly type: IrTokenType | string;
  readonly value: unknown;
  readonly rawValue?: unknown;
  readonly sourceType?: string;
  readonly references?: readonly string[];
  readonly aliasTargetId?: string;
  readonly setId?: string;
  readonly setName?: string;
  readonly setIndex?: number;
  readonly fontFamilyFallbacks?: readonly string[];
  readonly unsupportedReason?: string;
}

export interface PenpotTokenSetSource {
  readonly id: string;
  readonly sourceLibraryId?: string;
  readonly sourceLibraryScope?: "local" | "shared";
  readonly name: string;
  readonly index?: number;
  readonly active?: boolean;
  readonly tokenIds: readonly string[];
}

export interface PenpotTokenThemeSource {
  readonly id: string;
  readonly sourceLibraryId?: string;
  readonly sourceLibraryScope?: "local" | "shared";
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

export interface TokenRegistryBuildOptions {
  /** Development-only phase telemetry supplied by the index coordinator. */
  readonly reportTiming?: (phase: string, milliseconds: number) => void;
}

export interface ResolvedTokenMap {
  readonly tokens: ReadonlyMap<string, IrToken>;
  readonly diagnostics: readonly Diagnostic[];
}

export interface TokenResolverIndexes {
  readonly definitionsByIdentity: ReadonlyMap<string, IrToken>;
  readonly unscopedDefinitionsById: ReadonlyMap<string, IrToken>;
}

export function createTokenResolverIndexes(tokens: readonly IrToken[]): TokenResolverIndexes {
  const definitionsByIdentity = new Map<string, IrToken>();
  const unscopedDefinitionsById = new Map<string, IrToken>();
  for (const token of tokens) {
    definitionsByIdentity.set(`${token.sourceLibraryId ?? "local"}:${token.setId ?? ""}:${token.id}`, token);
    if (token.setId === undefined && token.sourceLibraryId === undefined) unscopedDefinitionsById.set(token.id, token);
  }
  return { definitionsByIdentity, unscopedDefinitionsById };
}

/** Resolves ordered sets by semantic name. Later sets override earlier sets. */
export function resolveTokenSets(
  tokens: readonly IrToken[],
  sets: readonly IrTokenSet[],
  activeSetIds: ReadonlySet<string>,
  indexes: TokenResolverIndexes = createTokenResolverIndexes(tokens),
): ResolvedTokenMap {
  const definitions = indexes.definitionsByIdentity;
  const definitionsById = indexes.unscopedDefinitionsById;
  const effective = new Map<string, IrToken>();
  for (const set of sets) {
    if (!activeSetIds.has(set.id)) continue;
    for (const tokenId of set.tokenIds) {
      const token = definitions.get(`${set.sourceLibraryId ?? "local"}:${set.id}:${tokenId}`) ?? definitionsById.get(tokenId);
      if (token !== undefined) effective.set(token.sourceName, token);
    }
  }
  const diagnostics: Diagnostic[] = [];
  const resolved = new Map<string, IrToken>();
  const resolving: string[] = [];
  const reportedCycles = new Set<string>();
  const reportedMissingReferences = new Set<string>();
  const visit = (name: string): IrToken | undefined => {
    const cached = resolved.get(name);
    if (cached !== undefined) return cached;
    const token = effective.get(name);
    if (token === undefined) return undefined;
    const cycleStart = resolving.indexOf(name);
    if (cycleStart >= 0) {
      const cycle = [...resolving.slice(cycleStart), name].join(" → ");
      if (!reportedCycles.has(cycle)) {
        reportedCycles.add(cycle);
        diagnostics.push({ severity: "error", sourceId: token.id, code: "TOKEN_REFERENCE_CYCLE", message: `Token reference cycle: ${cycle}.` });
      }
      return token;
    }
    resolving.push(name);
    const value = resolveRawValue(token.rawValue, token.value, (reference) => {
      const target = visit(reference);
      if (target === undefined) {
        const key = `${name}→${reference}`;
        if (!reportedMissingReferences.has(key)) {
          reportedMissingReferences.add(key);
          diagnostics.push({ severity: "warning", sourceId: token.id, code: "TOKEN_ALIAS_UNRESOLVED", message: `Design token "${name}" references unavailable token "${reference}".` });
        }
      }
      return target?.value;
    });
    resolving.pop();
    const result = value === token.value ? token : { ...token, value: value as IrTokenValue };
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

function resolveRawValue(rawValue: unknown, fallback: IrTokenValue, resolveReference: (name: string) => IrTokenValue | undefined): unknown {
  if (typeof rawValue === "string") {
    const alias = wholeAlias(rawValue);
    if (alias !== undefined) return resolveReference(alias) ?? fallback;
    const expression = evaluateExpression(rawValue, resolveReference);
    return expression === undefined ? fallback : expression;
  }
  if (Array.isArray(rawValue)) {
    const fallbackValues = Array.isArray(fallback) ? fallback : [];
    return rawValue.map((value, index) => resolveRawValue(value, fallbackValues[index] as IrTokenValue ?? 0, resolveReference));
  }
  if (typeof rawValue === "object" && rawValue !== null) {
    const fallbackObject = typeof fallback === "object" && fallback !== null && !Array.isArray(fallback) ? fallback as Record<string, unknown> : {};
    const resolved: Record<string, unknown> = { ...fallbackObject };
    for (const [key, value] of Object.entries(rawValue)) {
      resolved[key] = resolveRawValue(value, (fallbackObject[key] as IrTokenValue | undefined) ?? 0, resolveReference);
    }
    return resolved;
  }
  return fallback;
}

function evaluateExpression(value: string, resolveReference: (name: string) => IrTokenValue | undefined): number | undefined {
  if (!value.includes("{")) return undefined;
  let expression = value.replace(/\{([^{}]+)\}/g, (_, name: string) => {
    const resolved = resolveReference(name.trim());
    return typeof resolved === "number" && Number.isFinite(resolved) ? String(resolved) : "__invalid__";
  });
  expression = expression.replace(/(-?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:px|rem)\b/gi, "$1");
  if (expression.includes("__invalid__")) return undefined;
  return parseMathExpression(expression);
}

function parseMathExpression(expression: string): number | undefined {
  let position = 0;
  const skip = (): void => { while (/\s/.test(expression[position] ?? "")) position++; };
  const read = (pattern: RegExp): string | undefined => {
    skip();
    const match = pattern.exec(expression.slice(position));
    if (match === null) return undefined;
    position += match[0].length;
    return match[1] ?? match[0];
  };
  const primary = (): number | undefined => {
    skip();
    if (read(/^\(/) !== undefined) {
      const value = additive();
      if (read(/^\)/) === undefined) return undefined;
      return value;
    }
    const functionName = read(/^(round|floor|ceil|min|max)\b/i);
    if (functionName !== undefined) {
      if (read(/^\(/) === undefined) return undefined;
      const values: number[] = [];
      do {
        const value = additive();
        if (value === undefined) return undefined;
        values.push(value);
      } while (read(/^,/) !== undefined);
      if (read(/^\)/) === undefined) return undefined;
      if (functionName.toLowerCase() === "round") return Math.round(values[0]!);
      if (functionName.toLowerCase() === "floor") return Math.floor(values[0]!);
      if (functionName.toLowerCase() === "ceil") return Math.ceil(values[0]!);
      return functionName.toLowerCase() === "min" ? Math.min(...values) : Math.max(...values);
    }
    const sign = read(/^[+-]/);
    const number = read(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (number === undefined) return undefined;
    const result = Number(number);
    return sign === "-" ? -result : result;
  };
  const multiplicative = (): number | undefined => {
    let value = primary();
    if (value === undefined) return undefined;
    while (true) {
      const operator = read(/^[*/]/);
      if (operator === undefined) return value;
      const right = primary();
      if (right === undefined || (operator === "/" && right === 0)) return undefined;
      value = operator === "*" ? value * right : value / right;
    }
  };
  function additive(): number | undefined {
    let value = multiplicative();
    if (value === undefined) return undefined;
    while (true) {
      const operator = read(/^[+-]/);
      if (operator === undefined) return value;
      const right = multiplicative();
      if (right === undefined) return undefined;
      value = operator === "+" ? value + right : value - right;
    }
  }
  const result = additive();
  skip();
  return result !== undefined && position === expression.length && Number.isFinite(result) ? result : undefined;
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
  options: TokenRegistryBuildOptions = {},
): TokenRegistryResult {
  const diagnostics: Diagnostic[] = [];
  const indexStart = now();
  const uniqueSources: PenpotTokenSource[] = [];
  const sourceByIdentity = new Map<string, PenpotTokenSource>();
  for (const source of sources) {
    const identity = `${source.sourceLibraryId ?? "local"}:${source.setId ?? ""}:${source.id}`;
    const existing = sourceByIdentity.get(identity);
    if (existing !== undefined) {
      if (JSON.stringify(existing) !== JSON.stringify(source)) diagnostics.push({ severity: "error", sourceId: source.id, code: "TOKEN_IDENTITY_AMBIGUOUS", message: `Token identity ${identity} was registered more than once with different source data.` });
      continue;
    }
    sourceByIdentity.set(identity, source);
    uniqueSources.push(source);
  }
  options.reportTiming?.("index-map-construction", now() - indexStart);
  const normalizationStart = now();
  const sourceById = new Map(uniqueSources.filter((source) => source.setId === undefined).map((source) => [source.id, source]));
  const usedNames = new Map<string, Set<string>>();
  const namesBySourceName = new Map<string, { readonly dartClass: string; readonly dartName: string }>();
  const tokens = uniqueSources.map((source): IrToken => {
      const type = supportedTypes.has(source.type as IrTokenType) ? source.type as IrTokenType : "unknown";
      if (type === "unknown" || source.unsupportedReason !== undefined) {
        diagnostics.push({ severity: "warning", sourceId: source.id, code: "TOKEN_TYPE_UNSUPPORTED", message: source.unsupportedReason ?? `Design token "${source.name}" has unsupported type "${source.type}"; its raw identity and resolved fallback are preserved.` });
      }

      const path = tokenPath(source.name, source.id);
      const dartClass = tokenClass(type);
      const classNames = usedNames.get(dartClass) ?? new Set<string>();
      usedNames.set(dartClass, classNames);
      const baseName = dartIdentifierSegment(memberPath(type, path).join(" "), "token");
      const existingName = namesBySourceName.get(source.name);
      const dartName = existingName?.dartClass === dartClass ? existingName.dartName : uniqueName(baseName, classNames);
      if (existingName === undefined) namesBySourceName.set(source.name, { dartClass, dartName });
      else if (existingName.dartClass !== dartClass) diagnostics.push({ severity: "error", sourceId: source.id, code: "TOKEN_VALUE_TYPE_MISMATCH", message: `Token "${source.name}" is declared with incompatible types across token sets.` });
      else if (dartName !== baseName && existingName.dartName === undefined) diagnostics.push({ severity: "warning", sourceId: source.id, code: "TOKEN_DART_NAME_COLLISION", message: `Design token "${source.name}" collides after Dart name normalization; generated ${dartClass}.${dartName}.` });
      const normalizedValue = normalizeTokenValue(type, source.value);
      if (!validValue(type, normalizedValue)) {
        diagnostics.push({ severity: "warning", sourceId: source.id, code: "TOKEN_VALUE_INVALID", message: `Design token "${source.name}" has an invalid value for type "${source.type}"; literal property values will be used.` });
      }
      const rawValue = serializableValue(source.rawValue);
      const value = serializableValue(source.value) as IrTokenValue | undefined;
      return {
        id: source.id,
        ...(source.sourceLibraryId === undefined ? {} : { sourceLibraryId: source.sourceLibraryId }),
        ...(source.sourceLibraryScope === undefined ? {} : { sourceLibraryScope: source.sourceLibraryScope }),
        sourceName: source.name,
        path,
        type,
        value: (serializableValue(normalizedValue) as IrTokenValue | undefined) ?? value ?? 0,
        ...(serializableValue(normalizedValue) === undefined && rawValue === undefined ? {} : { resolvedValue: (serializableValue(normalizedValue) as IrTokenValue | undefined) ?? value ?? 0 }),
        ...(rawValue === undefined ? {} : { rawValue }),
        ...(source.sourceType === undefined ? {} : { sourceType: source.sourceType }),
        ...(source.setName === undefined ? {} : { setName: source.setName }),
        identity: { tokenId: source.id, setId: source.setId ?? "" },
        ...(source.fontFamilyFallbacks === undefined ? {} : { fontFamilyFallbacks: [...source.fontFamilyFallbacks] }),
        references: [...(source.references ?? [])],
        ...(source.references === undefined || source.references.length === 0 ? {} : { dependencies: [...source.references] }),
        ...(source.aliasTargetId === undefined ? {} : { aliasTargetId: source.aliasTargetId }),
        ...(source.setId === undefined ? {} : { setId: source.setId }),
        ...(source.setIndex === undefined ? {} : { setIndex: source.setIndex }),
        dartClass,
        dartName,
      };
    });
  options.reportTiming?.("token-normalization", now() - normalizationStart);

  const aliasCycleStart = now();
  for (const token of tokens) {
    if (token.aliasTargetId !== undefined && !sourceById.has(token.aliasTargetId)) {
      diagnostics.push({ severity: "warning", sourceId: token.id, code: "TOKEN_UNRESOLVED", message: `Design token "${token.sourceName}" references unavailable token ${token.aliasTargetId}; its resolved fallback value will be used.` });
    }
  }
  detectAliasCycles(tokens, diagnostics);
  options.reportTiming?.("alias-cycle-detection", now() - aliasCycleStart);

  const setsStart = now();
  const sets = setSources.map((set, sourceIndex): IrTokenSet => {
    for (const tokenId of set.tokenIds) {
      const tokenExists = sourceByIdentity.has(`${set.sourceLibraryId ?? "local"}:${set.id}:${tokenId}`) || sourceById.has(tokenId);
      if (!tokenExists) diagnostics.push({ severity: "warning", sourceId: set.id, code: "TOKEN_SET_EXTRACTION_FAILED", message: `Token set "${set.name}" references unavailable token ${tokenId}.` });
    }
    if (set.index !== undefined && set.index !== sourceIndex) diagnostics.push({ severity: "error", sourceId: set.id, code: "TOKEN_SET_ORDER_INVALID", message: `Token set "${set.name}" has index ${set.index}, expected ${sourceIndex}.` });
    return {
      id: set.id,
      ...(set.sourceLibraryId === undefined ? {} : { sourceLibraryId: set.sourceLibraryId }),
      ...(set.sourceLibraryScope === undefined ? {} : { sourceLibraryScope: set.sourceLibraryScope }),
      name: set.name,
      index: sourceIndex,
      active: set.active === true,
      tokenIds: [...set.tokenIds],
    };
  });
  diagnoseTokenPathCollisions(tokens, diagnostics);
  options.reportTiming?.("token-set-normalization", now() - setsStart);
  const themesStart = now();
  const setIds = new Set(sets.map((set) => set.id));
  const themes = themeSources.map((theme): IrTokenTheme => {
    const activeSetIds = theme.activeSetIds ?? theme.enabledSets ?? [];
    for (const setId of activeSetIds) {
      if (!setIds.has(setId)) diagnostics.push({ severity: "error", sourceId: theme.id, code: "TOKEN_THEME_SET_UNRESOLVED", message: `Token theme "${theme.name}" references unavailable set ${setId}.` });
    }
    return {
      id: theme.id,
      ...(theme.sourceLibraryId === undefined ? {} : { sourceLibraryId: theme.sourceLibraryId }),
      ...(theme.sourceLibraryScope === undefined ? {} : { sourceLibraryScope: theme.sourceLibraryScope }),
      ...(theme.externalId === undefined ? {} : { externalId: theme.externalId }),
      name: theme.name,
      group: theme.group ?? "",
      active: theme.active === true,
      activeSetIds: [...activeSetIds],
    };
  });
  diagnoseThemeGroupCollisions(themes, diagnostics);
  options.reportTiming?.("theme-normalization", now() - themesStart);
  const themeResolutionStart = now();
  diagnostics.push(...validateTokenThemes(tokens, sets, themes));
  options.reportTiming?.("alias-reference-resolution", now() - themeResolutionStart);
  return { tokens, sets, themes, diagnostics };
}

/** Validates each theme against its ordered base and override token sets. */
export function validateTokenThemes(
  tokens: readonly IrToken[],
  sets: readonly IrTokenSet[],
  themes: readonly IrTokenTheme[],
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const activeBaseSetIds = sets.filter((set) => set.active).map((set) => set.id);
  const namesByGroup = new Map<string, Map<string, string>>();
  const semanticNames = new Map<string, string>();
  const resolverIndexes = createTokenResolverIndexes(tokens);
  for (const token of tokens) {
    const normalized = token.sourceName.toLowerCase();
    const previous = semanticNames.get(normalized);
    if (previous !== undefined && previous !== token.sourceName) {
      diagnostics.push({ severity: "warning", sourceId: token.id, code: "THEME_SEMANTIC_MAPPING_AMBIGUOUS", message: `Token names "${previous}" and "${token.sourceName}" normalize to the same semantic mapping key.` });
    } else {
      semanticNames.set(normalized, token.sourceName);
    }
  }
  for (const theme of themes) {
    const normalizedName = dartMemberName(theme.name, "theme");
    const names = namesByGroup.get(theme.group) ?? new Map<string, string>();
    namesByGroup.set(theme.group, names);
    const previousName = names.get(normalizedName);
    if (previousName !== undefined && previousName !== theme.name) {
      diagnostics.push({ severity: "error", sourceId: theme.id, code: "THEME_NAME_COLLISION", message: `Themes "${previousName}" and "${theme.name}" in group "${theme.group}" normalize to the same Dart enum member.` });
    } else {
      names.set(normalizedName, theme.name);
    }

    const selectedSetIds = new Set([...activeBaseSetIds, ...theme.activeSetIds]);
    if (selectedSetIds.size === 0) {
      diagnostics.push({ severity: "error", sourceId: theme.id, code: "THEME_INHERITANCE_UNRESOLVED", message: `Theme "${theme.name}" has no active base or theme token sets to inherit from.` });
      continue;
    }
    const resolved = resolveTokenSets(tokens, sets, selectedSetIds, resolverIndexes);
    for (const diagnostic of resolved.diagnostics) {
      diagnostics.push({ severity: "error", sourceId: theme.id, code: "THEME_INHERITANCE_UNRESOLVED", message: `Theme "${theme.name}" cannot resolve inherited token values: ${diagnostic.message}` });
    }
    const definitionsByName = new Map<string, Set<IrToken["type"]>>();
    const tokenByIdentity = resolverIndexes.definitionsByIdentity;
    const unscopedTokenById = resolverIndexes.unscopedDefinitionsById;
    for (const set of sets) {
      if (!selectedSetIds.has(set.id)) continue;
      for (const tokenId of set.tokenIds) {
        const token = tokenByIdentity.get(`${set.sourceLibraryId ?? "local"}:${set.id}:${tokenId}`) ?? unscopedTokenById.get(tokenId);
        if (token === undefined) continue;
        const types = definitionsByName.get(token.sourceName) ?? new Set<IrToken["type"]>();
        types.add(token.type);
        definitionsByName.set(token.sourceName, types);
      }
    }
    for (const [name, types] of definitionsByName) {
      if (types.size > 1) diagnostics.push({ severity: "error", sourceId: theme.id, code: "THEME_VALUE_TYPE_MISMATCH", message: `Theme "${theme.name}" combines token "${name}" with incompatible types: ${[...types].join(", ")}.` });
    }
    for (const token of resolved.tokens.values()) {
      for (const reference of token.references) {
        if (!resolved.tokens.has(reference)) {
          diagnostics.push({ severity: "error", sourceId: theme.id, code: "THEME_TOKEN_MISSING", message: `Theme "${theme.name}" cannot resolve referenced token "${reference}" required by "${token.sourceName}".` });
        }
      }
    }
  }
  return diagnostics;
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

function now(): number {
  return typeof performance === "undefined" || typeof performance.now !== "function" ? Date.now() : performance.now();
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

function normalizeTokenValue(type: IrTokenType, value: unknown): unknown {
  if (type === "font-family" && typeof value === "string") return splitFontFamilyStack(value)[0] ?? value;
  if (!["dimension", "spacing", "sizing", "border-width", "border-radius", "opacity", "rotation", "font-size", "line-height", "letter-spacing", "duration", "number"].includes(type)) return value;
  if (typeof value === "number") return value;
  if (typeof value !== "string") return value;
  const match = /^\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*(px|rem)?\s*$/i.exec(value);
  if (match === undefined || match === null) return value;
  const numeric = Number(match[1]);
  return match[2]?.toLowerCase() === "rem" ? numeric * 16 : numeric;
}

function splitFontFamilyStack(value: string): readonly string[] {
  const result: string[] = [];
  let current = "";
  let quote: string | undefined;
  for (const character of value) {
    if ((character === "\"" || character === "'") && (quote === undefined || quote === character)) quote = quote === undefined ? character : undefined;
    if (character === "," && quote === undefined) {
      result.push(current.trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2"));
      current = "";
    } else {
      current += character;
    }
  }
  if (current.trim() !== "") result.push(current.trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2"));
  return result.filter(Boolean);
}

function validValue(type: IrTokenType, value: unknown): boolean {
  switch (type) {
    case "color":
    case "text-case":
    case "text-decoration": return typeof value === "string";
    case "font-family": return typeof value === "string" || Array.isArray(value);
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
    const dartPath = token.path.map((segment) => dartMemberName(segment, "token")).join(".");
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
    const normalizedGroup = dartMemberName(theme.group, "theme");
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
