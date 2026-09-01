import { componentKey } from "../shared/component-key.js";
import { analyzeResponsiveCandidates, type ResponsiveMetadata } from "./responsive-analyzer.js";
import { buildTokenRegistry, type PenpotTokenSetSource, type PenpotTokenSource, type PenpotTokenThemeSource } from "./token-registry.js";
import type {
  AssetManifestEntry,
  BoardNode,
  Border,
  ColorFill,
  ConversionResult,
  CornerRadii,
  Diagnostic,
  DropShadow,
  EllipseNode,
  FlexAlignment,
  FlexDirection,
  FlexJustification,
  FlexLayout,
  GradientFill,
  GridLayout,
  GridTrack,
  GroupNode,
  ImageFill,
  ImageNode,
  IrArgument,
  IrComponentDefinition,
  IrComponentInstanceNode,
  IrComponentParameter,
  IrFontManifestEntry,
  IrNode,
  IrTextTransform,
  IrTokenReference,
  IrTypographyStyle,
  IrVariantAxis,
  IrVariantFamily,
  IrVariantMember,
  IrVariantSelection,
  LayoutChild,
  LayoutSizing,
  NodeGeometry,
  NodeStyle,
  NodeTransform,
  RectangleNode,
  SvgNode,
  TextNode,
  TextRun,
  TextStyle,
  UnsupportedNode,
} from "../shared/ir.js";

export interface PenpotSourceImageData {
  readonly id?: string | null;
  readonly name?: string | null;
  readonly width: number;
  readonly height: number;
  readonly mtype?: string | null;
  readonly keepAspectRatio?: boolean | null;
}

export interface PenpotSourceGradientStop {
  readonly color?: string | null;
  readonly opacity?: number | null;
  readonly offset?: number | null;
}

export interface PenpotSourceGradient {
  readonly type?: "linear" | "radial" | null;
  readonly startX?: number | null;
  readonly startY?: number | null;
  readonly endX?: number | null;
  readonly endY?: number | null;
  readonly width?: number | null;
  readonly stops?: readonly PenpotSourceGradientStop[] | null;
}

export interface PenpotSourceFill {
  readonly fillColor?: string | null;
  readonly fillOpacity?: number | null;
  readonly fillColorGradient?: PenpotSourceGradient | null;
  readonly fillImage?: PenpotSourceImageData | null;
}

export interface PenpotSourceStroke {
  readonly strokeColor?: string | null;
  readonly strokeOpacity?: number | null;
  readonly strokeStyle?: "solid" | "dotted" | "dashed" | "mixed" | "none" | "svg" | null;
  readonly strokeWidth?: number | null;
}

export interface PenpotSourceShadow {
  readonly style?: "drop-shadow" | "inner-shadow" | null;
  readonly offsetX?: number | null;
  readonly offsetY?: number | null;
  readonly blur?: number | null;
  readonly spread?: number | null;
  readonly hidden?: boolean | null;
  readonly color?: { readonly color?: string | null; readonly opacity?: number | null } | null;
}

export interface PenpotSourceFlexLayout {
  readonly dir?: FlexDirection | null;
  readonly rowGap?: number | null;
  readonly columnGap?: number | null;
  readonly topPadding?: number | null;
  readonly rightPadding?: number | null;
  readonly bottomPadding?: number | null;
  readonly leftPadding?: number | null;
  readonly justifyContent?: FlexJustification | null;
  readonly alignItems?: FlexAlignment | null;
}

export interface PenpotSourceGridTrack {
  readonly type?: "flex" | "fixed" | "percent" | "auto" | null;
  readonly value?: number | null;
}

export interface PenpotSourceGridLayout {
  readonly dir?: "row" | "column" | null;
  readonly rows?: readonly PenpotSourceGridTrack[] | null;
  readonly columns?: readonly PenpotSourceGridTrack[] | null;
  readonly rowGap?: number | null;
  readonly columnGap?: number | null;
  readonly topPadding?: number | null;
  readonly rightPadding?: number | null;
  readonly bottomPadding?: number | null;
  readonly leftPadding?: number | null;
}

export interface PenpotSourceLayoutChild {
  readonly absolute?: boolean | null;
  readonly horizontalSizing?: LayoutSizing | null;
  readonly verticalSizing?: LayoutSizing | null;
  readonly minWidth?: number | null;
  readonly maxWidth?: number | null;
  readonly minHeight?: number | null;
  readonly maxHeight?: number | null;
  readonly aspectRatio?: number | null;
}

export interface PenpotSourceLayoutCell {
  readonly row?: number | null;
  readonly rowSpan?: number | null;
  readonly column?: number | null;
  readonly columnSpan?: number | null;
  readonly position?: "auto" | "manual" | "area" | null;
}

export interface PenpotSourceTextRun {
  readonly characters?: string | null;
  readonly fontId?: string | null;
  readonly fontFamily?: string | null;
  readonly fallbackFamilies?: readonly string[] | null;
  readonly fontSize?: string | null;
  readonly fontWeight?: string | null;
  readonly fontStyle?: "normal" | "italic" | "mixed" | null;
  readonly lineHeight?: string | null;
  readonly letterSpacing?: string | null;
  readonly textDecoration?: "underline" | "line-through" | "none" | "mixed" | null;
  readonly textTransform?: "uppercase" | "capitalize" | "lowercase" | "none" | "mixed" | null;
  readonly fills?: readonly PenpotSourceFill[] | "mixed" | null;
  readonly children?: readonly PenpotSourceTextRun[] | null;
}

export interface PenpotComponentSource {
  readonly id: string;
  readonly libraryId?: string | null;
  readonly name: string;
  readonly root: PenpotSourceShape;
}

export interface PenpotVariantMemberSource extends PenpotComponentSource {
  readonly values: Readonly<Record<string, string>>;
}

export interface PenpotVariantFamilySource {
  readonly id: string;
  readonly libraryId?: string | null;
  readonly name: string;
  readonly properties: readonly string[];
  readonly members: readonly PenpotVariantMemberSource[];
  readonly defaultComponentId: string;
}

export interface PenpotSourceShape {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly parentX?: number | null;
  readonly parentY?: number | null;
  readonly width: number;
  readonly height: number;
  readonly visible: boolean;
  readonly opacity?: number | null;
  readonly rotation?: number | null;
  readonly flipX?: boolean | null;
  readonly flipY?: boolean | null;
  readonly componentId?: string | null;
  readonly componentLibraryId?: string | null;
  readonly componentPath?: string | null;
  readonly zIndex?: number | null;
  readonly isComponentInstance?: boolean | null;
  readonly isComponentMainInstance?: boolean | null;
  readonly isComponentRoot?: boolean | null;
  readonly componentResolutionIssue?: { readonly code: string; readonly message: string } | null;
  readonly fills?: readonly PenpotSourceFill[] | "mixed" | null;
  readonly strokes?: readonly PenpotSourceStroke[] | null;
  readonly borderRadius?: number | null;
  readonly borderRadiusTopLeft?: number | null;
  readonly borderRadiusTopRight?: number | null;
  readonly borderRadiusBottomRight?: number | null;
  readonly borderRadiusBottomLeft?: number | null;
  readonly shadows?: readonly PenpotSourceShadow[] | null;
  readonly children?: readonly PenpotSourceShape[] | null;
  readonly clipContent?: boolean | null;
  readonly flex?: PenpotSourceFlexLayout | null;
  readonly grid?: PenpotSourceGridLayout | null;
  readonly layoutChild?: PenpotSourceLayoutChild | null;
  readonly layoutCell?: PenpotSourceLayoutCell | null;
  readonly characters?: string | null;
  readonly growType?: "fixed" | "auto-width" | "auto-height" | null;
  readonly fontId?: string | null;
  readonly fontFamily?: string | null;
  readonly fontFamilyFallbacks?: readonly string[] | null;
  readonly fontSize?: string | null;
  readonly fontWeight?: string | null;
  readonly fontStyle?: "normal" | "italic" | "mixed" | null;
  readonly lineHeight?: string | null;
  readonly letterSpacing?: string | null;
  readonly textDecoration?: "underline" | "line-through" | "none" | "mixed" | null;
  readonly textTransform?: "uppercase" | "capitalize" | "lowercase" | "mixed" | null;
  readonly align?: "left" | "center" | "right" | "justify" | "mixed" | null;
  readonly verticalAlign?: "top" | "center" | "bottom" | null;
  readonly maxLines?: number | null;
  readonly overflow?: "ellipsis" | "clip" | "fade" | "visible" | null;
  readonly softWrap?: boolean | null;
  readonly runs?: readonly PenpotSourceTextRun[] | null;
  /** Future Penpot Token API adapter output: property key to stable token ID. */
  readonly tokenBindings?: Readonly<Record<string, string>> | null;
  /** Optional explicit grouping; name-based inference is used when absent. */
  readonly responsive?: ResponsiveMetadata | null;
}

export interface PenpotFontVariantSource {
  readonly weight: number;
  readonly style: "normal" | "italic";
  readonly assetPath?: string;
}

export interface PenpotFontSource {
  readonly id: string;
  readonly family: string;
  readonly variants: readonly PenpotFontVariantSource[];
}

export interface PenpotTypographyInput {
  readonly fonts?: readonly PenpotFontSource[];
  readonly defaultFallbackFamilies?: readonly string[];
}

export interface PenpotTokenInput {
  readonly tokens?: readonly PenpotTokenSource[];
  readonly sets?: readonly PenpotTokenSetSource[];
  readonly themes?: readonly PenpotTokenThemeSource[];
}

interface ComponentSlot {
  readonly parameterName: string;
  readonly defaultText: string;
  readonly type?: "String" | "Color";
}

interface ComponentBuilder {
  readonly id: string;
  readonly sourceComponentId: string;
  readonly sourceName: string;
  readonly dartName: string;
  readonly libraryId?: string;
  root?: IrNode;
  readonly slots: Map<string, ComponentSlot>;
  readonly usedParameterNames: Set<string>;
  readonly overridden: Set<string>;
  readonly dependencies: Set<string>;
  readonly variant?: PenpotVariantFamilySource;
  readonly variantAxes?: readonly IrVariantAxis[];
  readonly variantRepresentation?: "axes" | "members";
  readonly variantEnumName?: string;
  variantMembers?: readonly IrVariantMember[];
}

interface TypographyCandidate {
  readonly id: string;
  readonly name: string;
  readonly style: TextStyle;
  count: number;
}

interface FontUsage {
  readonly family: string;
  readonly fallbackFamilies: Set<string>;
  readonly weights: Set<number>;
  readonly styles: Set<"normal" | "italic">;
}

interface ExtractionContext {
  readonly diagnostics: Diagnostic[];
  readonly assets: Map<string, AssetManifestEntry>;
  readonly componentSources: Map<string, PenpotSourceShape>;
  readonly componentAliases: Map<string, string>;
  readonly components: Map<string, ComponentBuilder>;
  readonly componentOrder: string[];
  readonly usedDartNames: Map<string, string>;
  readonly tokenIds: ReadonlySet<string>;
  readonly typographyCandidates: Map<string, TypographyCandidate>;
  readonly usedTypographyNames: Set<string>;
  readonly fontSources: ReadonlyMap<string, PenpotFontSource>;
  readonly fontResolutionEnabled: boolean;
  readonly fontUsages: Map<string, FontUsage>;
  readonly defaultFallbackFamilies: readonly string[];
  readonly diagnosedFonts: Set<string>;
  currentComponent?: string;
}

export function extractSelection(
  selection: readonly PenpotSourceShape[],
  components: readonly PenpotComponentSource[] = [],
  variants: readonly PenpotVariantFamilySource[] = [],
  tokenInput: PenpotTokenInput = {},
  typographyInput: PenpotTypographyInput = {},
): ConversionResult {
  const tokenRegistry = buildTokenRegistry(tokenInput.tokens, tokenInput.sets, tokenInput.themes);
  const context: ExtractionContext = {
    diagnostics: [...tokenRegistry.diagnostics],
    assets: new Map<string, AssetManifestEntry>(),
    componentSources: new Map(),
    componentAliases: new Map(),
    components: new Map(),
    componentOrder: [],
    usedDartNames: new Map(),
    tokenIds: new Set(tokenRegistry.tokens.map((token) => token.id)),
    typographyCandidates: new Map(),
    usedTypographyNames: new Set(),
    fontSources: new Map((typographyInput.fonts ?? []).map((font) => [font.family.toLowerCase(), font])),
    fontResolutionEnabled: typographyInput.fonts !== undefined,
    fontUsages: new Map(),
    defaultFallbackFamilies: typographyInput.defaultFallbackFamilies ?? ["sans-serif"],
    diagnosedFonts: new Set(),
  };

  registerVariants(variants, context);
  registerComponents(components, context);
  for (const componentId of context.componentOrder) {
    collectSlots(context.componentSources.get(componentId)!, componentId, context, "");
  }
  for (const componentId of context.componentOrder) {
    const builder = context.components.get(componentId)!;
    context.currentComponent = componentId;
    builder.root = extractNode(context.componentSources.get(componentId)!, context, "");
    if (builder.variant !== undefined && builder.variantAxes !== undefined) {
      const variantAxes = builder.variantAxes;
      const sortedVariantMembers = [...builder.variant.members].sort((a, b) => a.id.localeCompare(b.id));
      const usedVariantMemberNames = new Set<string>();
      builder.variantMembers = sortedVariantMembers.map((member) => ({
        componentId: componentKey(builder.libraryId, member.id),
        values: variantMemberSelections(member, variantAxes),
        root: extractNode(canonicalComponentRoot(member.root), context, ""),
        dartName: variantMemberDartName(member, variantAxes, usedVariantMemberNames),
      }));
    }
    context.currentComponent = undefined;
  }

  const extractedSelection = selection.map((shape) => extractNode(shape, context, ""));
  const responsive = selection.every((shape) => shape.type === "board")
    ? analyzeResponsiveCandidates(selection.map((shape, index) => ({
        sourceBoardId: sourceIdOf(shape.id),
        sourceName: sourceNameOf(shape.name, sourceIdOf(shape.id)),
        width: extractedSelection[index].geometry.width,
        root: extractedSelection[index],
        ...(shape.responsive == null ? {} : { metadata: shape.responsive }),
      })))
    : { diagnostics: [] };
  context.diagnostics.push(...responsive.diagnostics);
  const root = responsive.screen?.variants[0]?.root ?? (extractedSelection.length === 1 ? extractedSelection[0] : extractSyntheticSelection(extractedSelection));
  return {
    root,
    ...(responsive.screen === undefined ? {} : { responsiveScreen: responsive.screen }),
    assets: [...context.assets.values()],
    diagnostics: context.diagnostics,
    components: finalizeComponents(context),
    tokens: tokenRegistry.tokens,
    tokenSets: tokenRegistry.sets,
    tokenThemes: tokenRegistry.themes,
    typographyStyles: finalizeTypographyStyles(context),
    fonts: finalizeFontManifest(context),
  };
}

function extractSyntheticSelection(extractedChildren: readonly IrNode[]): GroupNode {
  const bounds = boundsOf(extractedChildren);
  return {
    kind: "group",
    sourceId: "selection",
    sourceName: "selection",
    name: "selection",
    geometry: { x: 0, y: 0, width: bounds.width, height: bounds.height },
    visible: true,
    style: { opacity: 1 },
    diagnostics: [],
    children: extractedChildren.map((child) => ({
      ...child,
      geometry: { ...child.geometry, x: child.geometry.x - bounds.x, y: child.geometry.y - bounds.y },
    })),
  };
}

function extractNode(shape: PenpotSourceShape, context: ExtractionContext, path: string): IrNode {
  if (isComponentRootInstance(shape)) {
    const instance = componentInstanceNode(shape, context);
    context.diagnostics.push(...instance.diagnostics);
    return instance.node;
  }

  const diagnostics: Diagnostic[] = [];
  const grid = shape.grid == null ? undefined : gridOf(shape.grid, shape, diagnostics);
  const transform = transformOf(shape, diagnostics);
  const base = {
    sourceId: sourceIdOf(shape.id),
    sourceName: sourceNameOf(shape.name, sourceIdOf(shape.id)),
    name: normalizeName(shape.name, sourceIdOf(shape.id)),
    geometry: geometryOf(shape, diagnostics),
    visible: shape.visible !== false,
    style: styleOf(shape, diagnostics, context),
    ...(transform === undefined ? {} : { transform }),
    ...(shape.layoutChild == null ? {} : { layoutChild: layoutChildOf(shape.layoutChild, shape, diagnostics) }),
    diagnostics,
    ...(context.currentComponent === undefined || context.components.get(context.currentComponent)?.slots.get(path + ":fill") === undefined ? {} : { fillParameterName: context.components.get(context.currentComponent)!.slots.get(path + ":fill")!.parameterName }),
    ...tokenReferencesOf(shape, context, diagnostics),
  };

  let node: IrNode;
  switch (shape.type) {
    case "board":
      node = {
        ...base,
        kind: "board",
        clipContent: shape.clipContent === true,
        ...(shape.flex == null ? {} : { flex: flexOf(shape.flex) }),
        ...(grid === undefined ? {} : { grid }),
        children: extractChildren(shape, context, path),
      } satisfies BoardNode;
      break;
    case "group":
      node = { ...base, kind: "group", children: extractChildren(shape, context, path) } satisfies GroupNode;
      break;
    case "rectangle":
    case "rect":
      node = { ...base, kind: "rectangle" } satisfies RectangleNode;
      break;
    case "ellipse":
      node = { ...base, kind: "ellipse" } satisfies EllipseNode;
      break;
    case "image":
      node = { ...base, kind: "image" } satisfies ImageNode;
      break;
    case "path":
    case "svg-raw":
    case "boolean":
      node = { ...base, kind: "svg", assetPath: svgAssetPathOf(shape, context) } satisfies SvgNode;
      break;
    case "text": {
      const textStyle = textStyleOf(shape, diagnostics, context);
      const runs = textRunsOf(shape, diagnostics, context);
      const parameterName = context.currentComponent === undefined ? undefined : context.components.get(context.currentComponent)?.slots.get(path)?.parameterName;
      const typographyStyleId = registerTypographyStyle(textStyle, shape.name, context);
      const textTransform = textTransformOf(shape.textTransform, shape, diagnostics);
      const maxLines = positiveInteger(shape.maxLines);
      if (shape.maxLines != null && maxLines === undefined) {
        diagnostics.push({ severity: "warning", sourceId: sourceIdOf(shape.id), code: "TEXT_STYLE_UNSUPPORTED", message: "Text maxLines must be a positive integer and was omitted." });
      }
      if (shape.overflow != null && maxLines !== undefined) {
        diagnostics.push({ severity: "warning", sourceId: sourceIdOf(shape.id), code: "TEXT_OVERFLOW_INFERRED", message: `Explicit ${shape.overflow} overflow was preserved with maxLines ${maxLines}.` });
      }
      node = {
        ...base,
        kind: "text",
        text: shape.characters ?? "",
        textStyle,
        ...(typographyStyleId === undefined ? {} : { typographyStyleId }),
        ...(textTransform === undefined ? {} : { textTransform }),
        ...(shape.verticalAlign == null ? {} : { verticalAlign: shape.verticalAlign }),
        ...(maxLines === undefined ? {} : { maxLines }),
        ...(shape.overflow == null ? {} : { overflow: shape.overflow }),
        ...(shape.softWrap == null ? {} : { softWrap: shape.softWrap }),
        ...(runs === undefined ? {} : { runs }),
        ...(parameterName === undefined ? {} : { parameterName }),
      } satisfies TextNode;
      break;
    }
    default:
      diagnostics.push({ severity: "warning", sourceId: base.sourceId, code: "unsupported-shape", message: `${shape.type} is not yet supported and was omitted from the generated widget.` });
      node = { ...base, kind: "unsupported", sourceType: shape.type } satisfies UnsupportedNode;
  }
  context.diagnostics.push(...diagnostics);
  return node;
}

function isComponentRootInstance(shape: PenpotSourceShape): boolean {
  return shape.isComponentInstance === true && shape.isComponentRoot !== false;
}

function extractChildren(shape: PenpotSourceShape, context: ExtractionContext, path: string): readonly IrNode[] {
  const children = shape.children ?? [];
  const hasStackOrder = children.length > 1 && children.every((child) => typeof child.zIndex === "number" && Number.isFinite(child.zIndex));
  const ordered = hasStackOrder ? [...children].sort((left, right) => right.zIndex! - left.zIndex!) : children;
  return ordered.map((child, index) => extractNode(child, context, pathKey(path, index)));
}

function pathKey(path: string, index: number): string {
  return path === "" ? String(index) : `${path}.${index}`;
}

function tokenReferencesOf(
  shape: PenpotSourceShape,
  context: ExtractionContext,
  diagnostics: Diagnostic[],
): { readonly tokenReferences?: readonly IrTokenReference[] } {
  const bindings = shape.tokenBindings;
  if (bindings == null) return {};
  const references = Object.entries(bindings)
    .filter(([property, tokenId]) => property !== "" && typeof tokenId === "string" && tokenId !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([property, tokenId]) => {
      if (!context.tokenIds.has(tokenId)) {
        diagnostics.push({
          severity: "warning",
          sourceId: sourceIdOf(shape.id),
          code: "TOKEN_UNRESOLVED",
          message: `Property "${property}" references unavailable design token ${tokenId}; its literal value will be used.`,
        });
      }
      return { property, tokenId };
    });
  return references.length === 0 ? {} : { tokenReferences: references };
}

function registerVariants(variants: readonly PenpotVariantFamilySource[], context: ExtractionContext): void {
  for (const variant of variants) {
    const libraryId = typeof variant.libraryId === "string" && variant.libraryId !== "" ? variant.libraryId : undefined;
    const id = componentKey(libraryId, `variant-${variant.id}`);
    if (context.components.has(id) || variant.members.length === 0) continue;
    const defaultMember = variant.members.find((member) => member.id === variant.defaultComponentId) ?? [...variant.members].sort((a, b) => a.id.localeCompare(b.id))[0];
    for (const member of variant.members) {
      const memberId = componentKey(libraryId, member.id);
      context.componentAliases.set(memberId, id);
      context.componentSources.set(memberId, canonicalComponentRoot(member.root));
    }
    context.componentSources.set(id, canonicalComponentRoot(defaultMember.root));
    const sourceName = variant.name.trim() === "" ? `Variant ${variant.id}` : variant.name;
    const structures = new Set(variant.members.map((member) => shapeStructure(member.root)));
    if (structures.size > 1) {
      context.diagnostics.push({ severity: "warning", sourceId: variant.id, code: "VARIANT_STRUCTURE_DIVERGENCE", message: `Variant family "${sourceName}" has structurally different members; generated code switches between private member subtrees.` });
    }
    const dartName = dartNameFor(sourceName, id, context, "VARIANT_FAMILY_NAME_COLLISION");
    const variantAxes = variantAxesOf(variant, dartName, context);
    context.components.set(id, {
      id,
      sourceComponentId: variant.id,
      sourceName,
      dartName,
      ...(libraryId === undefined ? {} : { libraryId }),
      slots: new Map(),
      usedParameterNames: new Set(variantAxes.map((axis) => axis.name)),
      overridden: new Set(),
      dependencies: new Set(),
      variant,
      variantAxes,
      variantRepresentation: variantRepresentationOf(variant),
      variantEnumName: `${dartName}Variant`,
    });
    context.componentOrder.push(id);
  }
}

function shapeStructure(shape: PenpotSourceShape): string {
  return `${shape.type}(${(shape.children ?? []).map(shapeStructure).join(",")})`;
}

function canonicalComponentRoot(root: PenpotSourceShape): PenpotSourceShape {
  return {
    ...root,
    ...(root.children == null ? {} : { children: root.children }),
    isComponentInstance: false,
  };
}

function registerComponents(components: readonly PenpotComponentSource[], context: ExtractionContext): void {
  for (const component of components) {
    if (typeof component.id !== "string" || component.id === "") continue;
    const libraryId = typeof component.libraryId === "string" && component.libraryId !== "" ? component.libraryId : undefined;
    const id = componentKey(libraryId, component.id);
    if (context.componentAliases.has(id) || context.componentSources.has(id)) continue;
    // Penpot's main-instance root can also report itself as a component instance.
    // It is the canonical definition here, so only its root must not become a self-call.
    context.componentSources.set(id, canonicalComponentRoot(component.root));
    const sourceName = typeof component.name === "string" && component.name.trim() !== "" ? component.name : `Component ${component.id}`;
    const dartName = dartNameFor(sourceName, id, context);
    context.components.set(id, {
      id,
      sourceComponentId: component.id,
      sourceName,
      dartName,
      ...(libraryId === undefined ? {} : { libraryId }),
      slots: new Map(),
      usedParameterNames: new Set(),
      overridden: new Set(),
      dependencies: new Set(),
    });
    context.componentOrder.push(id);
  }
}

function collectSlots(shape: PenpotSourceShape, componentId: string, context: ExtractionContext, path: string): void {
  if (isComponentRootInstance(shape)) return;
  const builder = context.components.get(componentId)!;
  if (fillColorKey(shape) !== undefined) {
    const parameterName = dedupeParameterName(path === "" ? "backgroundColor" : `${parameterNameFor(shape.name)}Color`, builder);
    builder.slots.set(path + ":fill", { parameterName, defaultText: fillColorKey(shape)! , type: "Color" });
  }
  if (shape.type === "text") {
    const parameterName = dedupeParameterName(parameterNameFor(shape.name), builder);
    builder.slots.set(path, { parameterName, defaultText: shape.characters ?? "" });
    return;
  }
  if (shape.type === "board" || shape.type === "group") {
    (shape.children ?? []).forEach((child, index) => collectSlots(child, componentId, context, pathKey(path, index)));
  }
}

function componentInstanceNode(shape: PenpotSourceShape, context: ExtractionContext): { node: IrNode; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const componentId = typeof shape.componentId === "string" && shape.componentId !== "" ? shape.componentId : undefined;
  if (componentId === undefined) {
    diagnostics.push({
      severity: "warning",
      sourceId: sourceIdOf(shape.id),
      code: shape.componentResolutionIssue?.code ?? "SHARED_COMPONENT_RESOLUTION_FAILED",
      message: shape.componentResolutionIssue?.message ?? `Component identity is unavailable for component instance "${sourceNameOf(shape.name, sourceIdOf(shape.id))}" (${sourceIdOf(shape.id)}).`,
    });
    const node: UnsupportedNode = {
      kind: "unsupported",
      sourceId: sourceIdOf(shape.id),
      sourceName: sourceNameOf(shape.name, sourceIdOf(shape.id)),
      name: normalizeName(shape.name, sourceIdOf(shape.id)),
      geometry: geometryOf(shape, diagnostics),
      visible: shape.visible !== false,
      style: { opacity: normalizedOpacity(shape.opacity, sourceIdOf(shape.id), diagnostics) },
      diagnostics,
      sourceType: "component-instance",
    };
    return { node, diagnostics };
  }
  const sourceComponentIdentity = componentKey(
    typeof shape.componentLibraryId === "string" && shape.componentLibraryId !== "" ? shape.componentLibraryId : undefined,
    componentId,
  );
  const componentIdentity = context.componentAliases.get(sourceComponentIdentity) ?? sourceComponentIdentity;
  const main = context.componentSources.get(sourceComponentIdentity) ?? context.componentSources.get(componentIdentity);
  if (main === undefined) {
    const sharedLibraryId = typeof shape.componentLibraryId === "string" && shape.componentLibraryId !== "" ? shape.componentLibraryId : undefined;
    diagnostics.push({
      severity: "warning",
      sourceId: sourceIdOf(shape.id),
      code: shape.componentResolutionIssue?.code ?? (sharedLibraryId === undefined ? "COMPONENT_UNRESOLVED" : "SHARED_LIBRARY_UNAVAILABLE"),
      message: shape.componentResolutionIssue?.message ?? (sharedLibraryId === undefined
        ? `Component instance references an unresolved component (${componentId}).`
        : `Unable to resolve component "${sourceNameOf(shape.name, sourceIdOf(shape.id))}" (${componentId}) from shared library ${sharedLibraryId}.`),
    });
    const node: UnsupportedNode = {
      kind: "unsupported",
      sourceId: sourceIdOf(shape.id),
      sourceName: sourceNameOf(shape.name, sourceIdOf(shape.id)),
      name: normalizeName(shape.name, sourceIdOf(shape.id)),
      geometry: geometryOf(shape, diagnostics),
      visible: shape.visible !== false,
      style: { opacity: normalizedOpacity(shape.opacity, sourceIdOf(shape.id), diagnostics) },
      diagnostics,
      sourceType: "component-instance",
    };
    return { node, diagnostics };
  }

  if (context.currentComponent !== undefined) {
    context.components.get(context.currentComponent)!.dependencies.add(componentIdentity);
  }

  const args: IrArgument[] = [];
  walkOverrides(main, shape, "", componentIdentity, context, args);
  const variantValues = variantSelectionsFor(componentIdentity, componentId, context);
  const variantMemberName = variantMemberNameFor(componentIdentity, componentId, context);

  const transform = transformOf(shape, diagnostics);
  const node: IrComponentInstanceNode = {
    kind: "component-instance",
    sourceId: sourceIdOf(shape.id),
    sourceName: sourceNameOf(shape.name, sourceIdOf(shape.id)),
    name: normalizeName(shape.name, sourceIdOf(shape.id)),
    geometry: geometryOf(shape, diagnostics),
    visible: shape.visible !== false,
    style: { opacity: normalizedOpacity(shape.opacity, sourceIdOf(shape.id), diagnostics) },
    ...(transform === undefined ? {} : { transform }),
    diagnostics,
    ...tokenReferencesOf(shape, context, diagnostics),
    componentId: componentIdentity,
    ...(variantValues.length === 0 ? {} : { variantValues }),
    ...(variantMemberName === undefined ? {} : { variantMemberName }),
    arguments: args,
  };
  return { node, diagnostics };
}

function walkOverrides(main: PenpotSourceShape, instance: PenpotSourceShape, path: string, componentId: string, context: ExtractionContext, args: IrArgument[]): void {
  const builder = context.components.get(componentId);
  if (builder === undefined) return;
  if (main.type === "text" || instance.type === "text") {
    const slot = builder.slots.get(path);
    if (slot !== undefined && (main.characters ?? "") !== (instance.characters ?? "")) {
      args.push({ name: slot.parameterName, value: instance.characters ?? "" });
      builder.overridden.add(slot.parameterName);
    }
    return;
  }
  if ((main.visible !== false) !== (instance.visible !== false)) {
    unsupportedOverride(instance, context, "visibility");
  }
  if (fillColorKey(main) !== fillColorKey(instance)) {
    const slot = builder.slots.get(path + ":fill");
    if (slot?.type === "Color" && fillColorKey(instance) !== undefined) {
      args.push({ name: slot.parameterName, value: fillColorKey(instance)!, type: "Color" });
      builder.overridden.add(slot.parameterName);
    } else {
      unsupportedOverride(instance, context, "fill color");
    }
  }
  if (main.type === "board" || main.type === "group") {
    const mainChildren = main.children ?? [];
    const instanceChildren = instance.children ?? [];
    const count = Math.min(mainChildren.length, instanceChildren.length);
    for (let i = 0; i < count; i++) {
      const mainChild = mainChildren[i];
      const instanceChild = instanceChildren[i];
      if (isComponentRootInstance(mainChild) || isComponentRootInstance(instanceChild)) {
        if ((mainChild.componentId ?? undefined) !== (instanceChild.componentId ?? undefined)) {
          unsupportedOverride(instanceChild, context, "nested component swap");
        }
        continue;
      }
      walkOverrides(mainChild, instanceChild, pathKey(path, i), componentId, context, args);
    }
  }
}

function variantAxesOf(variant: PenpotVariantFamilySource, dartName: string, context: ExtractionContext): readonly IrVariantAxis[] {
  const usedAxisNames = new Set<string>();
  const axes = variant.properties.map((sourceName, axisIndex) => {
    const baseName = parameterNameFor(sourceName);
    const name = dedupeName(baseName, usedAxisNames);
    if (name !== baseName) {
      context.diagnostics.push({ severity: "warning", sourceId: variant.id, code: "VARIANT_AXIS_UNSUPPORTED", message: `Variant axes named "${sourceName}" normalize to the same Dart property; generated "${name}".` });
    }
    for (const member of variant.members) {
      if (typeof member.values[sourceName] !== "string") {
        context.diagnostics.push({ severity: "warning", sourceId: member.id, code: "VARIANT_MEMBER_MISSING", message: `Variant member ${member.id} has no value for axis "${sourceName}".` });
      }
    }
    const sourceValues = [...new Set(variant.members.map((member) => member.values[sourceName]).filter((value): value is string => typeof value === "string"))].sort();
    const usedValues = new Set<string>();
    const values = sourceValues.map((sourceValue) => {
      const baseValue = dartEnumValue(sourceValue, name);
      const valueName = dedupeName(baseValue, usedValues);
      if (valueName !== baseValue) {
        context.diagnostics.push({ severity: "warning", sourceId: variant.id, code: "VARIANT_VALUE_COLLISION", message: `Variant values for axis "${sourceName}" normalize to the same Dart enum value; generated "${valueName}".` });
      }
      return { sourceValue, name: valueName };
    });
    const defaultMember = variant.members.find((member) => member.id === variant.defaultComponentId) ?? variant.members[0];
    const defaultValue = defaultMember?.values[sourceName] ?? sourceValues[0] ?? "unknown";
    return { sourceName, name, enumName: `${dartName}${pascalCase(name || `Axis${axisIndex + 1}`)}`, values, defaultValue };
  });
  const possibleCombinations = axes.reduce((count, axis) => count * Math.max(axis.values.length, 1), 1);
  if (possibleCombinations > variant.members.length) {
    context.diagnostics.push({ severity: "info", sourceId: variant.id, code: "VARIANT_SPARSE_MATRIX", message: `Variant family "${variant.name}" defines ${variant.members.length} of ${possibleCombinations} possible axis combinations; only actual Penpot members are exposed.` });
  }
  return axes;
}

function variantRepresentationOf(_variant: PenpotVariantFamilySource): "axes" {
  // Variant members remain an internal validity matrix; public APIs always preserve independent axes.
  return "axes";
}

function variantMemberDartName(member: PenpotVariantMemberSource, axes: readonly IrVariantAxis[], used: Set<string>): string {
  const parts = axes.map((axis) => {
    const value = axis.values.find((candidate) => candidate.sourceValue === member.values[axis.sourceName])?.name ?? dartEnumValue(member.values[axis.sourceName] ?? axis.defaultValue, axis.name);
    return `${pascalCase(axis.name)}${pascalCase(value)}`;
  });
  const base = parts.join("") || "Member";
  let candidate = base.charAt(0).toLowerCase() + base.slice(1);
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base.charAt(0).toLowerCase() + base.slice(1)}${suffix++}`;
  used.add(candidate);
  return candidate;
}

function variantMemberNameFor(componentIdentity: string, sourceComponentId: string, context: ExtractionContext): string | undefined {
  const builder = context.components.get(componentIdentity);
  if (builder?.variantRepresentation !== "members" || builder.variantMembers === undefined) return undefined;
  return builder.variantMembers.find((member) => member.componentId === componentKey(builder.libraryId, sourceComponentId))?.dartName;
}

function variantSelectionsFor(componentIdentity: string, sourceComponentId: string, context: ExtractionContext): readonly IrVariantSelection[] {
  const builder = context.components.get(componentIdentity);
  if (builder?.variant === undefined || builder.variantAxes === undefined) return [];
  const member = builder.variant.members.find((candidate) => candidate.id === sourceComponentId);
  if (member === undefined) {
    context.diagnostics.push({ severity: "warning", sourceId: sourceComponentId, code: "VARIANT_MEMBER_MISSING", message: `Variant member ${sourceComponentId} is not registered in family "${builder.sourceName}".` });
    return [];
  }
  return variantMemberSelections(member, builder.variantAxes).filter((selection) => {
    const axis = builder.variantAxes!.find((candidate) => candidate.name === selection.axisName);
    return axis !== undefined && member.values[axis.sourceName] !== axis.defaultValue;
  });
}

function variantMemberSelections(member: PenpotVariantMemberSource, axes: readonly IrVariantAxis[]): readonly IrVariantSelection[] {
  return axes.map((axis) => {
    const sourceValue = member.values[axis.sourceName] ?? axis.defaultValue;
    const valueName = axis.values.find((value) => value.sourceValue === sourceValue)?.name ?? dartEnumValue(sourceValue, axis.name);
    return { axisName: axis.name, enumName: axis.enumName, valueName };
  });
}

function dedupeName(base: string, used: Set<string>): string {
  let candidate = base || "value";
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base || "value"}${suffix++}`;
  used.add(candidate);
  return candidate;
}

function dartEnumValue(value: string, axisName = "value"): string {
  const raw = value.trim();
  const prefix = parameterNameFor(axisName).replace(/[^A-Za-z0-9]/g, "") || "value";
  const negative = raw.startsWith("-");
  const normalized = raw
    .replace(/^-/, "")
    .replace(/\./g, "_")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const candidate = normalized === "" ? prefix : /^[0-9]/.test(normalized) ? `${prefix}${negative ? "Negative" : ""}${normalized}` : `${negative ? "negative" : ""}${normalized}`;
  if (candidate === "default") return "defaultState";
  if (candidate === "true" || candidate === "false") return `${candidate}Value`;
  return candidate.charAt(0).toLowerCase() + candidate.slice(1);
}

function fillColorKey(shape: PenpotSourceShape): string | undefined {
  const fills = shape.fills;
  if (fills == null || fills === "mixed" || fills.length === 0) return undefined;
  return fills[0].fillColor ?? undefined;
}

function unsupportedOverride(shape: PenpotSourceShape, context: ExtractionContext, property: string): void {
  context.diagnostics.push({
    severity: "warning",
    sourceId: sourceIdOf(shape.id),
    code: "COMPONENT_OVERRIDE_UNSUPPORTED",
    message: `Unsupported component override (${property}) on "${sourceNameOf(shape.name, sourceIdOf(shape.id))}"; the canonical value was used.`,
  });
}

function finalizeComponents(context: ExtractionContext): IrComponentDefinition[] {
  detectDependencyCycles(context);
  return context.componentOrder.map((componentId) => {
    const builder = context.components.get(componentId)!;
    const parameters: IrComponentParameter[] = [...builder.slots.values()]
      .filter((slot) => builder.overridden.has(slot.parameterName))
      .filter((slot, index, all) => all.findIndex((other) => other.parameterName === slot.parameterName) === index)
      .map((slot) => ({ name: slot.parameterName, type: slot.type ?? "String", defaultValue: slot.defaultText }));
    return {
      id: componentId,
      sourceComponentId: builder.sourceComponentId,
      sourceName: builder.sourceName,
      name: builder.dartName,
      ...(builder.libraryId === undefined ? {} : { sourceLibraryId: builder.libraryId }),
      root: builder.root!,
      ...(builder.variant === undefined || builder.variantAxes === undefined || builder.variantMembers === undefined ? {} : {
        variant: {
          id: builder.variant.id,
          sourceName: builder.variant.name,
          axes: builder.variantAxes,
          members: builder.variantMembers,
          ...(builder.variantRepresentation === undefined ? {} : { representation: builder.variantRepresentation }),
          ...(builder.variantEnumName === undefined ? {} : { enumName: builder.variantEnumName }),
        } satisfies IrVariantFamily,
      }),
      parameters,
      dependencies: [...builder.dependencies],
    };
  });
}

function detectDependencyCycles(context: ExtractionContext): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (componentId: string): void => {
    if (visited.has(componentId)) return;
    if (visiting.has(componentId)) {
      context.diagnostics.push({ severity: "warning", sourceId: componentId, code: "COMPONENT_DEPENDENCY_CYCLE", message: `Component dependency cycle detected involving component "${componentId}".` });
      return;
    }
    visiting.add(componentId);
    for (const dependency of context.components.get(componentId)?.dependencies ?? []) visit(dependency);
    visiting.delete(componentId);
    visited.add(componentId);
  };
  for (const componentId of context.componentOrder) visit(componentId);
}

const flutterTypeNames = new Set(["IconButton", "Button", "Text", "Container", "Column", "Row", "Stack", "SizedBox", "Padding", "Align", "Image", "Theme", "Color"]);

function dartNameFor(sourceName: string, componentId: string, context: ExtractionContext, collisionCode = "COMPONENT_NAME_COLLISION"): string {
  const normalized = pascalCase(sourceName) || "Component";
  const base = flutterTypeNames.has(normalized) ? `Penpot${normalized}` : normalized;
  let candidate = base;
  let suffix = 2;
  while (context.usedDartNames.has(candidate) && context.usedDartNames.get(candidate) !== componentId) {
    candidate = `${base}${suffix}`;
    suffix++;
  }
  if (candidate !== base) {
    context.diagnostics.push({ severity: "warning", sourceId: componentId, code: collisionCode, message: `Component "${sourceName}" collides with another component name; generated "${candidate}".` });
  }
  context.usedDartNames.set(candidate, componentId);
  return candidate;
}

function dedupeParameterName(base: string, builder: ComponentBuilder): string {
  let candidate = base;
  let suffix = 2;
  while (builder.usedParameterNames.has(candidate)) {
    candidate = `${base}${suffix}`;
    suffix++;
  }
  builder.usedParameterNames.add(candidate);
  return candidate;
}

function parameterNameFor(name: unknown): string {
  const words = (typeof name === "string" ? name : "").match(/[A-Za-z0-9]+/g) ?? [];
  const base = words.map((word, index) => index === 0 ? word.charAt(0).toLowerCase() + word.slice(1) : word.charAt(0).toUpperCase() + word.slice(1)).join("");
  return base || "text";
}

function pascalCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("").replace(/^[^A-Za-z]+/, "");
}

function flexOf(flex: PenpotSourceFlexLayout): FlexLayout {
  return {
    direction: flex.dir ?? "column",
    rowGap: nonNegativeDimension(flex.rowGap ?? 0),
    columnGap: nonNegativeDimension(flex.columnGap ?? 0),
    padding: paddingOf(flex),
    ...(flex.justifyContent == null ? {} : { justifyContent: flex.justifyContent }),
    ...(flex.alignItems == null ? {} : { alignItems: flex.alignItems }),
  };
}

function gridOf(grid: PenpotSourceGridLayout, shape: PenpotSourceShape, diagnostics: Diagnostic[]): GridLayout {
  const rows = gridTracksOf(grid.rows);
  const columns = gridTracksOf(grid.columns);
  const hasUnsupportedTrack = [...rows, ...columns].some((track) => track.type !== "flex");
  const hasUnsupportedCell = (shape.children ?? []).some((child) => {
    const cell = child.layoutCell;
    return cell?.position === "manual" || cell?.position === "area" || (cell?.rowSpan ?? 1) !== 1 || (cell?.columnSpan ?? 1) !== 1;
  });
  const supported = rows.length > 0 && columns.length > 0 && !hasUnsupportedTrack && !hasUnsupportedCell;
  if (!supported) {
    diagnostics.push({
      severity: "warning",
      sourceId: sourceIdOf(shape.id),
      code: "unsupported-grid",
      message: "Only simple flex-track grids without manually placed or spanning children are generated as GridView; a Stack fallback was used.",
    });
  }
  return {
    direction: grid.dir ?? "row",
    rows,
    columns,
    rowGap: nonNegativeDimension(grid.rowGap ?? 0),
    columnGap: nonNegativeDimension(grid.columnGap ?? 0),
    padding: paddingOf(grid),
    supported,
  };
}

function gridTracksOf(tracks: readonly PenpotSourceGridTrack[] | null | undefined): readonly GridTrack[] {
  return (tracks ?? []).map((track) => ({
    type: track.type ?? "auto",
    ...(track.value == null ? {} : { value: nonNegativeDimension(track.value) }),
  }));
}

function paddingOf(source: Pick<PenpotSourceFlexLayout, "topPadding" | "rightPadding" | "bottomPadding" | "leftPadding">): { top: number; right: number; bottom: number; left: number } {
  return {
    top: nonNegativeDimension(source.topPadding ?? 0),
    right: nonNegativeDimension(source.rightPadding ?? 0),
    bottom: nonNegativeDimension(source.bottomPadding ?? 0),
    left: nonNegativeDimension(source.leftPadding ?? 0),
  };
}

function layoutChildOf(layoutChild: PenpotSourceLayoutChild, shape: PenpotSourceShape, diagnostics: Diagnostic[]): LayoutChild {
  const minWidth = responsiveConstraint(layoutChild.minWidth, "minWidth", shape, diagnostics);
  const minHeight = responsiveConstraint(layoutChild.minHeight, "minHeight", shape, diagnostics);
  let maxWidth = responsiveConstraint(layoutChild.maxWidth, "maxWidth", shape, diagnostics);
  let maxHeight = responsiveConstraint(layoutChild.maxHeight, "maxHeight", shape, diagnostics);
  if (minWidth !== undefined && maxWidth !== undefined && maxWidth < minWidth) {
    constraintDiagnostic(shape, diagnostics, "maxWidth is smaller than minWidth");
    maxWidth = minWidth;
  }
  if (minHeight !== undefined && maxHeight !== undefined && maxHeight < minHeight) {
    constraintDiagnostic(shape, diagnostics, "maxHeight is smaller than minHeight");
    maxHeight = minHeight;
  }
  const aspectRatio = responsiveConstraint(layoutChild.aspectRatio, "aspectRatio", shape, diagnostics, false);
  return {
    absolute: layoutChild.absolute === true,
    horizontalSizing: layoutChild.horizontalSizing ?? "fix",
    verticalSizing: layoutChild.verticalSizing ?? "fix",
    ...(minWidth === undefined ? {} : { minWidth }),
    ...(maxWidth === undefined ? {} : { maxWidth }),
    ...(minHeight === undefined ? {} : { minHeight }),
    ...(maxHeight === undefined ? {} : { maxHeight }),
    ...(aspectRatio === undefined ? {} : { aspectRatio }),
  };
}

function responsiveConstraint(value: number | null | undefined, property: string, shape: PenpotSourceShape, diagnostics: Diagnostic[], allowZero = true): number | undefined {
  if (value == null) return undefined;
  if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) {
    constraintDiagnostic(shape, diagnostics, `${property} has invalid value ${String(value)}`);
    return undefined;
  }
  return value;
}

function constraintDiagnostic(shape: PenpotSourceShape, diagnostics: Diagnostic[], issue: string): void {
  diagnostics.push({
    severity: "warning",
    sourceId: sourceIdOf(shape.id),
    code: "RESPONSIVE_CONSTRAINT_UNSUPPORTED",
    message: `Responsive constraint on "${sourceNameOf(shape.name, sourceIdOf(shape.id))}" was adjusted or omitted because ${issue}.`,
  });
}

function geometryOf(shape: PenpotSourceShape, diagnostics: Diagnostic[]): NodeGeometry {
  const rawX = finiteCoordinate(shape.x);
  const rawY = finiteCoordinate(shape.y);
  const x = finiteCoordinate(shape.parentX ?? rawX);
  const y = finiteCoordinate(shape.parentY ?? rawY);
  const width = nonNegativeDimension(shape.width);
  const height = nonNegativeDimension(shape.height);
  if (rawX !== shape.x || rawY !== shape.y || width !== shape.width || height !== shape.height) {
    diagnostics.push({ severity: "warning", sourceId: sourceIdOf(shape.id), code: "invalid-geometry", message: "Invalid or negative geometry was clamped before code generation." });
  }
  return { x, y, width, height };
}

function transformOf(shape: PenpotSourceShape, diagnostics: Diagnostic[]): NodeTransform | undefined {
  const rotation = finiteCoordinate(shape.rotation ?? 0);
  if (shape.rotation != null && rotation !== shape.rotation) {
    diagnostics.push({ severity: "warning", sourceId: sourceIdOf(shape.id), code: "invalid-rotation", message: "Invalid rotation defaulted to 0 before code generation." });
  }
  const flipX = shape.flipX === true;
  const flipY = shape.flipY === true;
  return rotation === 0 && !flipX && !flipY ? undefined : { rotation, flipX, flipY };
}

function finiteCoordinate(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function nonNegativeDimension(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function boundsOf(children: readonly IrNode[]): NodeGeometry {
  if (children.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const minX = Math.min(...children.map((child) => child.geometry.x));
  const minY = Math.min(...children.map((child) => child.geometry.y));
  const maxX = Math.max(...children.map((child) => child.geometry.x + child.geometry.width));
  const maxY = Math.max(...children.map((child) => child.geometry.y + child.geometry.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function styleOf(shape: PenpotSourceShape, diagnostics: Diagnostic[], context: ExtractionContext): NodeStyle {
  if (isVectorType(shape.type)) return { opacity: normalizedOpacity(shape.opacity, sourceIdOf(shape.id), diagnostics) };
  const fill = solidFillOf(shape.fills, sourceIdOf(shape.id), diagnostics);
  const gradient = gradientFillOf(shape.fills, sourceIdOf(shape.id), diagnostics);
  const image = imageFillOf(shape.fills, shape.type === "image", sourceIdOf(shape.id), diagnostics, context);
  const border = solidBorderOf(shape.strokes, sourceIdOf(shape.id), diagnostics);
  const radius = cornerRadiiOf(shape);
  const shadows = dropShadowsOf(shape.shadows, sourceIdOf(shape.id), diagnostics);
  return {
    ...(fill === undefined ? {} : { fill }),
    ...(gradient === undefined ? {} : { gradient }),
    ...(image === undefined ? {} : { image }),
    ...(border === undefined ? {} : { border }),
    ...(radius === undefined ? {} : { radius }),
    ...(shadows.length === 0 ? {} : { shadows }),
    opacity: normalizedOpacity(shape.opacity, sourceIdOf(shape.id), diagnostics),
  };
}

function solidBorderOf(strokes: PenpotSourceShape["strokes"], sourceId: string, diagnostics: Diagnostic[]): Border | undefined {
  const stroke = strokes?.[0];
  if (stroke === undefined || stroke.strokeStyle === "none") return undefined;
  if (stroke.strokeStyle != null && stroke.strokeStyle !== "solid") {
    diagnostics.push({ severity: "warning", sourceId, code: "unsupported-stroke", message: "Only solid strokes are supported." });
    return undefined;
  }
  const color = stroke.strokeColor == null ? undefined : normalizeHexColor(stroke.strokeColor);
  if (color === undefined) {
    diagnostics.push({ severity: "warning", sourceId, code: "unsupported-stroke", message: "Solid strokes require a hex color." });
    return undefined;
  }
  return { color, opacity: normalizedOpacity(stroke.strokeOpacity, sourceId, diagnostics), width: nonNegativeDimension(stroke.strokeWidth ?? 0) };
}

function cornerRadiiOf(shape: PenpotSourceShape): CornerRadii | undefined {
  const corners = [shape.borderRadiusTopLeft, shape.borderRadiusTopRight, shape.borderRadiusBottomRight, shape.borderRadiusBottomLeft];
  if (shape.borderRadius == null && corners.every((corner) => corner == null)) return undefined;
  const fallback = nonNegativeDimension(shape.borderRadius ?? 0);
  return {
    topLeft: nonNegativeDimension(shape.borderRadiusTopLeft ?? fallback),
    topRight: nonNegativeDimension(shape.borderRadiusTopRight ?? fallback),
    bottomRight: nonNegativeDimension(shape.borderRadiusBottomRight ?? fallback),
    bottomLeft: nonNegativeDimension(shape.borderRadiusBottomLeft ?? fallback),
  };
}

function dropShadowsOf(shadows: PenpotSourceShape["shadows"], sourceId: string, diagnostics: Diagnostic[]): readonly DropShadow[] {
  return (shadows ?? []).flatMap((shadow) => {
    if (shadow.hidden === true) return [];
    if (shadow.style != null && shadow.style !== "drop-shadow") {
      diagnostics.push({ severity: "warning", sourceId, code: "unsupported-shadow", message: "Only drop shadows are supported." });
      return [];
    }
    const color = shadow.color?.color == null ? undefined : normalizeHexColor(shadow.color.color);
    if (color === undefined) {
      diagnostics.push({ severity: "warning", sourceId, code: "unsupported-shadow", message: "Drop shadows require a hex color." });
      return [];
    }
    return [{ color, opacity: normalizedOpacity(shadow.color?.opacity, sourceId, diagnostics), offsetX: finiteCoordinate(shadow.offsetX ?? 0), offsetY: finiteCoordinate(shadow.offsetY ?? 0), blur: nonNegativeDimension(shadow.blur ?? 0), spread: finiteCoordinate(shadow.spread ?? 0) }];
  });
}

function normalizedOpacity(value: number | null | undefined, sourceId: string, diagnostics: Diagnostic[]): number {
  if (value == null) return 1;
  if (!Number.isFinite(value)) {
    diagnostics.push({ severity: "warning", sourceId, code: "invalid-opacity", message: "Invalid opacity defaulted to 1 before code generation." });
    return 1;
  }
  return Math.min(Math.max(value, 0), 1);
}

function imageFillOf(fills: PenpotSourceShape["fills"], isImageShape: boolean, sourceId: string, diagnostics: Diagnostic[], context: ExtractionContext): ImageFill | undefined {
  if (fills == null || fills === "mixed") return undefined;
  const image = fills.find((fill) => fill.fillImage != null)?.fillImage;
  if (image == null) {
    if (isImageShape) diagnostics.push({ severity: "warning", sourceId, code: "unusable-image-id", message: "Image data has no stable usable ID, so no Flutter asset reference was generated." });
    return undefined;
  }
  if (typeof image.id !== "string" || image.id.trim() === "") {
    diagnostics.push({ severity: "warning", sourceId, code: "unusable-image-id", message: "Image data has no stable usable ID, so no Flutter asset reference was generated." });
    return undefined;
  }
  const path = assetPathFor(image.id, image.mtype ?? undefined);
  if (!context.assets.has(image.id)) {
    context.assets.set(image.id, { id: image.id, ...(typeof image.name === "string" ? { name: image.name } : {}), ...(typeof image.mtype === "string" ? { mimeType: image.mtype } : {}), width: nonNegativeDimension(image.width), height: nonNegativeDimension(image.height), path });
  }
  return { assetPath: path, keepAspectRatio: image.keepAspectRatio === true };
}

function assetPathFor(id: string, mimeType: string | undefined): string {
  const encodedId = [...id].map((character) => /[A-Za-z0-9_-]/.test(character) ? character : `_${character.codePointAt(0)!.toString(16)}`).join("");
  const extension = mimeType === "image/jpeg" ? ".jpg" : mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : mimeType === "image/gif" ? ".gif" : mimeType === "image/svg+xml" ? ".svg" : "";
  return `assets/images/${encodedId}${extension}`;
}

function isVectorType(type: string): boolean {
  return type === "path" || type === "svg-raw" || type === "boolean";
}

function svgAssetPathOf(shape: PenpotSourceShape, context: ExtractionContext): string {
  const sourceId = sourceIdOf(shape.id);
  const path = assetPathFor(sourceId, "image/svg+xml");
  if (!context.assets.has(sourceId)) {
    context.assets.set(sourceId, {
      id: sourceId,
      mimeType: "image/svg+xml",
      width: nonNegativeDimension(shape.width),
      height: nonNegativeDimension(shape.height),
      path,
    });
  }
  return path;
}

function solidFillOf(fills: PenpotSourceShape["fills"], sourceId: string, diagnostics: Diagnostic[]): ColorFill | undefined {
  if (fills == null || fills === "mixed" || fills.length === 0) return undefined;
  const fill = fills[0];
  if (fill.fillImage !== undefined || fill.fillColorGradient !== undefined) return undefined;
  if (fill.fillColor == null) {
    diagnostics.push({ severity: "warning", sourceId, code: "unsupported-fill", message: "The fill has no supported solid color, gradient, or image data." });
    return undefined;
  }
  const color = normalizeHexColor(fill.fillColor);
  if (color === undefined) {
    diagnostics.push({ severity: "warning", sourceId, code: "unsupported-color", message: `Unsupported color value ${fill.fillColor}.` });
    return undefined;
  }
  return { color, opacity: normalizedOpacity(fill.fillOpacity, sourceId, diagnostics) };
}

function gradientFillOf(fills: PenpotSourceShape["fills"], sourceId: string, diagnostics: Diagnostic[]): GradientFill | undefined {
  if (fills == null || fills === "mixed") return undefined;
  const gradient = fills.find((fill) => fill.fillColorGradient != null)?.fillColorGradient;
  if (gradient == null) return undefined;
  if (gradient.type !== "linear" && gradient.type !== "radial") {
    diagnostics.push({ severity: "warning", sourceId, code: "unsupported-gradient", message: "Only linear and radial gradients are supported." });
    return undefined;
  }
  const stops = (gradient.stops ?? []).flatMap((stop) => {
    const color = stop.color == null ? undefined : normalizeHexColor(stop.color);
    return color === undefined ? [] : [{ color, opacity: normalizedOpacity(stop.opacity, sourceId, diagnostics), offset: clampUnit(stop.offset ?? 0) }];
  });
  if (stops.length < 2) {
    diagnostics.push({ severity: "warning", sourceId, code: "unsupported-gradient", message: "Gradients require at least two valid color stops." });
    return undefined;
  }
  return { type: gradient.type, startX: clampUnit(gradient.startX ?? 0), startY: clampUnit(gradient.startY ?? 0), endX: clampUnit(gradient.endX ?? 1), endY: clampUnit(gradient.endY ?? 1), width: nonNegativeDimension(gradient.width ?? 0.5), stops };
}

function clampUnit(value: number): number {
  return Math.min(Math.max(finiteCoordinate(value), 0), 1);
}

function textStyleOf(shape: PenpotSourceShape, diagnostics: Diagnostic[], context: ExtractionContext): TextStyle {
  const fontSize = finiteNumber(shape.fontSize);
  const fontWeight = normalizedFontWeight(shape.fontWeight, sourceIdOf(shape.id), diagnostics);
  const letterSpacing = finiteNumber(shape.letterSpacing);
  const families = fontFamilies(shape.fontFamily, shape.fontFamilyFallbacks, context.defaultFallbackFamilies);
  const lineHeight = lineHeightMultiplier(shape.lineHeight, fontSize, sourceIdOf(shape.id), diagnostics);
  if ((shape.fontFamily === "mixed" || shape.fontSize === "mixed") && shape.runs == null) {
    diagnostics.push({ severity: "warning", sourceId: sourceIdOf(shape.id), code: "TEXT_MIXED_STYLE_UNSUPPORTED", message: "Mixed text runs could not be resolved; the common text style was used." });
  }
  const style: TextStyle = {
    ...(families.family === undefined ? {} : { fontFamily: families.family }),
    ...(families.fallbacks.length === 0 ? {} : { fallbackFamilies: families.fallbacks }),
    ...(fontSize === undefined ? {} : { fontSize }),
    ...(fontWeight === undefined ? {} : { fontWeight }),
    ...(shape.fontStyle === "italic" ? { fontStyle: "italic" } : shape.fontStyle === "normal" ? { fontStyle: "normal" } : {}),
    ...(lineHeight === undefined ? {} : { lineHeight }),
    ...(letterSpacing === undefined ? {} : { letterSpacing }),
    ...(shape.textDecoration === "underline" || shape.textDecoration === "line-through" ? { decoration: shape.textDecoration } : {}),
    ...(shape.align == null || shape.align === "mixed" ? {} : { align: shape.align }),
  };
  registerFontUsage(style, context, sourceIdOf(shape.id));
  return style;
}

function textRunsOf(shape: PenpotSourceShape, diagnostics: Diagnostic[], context: ExtractionContext): readonly TextRun[] | undefined {
  const runs = shape.runs;
  if (runs == null || runs.length === 0) return undefined;
  const mapped = runs.flatMap((run) => runOf(run, sourceIdOf(shape.id), diagnostics, context));
  return mapped.length === 0 ? undefined : mapped;
}

function runOf(run: PenpotSourceTextRun, sourceId: string, diagnostics: Diagnostic[], context: ExtractionContext): readonly TextRun[] {
  const text = run.characters ?? "";
  const style = runStyleOf(run, sourceId, diagnostics, context);
  const children = run.children?.flatMap((child) => runOf(child, sourceId, diagnostics, context));
  const textTransform = runTextTransformOf(run.textTransform, sourceId, diagnostics);
  const typographyStyleId = registerTypographyStyle(style, "Inline", context);
  if (text.length === 0 && (children?.length ?? 0) === 0) return [];
  return [{
    text,
    style,
    ...(typographyStyleId === undefined ? {} : { typographyStyleId }),
    ...(textTransform === undefined ? {} : { textTransform }),
    ...(children == null || children.length === 0 ? {} : { children }),
  }];
}

function runStyleOf(run: PenpotSourceTextRun, sourceId: string, diagnostics: Diagnostic[], context: ExtractionContext): TextStyle {
  const fill = run.fills == null || run.fills === "mixed" || run.fills.length === 0 ? undefined : solidFillOf(run.fills, sourceId, diagnostics);
  const fontSize = finiteNumber(run.fontSize);
  const fontWeight = normalizedFontWeight(run.fontWeight, sourceId, diagnostics);
  const lineHeight = lineHeightMultiplier(run.lineHeight, fontSize, sourceId, diagnostics);
  const letterSpacing = finiteNumber(run.letterSpacing);
  const families = fontFamilies(run.fontFamily, run.fallbackFamilies, context.defaultFallbackFamilies);
  const style: TextStyle = {
    ...(families.family === undefined ? {} : { fontFamily: families.family }),
    ...(families.fallbacks.length === 0 ? {} : { fallbackFamilies: families.fallbacks }),
    ...(fontSize === undefined ? {} : { fontSize }),
    ...(fontWeight === undefined ? {} : { fontWeight }),
    ...(run.fontStyle === "italic" ? { fontStyle: "italic" } : run.fontStyle === "normal" ? { fontStyle: "normal" } : {}),
    ...(lineHeight === undefined ? {} : { lineHeight }),
    ...(letterSpacing === undefined ? {} : { letterSpacing }),
    ...(run.textDecoration === "underline" || run.textDecoration === "line-through" ? { decoration: run.textDecoration } : {}),
    ...(fill === undefined ? {} : { color: fill }),
  };
  registerFontUsage(style, context, sourceId);
  return style;
}

function finiteNumber(value: string | null | undefined): number | undefined {
  if (value == null || value === "mixed") return undefined;
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
}

function normalizedFontWeight(value: string | null | undefined, sourceId: string, diagnostics: Diagnostic[]): number | undefined {
  const numeric = finiteNumber(value);
  if (numeric === undefined) return undefined;
  const supported = [100, 200, 300, 400, 500, 600, 700, 800, 900];
  const normalized = supported.reduce((closest, candidate) => Math.abs(candidate - numeric) < Math.abs(closest - numeric) ? candidate : closest, 400);
  if (normalized !== numeric) {
    diagnostics.push({ severity: "warning", sourceId, code: "FONT_WEIGHT_APPROXIMATED", message: `Font weight ${numeric} was mapped to Flutter FontWeight.w${normalized}.` });
  }
  return normalized;
}

function lineHeightMultiplier(value: string | null | undefined, fontSize: number | undefined, sourceId: string, diagnostics: Diagnostic[]): number | undefined {
  if (value == null || value === "mixed") return undefined;
  const trimmed = value.trim().toLowerCase();
  let result: number | undefined;
  if (trimmed.endsWith("%")) {
    const percentage = Number(trimmed.slice(0, -1));
    result = Number.isFinite(percentage) ? percentage / 100 : undefined;
  } else if (trimmed.endsWith("px")) {
    const pixels = Number(trimmed.slice(0, -2));
    result = Number.isFinite(pixels) && fontSize !== undefined && fontSize > 0 ? pixels / fontSize : undefined;
  } else {
    const numeric = Number(trimmed);
    result = Number.isFinite(numeric) ? numeric > 4 && fontSize !== undefined && fontSize > 0 ? numeric / fontSize : numeric : undefined;
  }
  if (result === undefined || !Number.isFinite(result) || result <= 0) {
    diagnostics.push({ severity: "warning", sourceId, code: "TEXT_LINE_HEIGHT_INVALID", message: `Line height "${value}" could not be converted to a positive Flutter height multiplier.` });
    return undefined;
  }
  return result;
}

function fontFamilies(value: string | null | undefined, explicitFallbacks: readonly string[] | null | undefined, defaults: readonly string[]): { family?: string; fallbacks: readonly string[] } {
  if (value == null || value === "mixed") return { fallbacks: [] };
  const parsed = value.split(",").map(cleanFontFamily).filter(Boolean);
  const family = parsed[0];
  const fallbacks = [...new Set([...parsed.slice(1), ...(explicitFallbacks ?? []).map(cleanFontFamily), ...defaults.map(cleanFontFamily)])].filter((item) => item !== "" && item !== family);
  return { ...(family === undefined ? {} : { family }), fallbacks };
}

function cleanFontFamily(value: string): string {
  return value.trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2");
}

function runTextTransformOf(value: PenpotSourceTextRun["textTransform"], sourceId: string, diagnostics: Diagnostic[]): IrTextTransform | undefined {
  if (value === "uppercase" || value === "lowercase" || value === "capitalize") return value;
  if (value === "mixed") diagnostics.push({ severity: "warning", sourceId, code: "TEXT_STYLE_UNSUPPORTED", message: "Mixed inline text transforms were omitted." });
  return undefined;
}

function textTransformOf(value: PenpotSourceShape["textTransform"], shape: PenpotSourceShape, diagnostics: Diagnostic[]): IrTextTransform | undefined {
  if (value === "uppercase" || value === "lowercase" || value === "capitalize") return value;
  if (value === "mixed") diagnostics.push({ severity: "warning", sourceId: sourceIdOf(shape.id), code: "TEXT_STYLE_UNSUPPORTED", message: "Mixed text transforms could not be represented as one paragraph transform." });
  return undefined;
}

function positiveInteger(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function registerTypographyStyle(style: TextStyle, sourceName: string, context: ExtractionContext): string | undefined {
  const reusable = typographyOnly(style);
  if (Object.keys(reusable).length === 0) return undefined;
  const signature = JSON.stringify(reusable);
  const existing = context.typographyCandidates.get(signature);
  if (existing !== undefined) {
    existing.count++;
    return existing.id;
  }
  const id = `typography-${stableHash(signature)}`;
  const baseName = parameterNameFor(sourceName) || "textStyle";
  const name = dedupeName(baseName, context.usedTypographyNames);
  context.typographyCandidates.set(signature, { id, name, style: reusable, count: 1 });
  return id;
}

function typographyOnly(style: TextStyle): TextStyle {
  const { align: _align, ...typography } = style;
  return typography;
}

function finalizeTypographyStyles(context: ExtractionContext): readonly IrTypographyStyle[] {
  return [...context.typographyCandidates.values()]
    .filter((candidate) => candidate.count > 1)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((candidate) => ({ id: candidate.id, name: candidate.name, ...candidate.style }));
}

function registerFontUsage(style: TextStyle, context: ExtractionContext, sourceId: string): void {
  const family = style.fontFamily;
  if (family === undefined) return;
  let usage = context.fontUsages.get(family.toLowerCase());
  if (usage === undefined) {
    usage = { family, fallbackFamilies: new Set(), weights: new Set(), styles: new Set() };
    context.fontUsages.set(family.toLowerCase(), usage);
  }
  for (const fallback of style.fallbackFamilies ?? []) usage.fallbackFamilies.add(fallback);
  usage.weights.add(style.fontWeight ?? 400);
  usage.styles.add(style.fontStyle ?? "normal");
  if (!context.fontResolutionEnabled || isGenericFont(family)) return;
  const source = context.fontSources.get(family.toLowerCase());
  const hasAssets = source?.variants.some((variant) => variant.assetPath !== undefined) === true;
  if (!hasAssets && !context.diagnosedFonts.has(family.toLowerCase())) {
    context.diagnosedFonts.add(family.toLowerCase());
    context.diagnostics.push({ severity: "info", sourceId, code: "FONT_EXTERNAL_REQUIRED", message: `Font family "${family}" must be supplied by the Flutter project; the Penpot Plugin API does not expose exportable font files.` });
  }
}

function finalizeFontManifest(context: ExtractionContext): readonly IrFontManifestEntry[] {
  return [...context.fontUsages.values()].sort((left, right) => left.family.localeCompare(right.family)).map((usage) => {
    const source = context.fontSources.get(usage.family.toLowerCase());
    const assets = (source?.variants ?? []).flatMap((variant) => variant.assetPath === undefined ? [] : [{ path: variant.assetPath, weight: normalizedManifestWeight(variant.weight), style: variant.style }]);
    return {
      family: usage.family,
      fallbackFamilies: [...usage.fallbackFamilies].sort(),
      weights: [...usage.weights].sort((left, right) => left - right),
      styles: [...usage.styles].sort(),
      available: isGenericFont(usage.family) || assets.length > 0,
      assets,
    };
  });
}

function normalizedManifestWeight(value: number): number {
  return Math.min(900, Math.max(100, Math.round(value / 100) * 100));
}

function isGenericFont(family: string): boolean {
  return ["sans-serif", "serif", "monospace", "system-ui"].includes(family.toLowerCase());
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeHexColor(value: string): string | undefined {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  return match === null ? undefined : `#${match[1].toLowerCase()}`;
}

function sourceIdOf(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "unknown";
}

function sourceNameOf(name: unknown, sourceId: string): string {
  return typeof name === "string" && name.trim() !== "" ? name : `node-${sourceId}`;
}

function normalizeName(name: string, sourceId: string): string {
  const words = (typeof name === "string" ? name : "").match(/[A-Za-z0-9]+/g) ?? [];
  const normalized = words.map((word, index) => index === 0 ? word.charAt(0).toLowerCase() + word.slice(1) : word.charAt(0).toUpperCase() + word.slice(1)).join("");
  const withPrefix = /^[A-Za-z_]/.test(normalized) ? normalized : `node${normalized}`;
  return withPrefix || `node${sourceId.replace(/[^A-Za-z0-9]/g, "")}`;
}
