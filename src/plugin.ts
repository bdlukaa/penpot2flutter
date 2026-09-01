import { extractSelection, type PenpotComponentSource, type PenpotSourceShape, type PenpotSourceTextRun, type PenpotTokenInput, type PenpotVariantFamilySource, type PenpotVariantMemberSource } from "./core/extractor.js";
import { generateFlutterFiles, generatePubspecSnippet } from "./core/flutter-generator.js";
import { generateFlutterThemeFiles, validateFlutterThemeGeneration } from "./core/flutter-theme-generator.js";
import { buildTokenRegistry } from "./core/token-registry.js";
import { LibraryResolver, type ComponentResolution, type LibraryComponentLike, type ReadOnlyLibraryContext } from "./penpot/library-resolver.js";
import { withTokenBindings } from "./penpot/shape-token-bindings.js";
import { extractTokenCatalog, type ExtractedTokenCatalog } from "./penpot/token-catalog.js";
import { componentKey } from "./shared/component-key.js";
import type { Diagnostic, GeneratedFile, IrNode } from "./shared/ir.js";
import type { PluginToUiMessage, TokenBindingStats } from "./shared/messages.js";

interface LiveTextRange {
  readonly fontId?: unknown;
  readonly fontFamily?: unknown;
  readonly fontSize?: unknown;
  readonly fontWeight?: unknown;
  readonly fontStyle?: unknown;
  readonly lineHeight?: unknown;
  readonly letterSpacing?: unknown;
  readonly textDecoration?: unknown;
  readonly textTransform?: unknown;
  readonly fills?: unknown;
}

interface LiveTextShape extends PenpotSourceShape {
  readonly getRange?: (start: number, end: number) => LiveTextRange;
}

interface LiveTokenShape {
  readonly tokens?: Readonly<Record<string, string>>;
}

interface LiveComponentShape {
  readonly isComponentInstance?: () => boolean;
  readonly isComponentCopyInstance?: () => boolean;
  readonly isComponentMainInstance?: () => boolean;
  readonly isComponentRoot?: () => boolean;
  readonly isComponentHead?: () => boolean;
  readonly component?: () => LibraryComponentLike | null;
}

interface ResolutionIssue {
  readonly code: string;
  readonly message: string;
}

interface CachedDesignSystem {
  readonly catalog: ExtractedTokenCatalog;
  readonly diagnostics: readonly Diagnostic[];
  readonly tokenInput: PenpotTokenInput;
  readonly themeFiles: readonly GeneratedFile[];
  readonly typography: ReturnType<typeof typographyInput>;
}

let cachedDesignSystem: CachedDesignSystem | undefined;
let designSystemFilesSent = false;
let conversionRequest = 0;

penpot.ui.open("Penpot to Flutter", `?theme=${penpot.theme}`, { width: 720, height: 640 });

function isUiToPluginMessage(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const message = value as { source?: unknown; type?: unknown };
  return message.source === "penpot-to-flutter" && message.type === "request-conversion";
}

async function sendConversion(): Promise<void> {
  const request = ++conversionRequest;
  const rawSelection = penpot.selection as unknown as readonly PenpotSourceShape[];
  const selection = rawSelection.map(enrichShape);
  const designSystem = getDesignSystem();
  const { catalog, diagnostics: catalogDiagnostics } = designSystem;
  const resolution = await resolveComponentSources(selection);
  if (request !== conversionRequest) return;
  const resolvedSelection = selection.map((shape) => withResolutionIssues(shape, resolution.issues, resolution.identities));
  const extracted = resolvedSelection.length === 0 ? undefined : extractSelection(resolvedSelection, resolution.components, resolution.variants, designSystem.tokenInput, designSystem.typography);
  const generatedFiles = extracted === undefined ? undefined : generateFlutterFiles(extracted.root, extracted.components, extracted.tokens, extracted.tokenSets, extracted.tokenThemes, extracted.responsiveScreen, extracted.typographyStyles, designSystem.themeFiles);
  const files = generatedFiles?.filter((file) => !isStableDesignSystemFile(file));
  const result = extracted === undefined ? undefined : {
    ...extracted,
    diagnostics: [...catalogDiagnostics, ...extracted.diagnostics, ...validateFlutterThemeGeneration(extracted.tokens, extracted.tokenThemes, generatedFiles!)],
  };
  const sendDesignSystemFiles = !designSystemFilesSent;
  designSystemFilesSent = true;
  const message: PluginToUiMessage = {
    source: "penpot-to-flutter",
    type: "conversion",
    selectionCount: selection.length,
    tokenCatalog: catalog.stats,
    tokenCatalogDiagnostics: catalogDiagnostics,
    tokenBindings: tokenBindingStats(result),
    ...(sendDesignSystemFiles ? { designSystemFiles: designSystem.themeFiles.filter(isStableDesignSystemFile) } : {}),
    ...(result === undefined
      ? {}
      : {
          result: { diagnostics: result.diagnostics },
          dart: generatedFiles![0].source,
          pubspecAssets: generatePubspecSnippet(result.assets, result.fonts),
          files,
        }),
  };
  penpot.ui.sendMessage(message);
}

function isStableDesignSystemFile(file: GeneratedFile): boolean {
  return file.path.startsWith("theme/") || file.path === "penpot_manifest.json";
}

function tokenBindingStats(result: ReturnType<typeof extractSelection> | undefined): TokenBindingStats {
  const stats = { colors: 0, spacing: 0, typography: 0, radius: 0, other: 0 };
  if (result === undefined) return stats;
  const visit = (node: IrNode): void => {
    for (const reference of node.tokenReferences ?? []) {
      if (reference.tokenType === "color") stats.colors++;
      else if (reference.tokenType === "spacing") stats.spacing++;
      else if (reference.tokenType === "typography" || reference.tokenType?.startsWith("font-") === true || reference.tokenType === "letter-spacing" || reference.tokenType === "line-height") stats.typography++;
      else if (reference.tokenType === "border-radius") stats.radius++;
      else stats.other++;
    }
    if ("children" in node) node.children.forEach(visit);
  };
  visit(result.root);
  result.components.forEach((component) => visit(component.root));
  return stats;
}

function getDesignSystem(): CachedDesignSystem {
  if (cachedDesignSystem !== undefined) return cachedDesignSystem;
  const loaded = loadTokenCatalog();
  const registry = buildTokenRegistry(loaded.catalog.input.tokens, loaded.catalog.input.sets, loaded.catalog.input.themes);
  cachedDesignSystem = {
    ...loaded,
    tokenInput: { ...loaded.catalog.input, registry },
    themeFiles: generateFlutterThemeFiles(registry.tokens, registry.sets, registry.themes),
    typography: typographyInput(),
  };
  console.info("Token catalog loaded", loaded.catalog.stats);
  console.info("Token sets", loaded.catalog.stats.setNames);
  console.info("Token themes", loaded.catalog.stats.themeNames);
  return cachedDesignSystem;
}

function loadTokenCatalog(): { readonly catalog: ExtractedTokenCatalog; readonly diagnostics: readonly Diagnostic[] } {
  try {
    const catalog = extractTokenCatalog(penpot.library.local.tokens);
    if (catalog.stats.sets > 0 || catalog.stats.themes > 0 || catalog.stats.tokens > 0) return { catalog, diagnostics: catalog.diagnostics };
    return {
      catalog,
      diagnostics: [...catalog.diagnostics, { severity: "warning", sourceId: "token-catalog", code: "TOKEN_CATALOG_EMPTY_UNEXPECTEDLY", message: "Penpot returned an empty TokenCatalog. If the Tokens tab contains definitions, verify that this plugin is running against a Penpot version exposing the 1.5 TokenCatalog API." }],
    };
  } catch (error) {
    console.error("Token catalog unavailable", error);
    return {
      catalog: { input: {}, diagnostics: [], stats: { sets: 0, themes: 0, tokens: 0, groups: [], setNames: [], themeNames: [] } },
      diagnostics: [{ severity: "error", sourceId: "token-catalog", code: "TOKEN_CATALOG_UNAVAILABLE", message: "Unable to read penpot.library.local.tokens; token/theme generation was stopped rather than inferred from shape literals." }],
    };
  }
}

function enrichShape(shape: PenpotSourceShape): PenpotSourceShape {
  const bindings = (shape as unknown as LiveTokenShape).tokens;
  // Detect component metadata on the live Penpot proxy before cloning it: its
  // component methods may be non-enumerable and would otherwise be lost.
  let enriched = enrichComponent(shape);
  if (bindings !== undefined) enriched = withTokenBindings(enriched, bindings);
  if (enriched.type === "text") {
    const runs = textRunsOf(enriched as LiveTextShape);
    if (runs !== undefined) enriched = { ...enriched, runs };
  }
  const enrichedChildren = enriched.children;
  return enrichedChildren == null || enrichedChildren.length === 0 ? enriched : { ...enriched, children: enrichedChildren.map(enrichShape) };
}

function enrichComponent(shape: PenpotSourceShape): PenpotSourceShape {
  const live = shape as unknown as LiveComponentShape;
  try {
    // Nested component trees report their head independently from the outer
    // component root. Both identify a reusable component boundary.
    const isBoundary = live.isComponentRoot?.() === true || live.isComponentHead?.() === true;
    const isInstance = isBoundary && (live.isComponentInstance?.() === true || live.isComponentCopyInstance?.() === true);
    const isMain = isBoundary && live.isComponentMainInstance?.() === true;
    if (!isInstance && !isMain) return shape;
    const component = live.component?.();
    return {
      ...shape,
      ...(shape.children == null ? {} : { children: shape.children }),
      ...(typeof component?.id === "string" && component.id !== "" ? { componentId: component.id } : {}),
      ...(typeof component?.libraryId === "string" && component.libraryId !== "" ? { componentLibraryId: component.libraryId } : {}),
      ...(typeof component?.path === "string" && component.path !== "" ? { componentPath: component.path } : {}),
      ...(isInstance ? { isComponentInstance: true, isComponentRoot: true } : {}),
      ...(isMain ? { isComponentMainInstance: true, isComponentRoot: true } : {}),
    };
  } catch {
    return shape;
  }
}

async function resolveComponentSources(selection: readonly PenpotSourceShape[]): Promise<{ components: readonly PenpotComponentSource[]; variants: readonly PenpotVariantFamilySource[]; issues: ReadonlyMap<string, ResolutionIssue>; identities: ReadonlyMap<string, { readonly componentId: string; readonly libraryId: string }> }> {
  const libraryContext = penpot.library as unknown as ReadOnlyLibraryContext;
  const resolver = new LibraryResolver(libraryContext);
  const sources = new Map<string, PenpotComponentSource>();
  const variantFamilies = new Map<string, PenpotVariantFamilySource>();
  const issues = new Map<string, ResolutionIssue>();
  const identities = new Map<string, { readonly componentId: string; readonly libraryId: string }>();
  const queue: PenpotSourceShape[] = [...selection];
  const visitedInstances = new Set<string>();

  while (queue.length > 0) {
    const shape = queue.shift()!;
    if ((shape.isComponentInstance === true || shape.isComponentMainInstance === true) && !visitedInstances.has(shape.id)) {
      visitedInstances.add(shape.id);
      await resolveOne(shape);
    }
    for (const child of shape.children ?? []) queue.push(child);
  }

  return {
    components: [...sources.values()].map((source) => ({ ...source, root: withResolutionIssues(source.root, issues) })),
    variants: [...variantFamilies.values()].map((variant) => ({
      ...variant,
      members: variant.members.map((member) => ({ ...member, root: withResolutionIssues(member.root, issues) })),
    })),
    issues,
    identities,
  };

  async function resolveOne(shape: PenpotSourceShape): Promise<void> {
    const live = shape as unknown as LiveComponentShape;
    let directComponent: LibraryComponentLike | undefined;
    try {
      directComponent = live.component?.() ?? undefined;
    } catch {
      // Fall back to the stable IDs copied during normalization.
    }
    const result = await resolver.resolve({
      componentId: typeof shape.componentId === "string" ? shape.componentId : undefined,
      libraryId: typeof shape.componentLibraryId === "string" ? shape.componentLibraryId : undefined,
      componentName: typeof directComponent?.name === "string" ? directComponent.name : shape.name,
      componentPath: typeof directComponent?.path === "string" ? directComponent.path : shape.componentPath ?? undefined,
      ...(directComponent === undefined ? {} : { directComponent }),
    });
    if (result.status !== "resolved") {
      issues.set(shape.id, issueFor(result, shape));
      return;
    }
    if (result.source === "relinked") {
      identities.set(shape.id, { componentId: result.component.id, libraryId: result.library.id });
      issues.set(shape.id, {
        code: "COMPONENT_RELINKED_BY_PATH",
        message: `Component "${shape.name}" (${shape.componentId ?? "unknown"}) was not found by source ID and was relinked uniquely by name${shape.componentPath == null ? "" : ` and path "${shape.componentPath}"`} in library ${result.library.id}.`,
      });
    }

    if (result.component.isVariant?.() === true && result.component.variants != null) {
      await resolveVariantFamily(result.component, shape);
      return;
    }

    const key = componentKey(result.component.libraryId, result.component.id);
    if (sources.has(key)) return;
    try {
      const main = result.component.mainInstance() as PenpotSourceShape | null;
      if (main === null) {
        issues.set(shape.id, {
          code: "SHARED_COMPONENT_MAIN_INSTANCE_UNAVAILABLE",
          message: `Unable to read the canonical main instance for component "${result.component.name}" (${result.component.id}) from library "${result.library.name}" (${result.library.id}).`,
        });
        return;
      }
      const root = enrichShape(main);
      sources.set(key, { id: result.component.id, libraryId: result.component.libraryId, name: result.component.name, root });
      for (const child of root.children ?? []) queue.push(child);
    } catch {
      issues.set(shape.id, {
        code: "SHARED_COMPONENT_MAIN_INSTANCE_UNAVAILABLE",
        message: `Unable to read the canonical main instance for component "${result.component.name}" (${result.component.id}) from library "${result.library.name}" (${result.library.id}).`,
      });
    }
  }

  async function resolveVariantFamily(component: LibraryComponentLike, sourceShape: PenpotSourceShape): Promise<void> {
    const variants = component.variants;
    if (variants == null) {
      issues.set(sourceShape.id, { code: "VARIANT_FAMILY_UNRESOLVED", message: `Variant family metadata is unavailable for component "${component.name}" (${component.id}).` });
      return;
    }
    const familyKey = componentKey(variants.libraryId, `variant-${variants.id}`);
    if (variantFamilies.has(familyKey)) return;
    const members: PenpotVariantMemberSource[] = [];
    for (const member of [...variants.variantComponents()].sort((a, b) => a.id.localeCompare(b.id))) {
      try {
        const main = member.mainInstance() as PenpotSourceShape | null;
        if (main == null) continue;
        const root = enrichShape(main);
        const source = { id: member.id, libraryId: member.libraryId, name: member.name, root };
        sources.set(componentKey(member.libraryId, member.id), source);
        members.push({ ...source, values: member.variantProps ?? {} });
        for (const child of root.children ?? []) queue.push(child);
      } catch {
        // Missing members are diagnosed below with the family context.
      }
    }
    if (members.length === 0) {
      issues.set(sourceShape.id, { code: "VARIANT_MEMBER_MISSING", message: `No canonical members could be read for variant family ${variants.id} in library ${variants.libraryId}.` });
      return;
    }
    const familyName = variantFamilyName(component);
    variantFamilies.set(familyKey, {
      id: variants.id,
      libraryId: variants.libraryId,
      name: familyName,
      properties: [...variants.properties],
      members,
      defaultComponentId: members[0].id,
    });
  }
}

function variantFamilyName(component: LibraryComponentLike): string {
  const name = component.name.trim();
  const path = component.path?.trim();
  const nameParts = name.split("/").map((part) => part.trim()).filter(Boolean);
  if (nameParts.length > 1) return nameParts[nameParts.length - 1];
  if (path !== undefined && path !== "" && path.includes("/")) return path.split("/").filter(Boolean).pop() ?? name;
  if (name !== "" && name !== path) return name;
  return path === undefined || path === "" ? name : path;
}

function issueFor(result: Exclude<ComponentResolution, { status: "resolved" }>, shape: PenpotSourceShape): ResolutionIssue {
  const nodeId = shape.id;
  switch (result.status) {
    case "missing-identity":
      return { code: "SHARED_COMPONENT_RESOLUTION_FAILED", message: `Component identity is unavailable for instance "${shape.name}" (${nodeId}). Recreate or relink the Penpot component instance.` };
    case "library-not-connected":
      return { code: "SHARED_LIBRARY_NOT_CONNECTED", message: `Unable to resolve component "${shape.name}" (${result.componentId}) from shared library "${result.library.name}" (${result.library.id}). Connect this library to the current Penpot file, then regenerate.` };
    case "library-unavailable":
      return { code: "SHARED_LIBRARY_UNAVAILABLE", message: `Shared library ${result.libraryId} containing component "${shape.name}" (${result.componentId}) is unavailable to this Penpot file. Verify access and library publication.` };
    case "library-connection-failed":
      return { code: "SHARED_LIBRARY_CONNECTION_FAILED", message: `Unable to connect shared library ${result.libraryId} to resolve component "${shape.name}" (${result.componentId}). Check library permissions and connection status.` };
    case "component-not-found":
      return { code: "SHARED_COMPONENT_NOT_FOUND", message: `Shared library "${result.library.name}" (${result.library.id}) does not contain component "${shape.name}" (${result.componentId}). Update or relink the instance.` };
    case "resolution-failed":
      return { code: "SHARED_COMPONENT_RESOLUTION_FAILED", message: `Unable to resolve component "${shape.name}" (${result.componentId ?? "unknown"})${result.libraryId === undefined ? "" : ` from library ${result.libraryId}`}.` };
  }
}

function withResolutionIssues(
  shape: PenpotSourceShape,
  issues: ReadonlyMap<string, ResolutionIssue>,
  identities: ReadonlyMap<string, { readonly componentId: string; readonly libraryId: string }> = new Map(),
): PenpotSourceShape {
  const children = shape.children?.map((child) => withResolutionIssues(child, issues, identities));
  const issue = issues.get(shape.id);
  const identity = identities.get(shape.id);
  return {
    ...shape,
    ...(children === undefined ? {} : { children }),
    ...(identity === undefined ? {} : { componentId: identity.componentId, componentLibraryId: identity.libraryId }),
    ...(issue === undefined ? {} : { componentResolutionIssue: issue }),
  };
}

function textRunsOf(shape: LiveTextShape): readonly PenpotSourceTextRun[] | undefined {
  if (typeof shape.getRange !== "function") return undefined;
  if (!hasMixed(shape.fontFamily, shape.fontSize, shape.fontWeight, shape.fontStyle, shape.textDecoration, shape.textTransform)) return undefined;
  const characters = typeof shape.characters === "string" ? shape.characters : "";
  if (characters.length === 0) return undefined;
  try {
    const runs: PenpotSourceTextRun[] = [];
    for (let start = 0; start < characters.length;) {
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
    ...(range.fontId == null || range.fontId === "mixed" ? {} : { fontId: String(range.fontId) }),
    ...(range.fontFamily == null || range.fontFamily === "mixed" ? {} : { fontFamily: String(range.fontFamily) }),
    ...(range.fontSize == null || range.fontSize === "mixed" ? {} : { fontSize: String(range.fontSize) }),
    ...(range.fontWeight == null || range.fontWeight === "mixed" ? {} : { fontWeight: String(range.fontWeight) }),
    ...(range.fontStyle === "italic" ? { fontStyle: "italic" } : range.fontStyle === "normal" ? { fontStyle: "normal" } : {}),
    ...(range.lineHeight == null || range.lineHeight === "mixed" ? {} : { lineHeight: String(range.lineHeight) }),
    ...(range.letterSpacing == null || range.letterSpacing === "mixed" ? {} : { letterSpacing: String(range.letterSpacing) }),
    ...(range.textDecoration === "underline" || range.textDecoration === "line-through" ? { textDecoration: range.textDecoration } : {}),
    ...(range.textTransform === "uppercase" || range.textTransform === "lowercase" || range.textTransform === "capitalize" || range.textTransform === "none" ? { textTransform: range.textTransform } : {}),
    ...(range.fills === undefined || range.fills === "mixed" ? {} : { fills: range.fills as PenpotSourceTextRun["fills"] }),
  };
}

function sameStyle(a: Omit<PenpotSourceTextRun, "characters">, b: Omit<PenpotSourceTextRun, "characters">): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function typographyInput() {
  return {
    fonts: penpot.fonts.all.map((font) => ({
      id: font.fontId,
      family: font.fontFamily,
      variants: font.variants.flatMap((variant) => {
        const weight = Number(variant.fontWeight);
        return Number.isFinite(weight) ? [{ weight, style: variant.fontStyle }] : [];
      }),
    })),
    defaultFallbackFamilies: ["sans-serif"],
  } as const;
}

penpot.ui.onMessage<unknown>((message) => {
  if (isUiToPluginMessage(message)) {
    designSystemFilesSent = false;
    void sendConversion();
  }
});

penpot.on("selectionchange", () => {
  void sendConversion();
});

penpot.on("filechange", () => {
  cachedDesignSystem = undefined;
  designSystemFilesSent = false;
  void sendConversion();
});
