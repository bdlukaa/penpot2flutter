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
  IrNode,
  LayoutChild,
  LayoutSizing,
  NodeGeometry,
  NodeStyle,
  NodeTransform,
  RectangleNode,
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
  readonly fontFamily?: string | null;
  readonly fontSize?: string | null;
  readonly fontWeight?: string | null;
  readonly fontStyle?: "normal" | "italic" | "mixed" | null;
  readonly lineHeight?: string | null;
  readonly letterSpacing?: string | null;
  readonly textDecoration?: "underline" | "line-through" | "none" | "mixed" | null;
  readonly fills?: readonly PenpotSourceFill[] | "mixed" | null;
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
  readonly fontFamily?: string | null;
  readonly fontSize?: string | null;
  readonly fontWeight?: string | null;
  readonly fontStyle?: "normal" | "italic" | "mixed" | null;
  readonly lineHeight?: string | null;
  readonly letterSpacing?: string | null;
  readonly textDecoration?: "underline" | "line-through" | "none" | "mixed" | null;
  readonly align?: "left" | "center" | "right" | "justify" | "mixed" | null;
  readonly runs?: readonly PenpotSourceTextRun[] | null;
}

interface ExtractionContext {
  readonly diagnostics: Diagnostic[];
  readonly assets: Map<string, AssetManifestEntry>;
}

export function extractSelection(selection: readonly PenpotSourceShape[]): ConversionResult {
  const diagnostics: Diagnostic[] = [];
  const context = { diagnostics, assets: new Map<string, AssetManifestEntry>() };
  const root = selection.length === 1 ? extractNode(selection[0], context) : extractSyntheticSelection(selection, context);
  return { root, assets: [...context.assets.values()], diagnostics };
}

function extractSyntheticSelection(selection: readonly PenpotSourceShape[], context: ExtractionContext): GroupNode {
  const extractedChildren = selection.map((shape) => extractNode(shape, context));
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

function extractNode(shape: PenpotSourceShape, context: ExtractionContext): IrNode {
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
    ...(shape.layoutChild == null ? {} : { layoutChild: layoutChildOf(shape.layoutChild) }),
    diagnostics,
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
        children: extractChildren(shape, context),
      } satisfies BoardNode;
      break;
    case "group":
      node = { ...base, kind: "group", children: extractChildren(shape, context) } satisfies GroupNode;
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
    case "text": {
      const runs = textRunsOf(shape, diagnostics);
      node = {
        ...base,
        kind: "text",
        text: shape.characters ?? "",
        textStyle: textStyleOf(shape, diagnostics),
        ...(runs === undefined ? {} : { runs }),
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

function extractChildren(shape: PenpotSourceShape, context: ExtractionContext): readonly IrNode[] {
  return (shape.children ?? []).map((child) => extractNode(child, context));
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

function layoutChildOf(layoutChild: PenpotSourceLayoutChild): LayoutChild {
  return {
    absolute: layoutChild.absolute === true,
    horizontalSizing: layoutChild.horizontalSizing ?? "fix",
    verticalSizing: layoutChild.verticalSizing ?? "fix",
  };
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
  const extension = mimeType === "image/jpeg" ? ".jpg" : mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : mimeType === "image/gif" ? ".gif" : "";
  return `assets/images/${encodedId}${extension}`;
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

function textStyleOf(shape: PenpotSourceShape, diagnostics: Diagnostic[]): TextStyle {
  const fontSize = finiteNumber(shape.fontSize);
  const lineHeight = finiteNumber(shape.lineHeight);
  const fontWeight = finiteNumber(shape.fontWeight);
  const letterSpacing = finiteNumber(shape.letterSpacing);
  if ((shape.fontFamily === "mixed" || shape.fontSize === "mixed") && shape.runs == null) diagnostics.push({ severity: "warning", sourceId: sourceIdOf(shape.id), code: "mixed-text-style", message: "Mixed text runs could not be resolved; the common text style was used." });
  return {
    ...(shape.fontFamily == null || shape.fontFamily === "mixed" ? {} : { fontFamily: shape.fontFamily }),
    ...(fontSize === undefined ? {} : { fontSize }),
    ...(fontWeight === undefined ? {} : { fontWeight }),
    ...(shape.fontStyle === "italic" ? { fontStyle: "italic" } : shape.fontStyle === "normal" ? { fontStyle: "normal" } : {}),
    ...(lineHeight === undefined ? {} : { lineHeight }),
    ...(letterSpacing === undefined ? {} : { letterSpacing }),
    ...(shape.textDecoration === "underline" || shape.textDecoration === "line-through" ? { decoration: shape.textDecoration } : {}),
    ...(shape.align == null || shape.align === "mixed" ? {} : { align: shape.align }),
  };
}

function textRunsOf(shape: PenpotSourceShape, diagnostics: Diagnostic[]): readonly TextRun[] | undefined {
  const runs = shape.runs;
  if (runs == null || runs.length === 0) return undefined;
  const mapped = runs.flatMap((run) => {
    const text = run.characters ?? "";
    if (text.length === 0) return [];
    return [{
      text,
      style: runStyleOf(run, sourceIdOf(shape.id), diagnostics),
    } satisfies TextRun];
  });
  return mapped.length === 0 ? undefined : mapped;
}

function runStyleOf(run: PenpotSourceTextRun, sourceId: string, diagnostics: Diagnostic[]): TextStyle {
  const fill = run.fills == null || run.fills === "mixed" || run.fills.length === 0 ? undefined : solidFillOf(run.fills, sourceId, diagnostics);
  return {
    ...(run.fontFamily == null || run.fontFamily === "mixed" ? {} : { fontFamily: run.fontFamily }),
    ...(finiteNumber(run.fontSize) === undefined ? {} : { fontSize: finiteNumber(run.fontSize)! }),
    ...(finiteNumber(run.fontWeight) === undefined ? {} : { fontWeight: finiteNumber(run.fontWeight)! }),
    ...(run.fontStyle === "italic" ? { fontStyle: "italic" } : run.fontStyle === "normal" ? { fontStyle: "normal" } : {}),
    ...(finiteNumber(run.lineHeight) === undefined ? {} : { lineHeight: finiteNumber(run.lineHeight)! }),
    ...(finiteNumber(run.letterSpacing) === undefined ? {} : { letterSpacing: finiteNumber(run.letterSpacing)! }),
    ...(run.textDecoration === "underline" || run.textDecoration === "line-through" ? { decoration: run.textDecoration } : {}),
    ...(fill === undefined ? {} : { color: fill }),
  };
}

function finiteNumber(value: string | null | undefined): number | undefined {
  if (value == null || value === "mixed") return undefined;
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
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
