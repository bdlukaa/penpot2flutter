import { extractSelection, type PenpotComponentSource, type PenpotSourceShape, type PenpotSourceTextRun, type PenpotVariantFamilySource, type PenpotVariantMemberSource } from "./core/extractor.js";
import { generateFlutterFiles, generateFlutterWidget, generatePubspecSnippet } from "./core/flutter-generator.js";
import { LibraryResolver, type ComponentResolution, type LibraryComponentLike, type ReadOnlyLibraryContext } from "./penpot/library-resolver.js";
import { componentKey } from "./shared/component-key.js";
import type { PluginToUiMessage } from "./shared/messages.js";

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

interface LiveComponentShape {
  readonly isComponentInstance?: () => boolean;
  readonly isComponentCopyInstance?: () => boolean;
  readonly isComponentMainInstance?: () => boolean;
  readonly isComponentRoot?: () => boolean;
  readonly component?: () => LibraryComponentLike | null;
}

interface ResolutionIssue {
  readonly code: string;
  readonly message: string;
}

penpot.ui.open("Penpot to Flutter", `?theme=${penpot.theme}`, { width: 720, height: 640 });

function isUiToPluginMessage(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const message = value as { source?: unknown; type?: unknown };
  return message.source === "penpot-to-flutter" && message.type === "request-conversion";
}

async function sendConversion(): Promise<void> {
  const rawSelection = penpot.selection as unknown as readonly PenpotSourceShape[];
  const selection = rawSelection.map(enrichShape);
  const resolution = await resolveComponentSources(selection);
  const resolvedSelection = selection.map((shape) => withResolutionIssues(shape, resolution.issues));
  const result = resolvedSelection.length === 0 ? undefined : extractSelection(resolvedSelection, resolution.components, resolution.variants, {}, typographyInput());
  const message: PluginToUiMessage = {
    source: "penpot-to-flutter",
    type: "conversion",
    selectionCount: selection.length,
    ...(result === undefined
      ? {}
      : {
          result,
          dart: generateFlutterWidget(result.root, result.components, result.tokens, result.responsiveScreen),
          pubspecAssets: generatePubspecSnippet(result.assets, result.fonts),
          files: generateFlutterFiles(result.root, result.components, result.tokens, result.tokenSets, result.tokenThemes, result.responsiveScreen),
        }),
  };
  penpot.ui.sendMessage(message);
}

function enrichShape(shape: PenpotSourceShape): PenpotSourceShape {
  let enriched = enrichComponent(shape);
  if (enriched.type === "text") {
    const runs = textRunsOf(enriched as LiveTextShape);
    if (runs !== undefined) enriched = { ...enriched, runs };
  }
  const children = enriched.children;
  return children == null || children.length === 0 ? enriched : { ...enriched, children: children.map(enrichShape) };
}

function enrichComponent(shape: PenpotSourceShape): PenpotSourceShape {
  const live = shape as unknown as LiveComponentShape;
  try {
    const isRoot = live.isComponentRoot?.() === true;
    const isInstance = isRoot && (live.isComponentInstance?.() === true || live.isComponentCopyInstance?.() === true);
    const isMain = isRoot && live.isComponentMainInstance?.() === true;
    if (!isInstance && !isMain) return shape;
    const component = live.component?.();
    return {
      ...shape,
      ...(shape.children == null ? {} : { children: shape.children }),
      ...(typeof component?.id === "string" && component.id !== "" ? { componentId: component.id } : {}),
      ...(typeof component?.libraryId === "string" && component.libraryId !== "" ? { componentLibraryId: component.libraryId } : {}),
      ...(isInstance ? { isComponentInstance: true, isComponentRoot: true } : {}),
      ...(isMain ? { isComponentMainInstance: true, isComponentRoot: true } : {}),
    };
  } catch {
    return shape;
  }
}

async function resolveComponentSources(selection: readonly PenpotSourceShape[]): Promise<{ components: readonly PenpotComponentSource[]; variants: readonly PenpotVariantFamilySource[]; issues: ReadonlyMap<string, ResolutionIssue> }> {
  const resolver = new LibraryResolver(penpot.library as unknown as ReadOnlyLibraryContext);
  const sources = new Map<string, PenpotComponentSource>();
  const variantFamilies = new Map<string, PenpotVariantFamilySource>();
  const issues = new Map<string, ResolutionIssue>();
  const queue: PenpotSourceShape[] = [...selection];
  const visitedInstances = new Set<string>();

  while (queue.length > 0) {
    const shape = queue.shift()!;
    if (shape.isComponentInstance === true && !visitedInstances.has(shape.id)) {
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
      ...(directComponent === undefined ? {} : { directComponent }),
    });
    if (result.status !== "resolved") {
      issues.set(shape.id, issueFor(result, shape));
      return;
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
  const path = component.path?.trim();
  if (path !== undefined && path !== "") return path.split("/").filter(Boolean).pop() ?? component.name;
  return component.name;
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
    case "component-not-found":
      return { code: "SHARED_COMPONENT_NOT_FOUND", message: `Shared library "${result.library.name}" (${result.library.id}) does not contain component "${shape.name}" (${result.componentId}). Update or relink the instance.` };
    case "resolution-failed":
      return { code: "SHARED_COMPONENT_RESOLUTION_FAILED", message: `Unable to resolve component "${shape.name}" (${result.componentId ?? "unknown"})${result.libraryId === undefined ? "" : ` from library ${result.libraryId}`}.` };
  }
}

function withResolutionIssues(shape: PenpotSourceShape, issues: ReadonlyMap<string, ResolutionIssue>): PenpotSourceShape {
  const children = shape.children?.map((child) => withResolutionIssues(child, issues));
  const issue = issues.get(shape.id);
  return {
    ...shape,
    ...(children === undefined ? {} : { children }),
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
  if (isUiToPluginMessage(message)) void sendConversion();
});

penpot.on("selectionchange", () => {
  void sendConversion();
});

void sendConversion();
