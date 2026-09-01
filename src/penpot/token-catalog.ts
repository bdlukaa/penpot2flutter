import type { Token, TokenCatalog, TokenType } from "@penpot/plugin-types";

import type { PenpotTokenInput } from "../core/extractor.js";
import type { PenpotTokenSource } from "../core/token-registry.js";
import type { Diagnostic, IrTokenType } from "../shared/ir.js";

const tokenTypes: Record<TokenType, IrTokenType> = {
  borderRadius: "border-radius",
  shadow: "shadow",
  color: "color",
  dimension: "dimension",
  fontFamilies: "font-family",
  fontSizes: "font-size",
  fontWeights: "font-weight",
  letterSpacing: "letter-spacing",
  number: "number",
  opacity: "opacity",
  rotation: "rotation",
  sizing: "sizing",
  spacing: "spacing",
  borderWidth: "border-width",
  textCase: "text-case",
  textDecoration: "text-decoration",
  typography: "typography",
};

export interface TokenCatalogStats {
  readonly sets: number;
  readonly themes: number;
  readonly tokens: number;
  readonly groups: readonly string[];
  readonly setNames: readonly string[];
  readonly themeNames: readonly string[];
}

export interface ExtractedTokenCatalog {
  readonly input: PenpotTokenInput;
  readonly stats: TokenCatalogStats;
  readonly diagnostics: readonly Diagnostic[];
}

/** Converts Penpot's live catalog into the serializable compiler boundary. */
export function extractTokenCatalog(catalog: TokenCatalog): ExtractedTokenCatalog {
  const diagnostics: Diagnostic[] = [];
  const sets: NonNullable<PenpotTokenInput["sets"]>[number][] = [];
  const tokens: PenpotTokenSource[] = [];
  catalog.sets.forEach((set, setIndex) => {
    const tokenIds: string[] = [];
    try {
      for (const token of set.tokens) {
        try {
          tokens.push(tokenSource(token, set.id, setIndex));
          tokenIds.push(token.id);
        } catch {
          diagnostics.push({ severity: "error", sourceId: set.id, code: "TOKEN_EXTRACTION_FAILED", message: `A token in set "${set.name}" could not be read and was not silently replaced with a shape literal.` });
        }
      }
      sets.push({ id: set.id, name: set.name, index: setIndex, active: set.active, tokenIds });
    } catch {
      diagnostics.push({ severity: "error", sourceId: `token-set-${setIndex}`, code: "TOKEN_SET_EXTRACTION_FAILED", message: `Token set at catalog index ${setIndex} could not be extracted.` });
    }
  });
  const themes: NonNullable<PenpotTokenInput["themes"]>[number][] = [];
  catalog.themes.forEach((theme, index) => {
    try {
      themes.push({
        id: theme.id,
        ...(theme.externalId === undefined ? {} : { externalId: theme.externalId }),
        name: theme.name,
        group: theme.group,
        active: theme.active,
        activeSetIds: theme.activeSets.map((set) => set.id),
      });
    } catch {
      diagnostics.push({ severity: "error", sourceId: `token-theme-${index}`, code: "TOKEN_THEME_EXTRACTION_FAILED", message: `Token theme at catalog index ${index} could not be extracted.` });
    }
  });
  const groups = [...new Set(themes.map((theme) => theme.group ?? ""))];
  return {
    input: { tokens, sets, themes },
    diagnostics,
    stats: {
      sets: sets.length,
      themes: themes.length,
      tokens: tokens.length,
      groups,
      setNames: sets.map((set) => set.name),
      themeNames: themes.map((theme) => `${theme.group ?? ""} / ${theme.name}`),
    },
  };
}

function tokenSource(token: Token, setId: string, setIndex: number): PenpotTokenSource {
  const rawValue = serializable(token.value);
  const resolvedValue = normalizedResolvedValue(token);
  const hasInsetShadow = token.type === "shadow" && token.resolvedValue?.some((shadow) => shadow.inset) === true;
  return {
    id: token.id,
    name: token.name,
    type: tokenTypes[token.type],
    sourceType: token.type,
    value: resolvedValue ?? rawValue,
    rawValue,
    references: tokenReferences(rawValue),
    ...(hasInsetShadow ? { unsupportedReason: `Shadow token "${token.name}" contains an inset shadow that Flutter BoxShadow cannot represent; inset entries are omitted and the limitation is diagnosed.` } : {}),
    setId,
    setIndex,
  };
}

function normalizedResolvedValue(token: Token): unknown {
  switch (token.type) {
    case "fontFamilies": return token.resolvedValue?.[0];
    case "fontWeights": return fontWeight(token.resolvedValue);
    case "shadow": return token.resolvedValue?.filter((shadow) => !shadow.inset).map((shadow) => ({ ...shadow, opacity: 1 }));
    case "typography": {
      const typography = token.resolvedValue?.[0];
      return typography === undefined ? undefined : {
        fontFamily: typography.fontFamilies[0],
        fontSize: typography.fontSizes,
        fontWeight: fontWeight(typography.fontWeights),
        lineHeight: typography.lineHeight,
        letterSpacing: typography.letterSpacing,
      };
    }
    default: return serializable(token.resolvedValue);
  }
}

function fontWeight(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  return ({ thin: 100, extraLight: 200, light: 300, normal: 400, regular: 400, medium: 500, semiBold: 600, bold: 700, extraBold: 800, black: 900 } as Record<string, number>)[value.replace(/[\s_-]/g, "")];
}

function tokenReferences(value: unknown): readonly string[] {
  const references = new Set<string>();
  const visit = (current: unknown): void => {
    if (typeof current === "string") {
      for (const match of current.matchAll(/\{([^{}]+)\}/g)) references.add(match[1].trim());
    } else if (Array.isArray(current)) {
      current.forEach(visit);
    } else if (typeof current === "object" && current !== null) {
      Object.values(current).forEach(visit);
    }
  };
  visit(value);
  return [...references];
}

function serializable(value: unknown): unknown {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as unknown;
}
