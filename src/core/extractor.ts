import type {
  BoardNode,
  Border,
  ColorFill,
  CornerRadii,
  DropShadow,
  FlexAlignment,
  FlexDirection,
  FlexJustification,
  FlexLayout,
  LayoutChild,
  LayoutSizing,
  ConversionResult,
  Diagnostic,
  GroupNode,
  ImageFill,
  ImageNode,
  AssetManifestEntry,
  IrNode,
  NodeGeometry,
  NodeStyle,
  RectangleNode,
  TextNode,
  TextStyle,
  UnsupportedNode,
} from "../shared/ir.js";

export interface PenpotSourceImageData {
  readonly id?: string;
  readonly name?: string;
  readonly width: number;
  readonly height: number;
  readonly mtype?: string;
  readonly keepAspectRatio?: boolean;
}

export interface PenpotSourceFill {
  readonly fillColor?: string;
  readonly fillOpacity?: number;
  readonly fillImage?: PenpotSourceImageData | null;
}

export interface PenpotSourceStroke {
  readonly strokeColor?: string;
  readonly strokeOpacity?: number;
  readonly strokeStyle?: "solid" | "dotted" | "dashed" | "mixed" | "none" | "svg";
  readonly strokeWidth?: number;
}

export interface PenpotSourceShadow {
  readonly style?: "drop-shadow" | "inner-shadow";
  readonly offsetX?: number;
  readonly offsetY?: number;
  readonly blur?: number;
  readonly spread?: number;
  readonly hidden?: boolean;
  readonly color?: { readonly color?: string; readonly opacity?: number };
}

export interface PenpotSourceFlexLayout {
  readonly dir: FlexDirection;
  readonly rowGap: number;
  readonly columnGap: number;
  readonly topPadding: number;
  readonly rightPadding: number;
  readonly bottomPadding: number;
  readonly leftPadding: number;
  readonly justifyContent?: FlexJustification;
  readonly alignItems?: FlexAlignment;
}

export interface PenpotSourceLayoutChild {
  readonly absolute: boolean;
  readonly horizontalSizing: LayoutSizing;
  readonly verticalSizing: LayoutSizing;
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
  readonly fills?: readonly PenpotSourceFill[] | "mixed" | null;
  readonly strokes?: readonly PenpotSourceStroke[];
  readonly borderRadius?: number;
  readonly borderRadiusTopLeft?: number;
  readonly borderRadiusTopRight?: number;
  readonly borderRadiusBottomRight?: number;
  readonly borderRadiusBottomLeft?: number;
  readonly shadows?: readonly PenpotSourceShadow[];
  readonly children?: readonly PenpotSourceShape[];
  readonly clipContent?: boolean;
  readonly flex?: PenpotSourceFlexLayout;
  readonly layoutChild?: PenpotSourceLayoutChild | null;
  readonly characters?: string;
  readonly fontFamily?: string;
  readonly fontSize?: string;
  readonly fontWeight?: string;
  readonly lineHeight?: string;
  readonly letterSpacing?: string;
  readonly align?: "left" | "center" | "right" | "justify" | "mixed" | null;
}

interface ExtractionContext {
  readonly diagnostics: Diagnostic[];
  readonly assets: Map<string, AssetManifestEntry>;
}

export function extractSelection(selection: readonly PenpotSourceShape[]): ConversionResult {
  const diagnostics: Diagnostic[] = [];
  const context = { diagnostics, assets: new Map() };
  const root =
    selection.length === 1
      ? extractNode(selection[0], context)
      : extractSyntheticSelection(selection, context);

  return { root, assets: [...context.assets.values()], diagnostics };
}

function extractSyntheticSelection(
  selection: readonly PenpotSourceShape[],
  context: ExtractionContext,
): GroupNode {
  const extractedChildren = selection.map((shape) => extractNode(shape, context));
  const bounds = boundsOf(extractedChildren);
  const children = extractedChildren.map((child) => ({
    ...child,
    geometry: {
      ...child.geometry,
      x: child.geometry.x - bounds.x,
      y: child.geometry.y - bounds.y,
    },
  }));

  return {
    kind: "group",
    sourceId: "selection",
    name: "selection",
    geometry: { x: 0, y: 0, width: bounds.width, height: bounds.height },
    visible: true,
    style: { opacity: 1 },
    diagnostics: [],
    children,
  };
}

function extractNode(shape: PenpotSourceShape, context: ExtractionContext): IrNode {
  const diagnostics: Diagnostic[] = [];
  const base = {
    sourceId: shape.id,
    name: normalizeName(shape.name, shape.id),
    geometry: geometryOf(shape, diagnostics),
    visible: shape.visible,
    style: styleOf(shape, diagnostics, context),
    ...(shape.layoutChild == null ? {} : { layoutChild: layoutChildOf(shape.layoutChild) }),
    diagnostics,
  };

  let node: IrNode;
  switch (shape.type) {
    case "board":
      node = {
        ...base,
        kind: "board",
        clipContent: shape.clipContent ?? false,
        ...(shape.flex === undefined ? {} : { flex: flexOf(shape.flex) }),
        children: extractChildren(shape, context),
      } satisfies BoardNode;
      break;
    case "group":
      node = {
        ...base,
        kind: "group",
        children: extractChildren(shape, context),
      } satisfies GroupNode;
      break;
    case "rectangle":
    case "rect":
      node = { ...base, kind: "rectangle" } satisfies RectangleNode;
      break;
    case "image":
      node = { ...base, kind: "image" } satisfies ImageNode;
      break;
    case "text":
      node = {
        ...base,
        kind: "text",
        text: shape.characters ?? "",
        textStyle: textStyleOf(shape, diagnostics),
      } satisfies TextNode;
      break;
    default:
      diagnostics.push({
        severity: "warning",
        sourceId: shape.id,
        code: "unsupported-shape",
        message: `${shape.type} is not yet supported and was omitted from the generated widget.`,
      });
      node = {
        ...base,
        kind: "unsupported",
        sourceType: shape.type,
      } satisfies UnsupportedNode;
  }

  context.diagnostics.push(...diagnostics);
  return node;
}

function extractChildren(shape: PenpotSourceShape, context: ExtractionContext): readonly IrNode[] {
  return (shape.children ?? []).map((child) => extractNode(child, context));
}

function flexOf(flex: PenpotSourceFlexLayout): FlexLayout {
  return {
    direction: flex.dir,
    rowGap: nonNegativeDimension(flex.rowGap),
    columnGap: nonNegativeDimension(flex.columnGap),
    padding: {
      top: nonNegativeDimension(flex.topPadding),
      right: nonNegativeDimension(flex.rightPadding),
      bottom: nonNegativeDimension(flex.bottomPadding),
      left: nonNegativeDimension(flex.leftPadding),
    },
    ...(flex.justifyContent === undefined ? {} : { justifyContent: flex.justifyContent }),
    ...(flex.alignItems === undefined ? {} : { alignItems: flex.alignItems }),
  };
}

function layoutChildOf(layoutChild: PenpotSourceLayoutChild): LayoutChild {
  return {
    absolute: layoutChild.absolute,
    horizontalSizing: layoutChild.horizontalSizing,
    verticalSizing: layoutChild.verticalSizing,
  };
}

function geometryOf(shape: PenpotSourceShape, diagnostics: Diagnostic[]): NodeGeometry {
  const x = finiteCoordinate(shape.parentX ?? shape.x);
  const y = finiteCoordinate(shape.parentY ?? shape.y);
  const width = nonNegativeDimension(shape.width);
  const height = nonNegativeDimension(shape.height);

  if (x !== shape.x || y !== shape.y || width !== shape.width || height !== shape.height) {
    diagnostics.push({
      severity: "warning",
      sourceId: shape.id,
      code: "invalid-geometry",
      message: "Invalid or negative geometry was clamped before code generation.",
    });
  }

  return { x, y, width, height };
}

function finiteCoordinate(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function nonNegativeDimension(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function boundsOf(children: readonly IrNode[]): NodeGeometry {
  if (children.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const minX = Math.min(...children.map((child) => child.geometry.x));
  const minY = Math.min(...children.map((child) => child.geometry.y));
  const maxX = Math.max(...children.map((child) => child.geometry.x + child.geometry.width));
  const maxY = Math.max(...children.map((child) => child.geometry.y + child.geometry.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function styleOf(shape: PenpotSourceShape, diagnostics: Diagnostic[], context: ExtractionContext): NodeStyle {
  const fill = solidFillOf(shape.fills, shape.id, diagnostics);
  const image = imageFillOf(shape.fills, shape.id, diagnostics, context);
  const border = solidBorderOf(shape.strokes, shape.id, diagnostics);
  const radius = cornerRadiiOf(shape);
  const shadows = dropShadowsOf(shape.shadows, shape.id, diagnostics);
  return {
    ...(fill === undefined ? {} : { fill }),
    ...(image === undefined ? {} : { image }),
    ...(border === undefined ? {} : { border }),
    ...(radius === undefined ? {} : { radius }),
    ...(shadows.length === 0 ? {} : { shadows }),
    opacity: normalizedOpacity(shape.opacity, shape.id, diagnostics),
  };
}

function solidBorderOf(
  strokes: PenpotSourceShape["strokes"],
  sourceId: string,
  diagnostics: Diagnostic[],
): Border | undefined {
  const stroke = strokes?.[0];
  if (stroke === undefined || stroke.strokeStyle === "none") {
    return undefined;
  }
  if (stroke.strokeStyle !== undefined && stroke.strokeStyle !== "solid") {
    diagnostics.push({ severity: "warning", sourceId, code: "unsupported-stroke", message: "Only solid strokes are supported." });
    return undefined;
  }
  const color = stroke.strokeColor === undefined ? undefined : normalizeHexColor(stroke.strokeColor);
  if (color === undefined) {
    diagnostics.push({ severity: "warning", sourceId, code: "unsupported-stroke", message: "Solid strokes require a hex color." });
    return undefined;
  }
  return { color, opacity: stroke.strokeOpacity ?? 1, width: nonNegativeDimension(stroke.strokeWidth ?? 0) };
}

function cornerRadiiOf(shape: PenpotSourceShape): CornerRadii | undefined {
  const radius = shape.borderRadius;
  const corners = [shape.borderRadiusTopLeft, shape.borderRadiusTopRight, shape.borderRadiusBottomRight, shape.borderRadiusBottomLeft];
  if (radius === undefined && corners.every((corner) => corner === undefined)) {
    return undefined;
  }
  const fallback = nonNegativeDimension(radius ?? 0);
  return {
    topLeft: nonNegativeDimension(shape.borderRadiusTopLeft ?? fallback),
    topRight: nonNegativeDimension(shape.borderRadiusTopRight ?? fallback),
    bottomRight: nonNegativeDimension(shape.borderRadiusBottomRight ?? fallback),
    bottomLeft: nonNegativeDimension(shape.borderRadiusBottomLeft ?? fallback),
  };
}

function dropShadowsOf(
  shadows: PenpotSourceShape["shadows"],
  sourceId: string,
  diagnostics: Diagnostic[],
): readonly DropShadow[] {
  return (shadows ?? []).flatMap((shadow) => {
    if (shadow.hidden) return [];
    if (shadow.style !== undefined && shadow.style !== "drop-shadow") {
      diagnostics.push({ severity: "warning", sourceId, code: "unsupported-shadow", message: "Only drop shadows are supported." });
      return [];
    }
    const color = shadow.color?.color === undefined ? undefined : normalizeHexColor(shadow.color.color);
    if (color === undefined) {
      diagnostics.push({ severity: "warning", sourceId, code: "unsupported-shadow", message: "Drop shadows require a hex color." });
      return [];
    }
    return [{
      color,
      opacity: shadow.color?.opacity ?? 1,
      offsetX: shadow.offsetX ?? 0,
      offsetY: shadow.offsetY ?? 0,
      blur: nonNegativeDimension(shadow.blur ?? 0),
      spread: shadow.spread ?? 0,
    }];
  });
}

function normalizedOpacity(
  value: number | null | undefined,
  sourceId: string,
  diagnostics: Diagnostic[],
): number {
  if (value === null || value === undefined) {
    return 1;
  }
  if (!Number.isFinite(value)) {
    diagnostics.push({
      severity: "warning",
      sourceId,
      code: "invalid-opacity",
      message: "Invalid opacity defaulted to 1 before code generation.",
    });
    return 1;
  }
  return Math.min(Math.max(value, 0), 1);
}

function imageFillOf(
  fills: PenpotSourceShape["fills"],
  sourceId: string,
  diagnostics: Diagnostic[],
  context: ExtractionContext,
): ImageFill | undefined {
  if (fills == null || fills === "mixed") {
    return undefined;
  }

  const imageFill = fills.find((fill) => "fillImage" in fill);
  if (imageFill === undefined) {
    return undefined;
  }
  const image = imageFill.fillImage;
  if (image == null || image.id === undefined || image.id.trim() === "") {
    diagnostics.push({
      severity: "warning",
      sourceId,
      code: "unusable-image-id",
      message: "Image data has no stable usable ID, so no Flutter asset reference was generated.",
    });
    return undefined;
  }

  const path = assetPathFor(image.id, image.mtype);
  if (!context.assets.has(image.id)) {
    context.assets.set(image.id, {
      id: image.id,
      ...(image.name === undefined ? {} : { name: image.name }),
      ...(image.mtype === undefined ? {} : { mimeType: image.mtype }),
      width: nonNegativeDimension(image.width),
      height: nonNegativeDimension(image.height),
      path,
    });
  }
  return { assetPath: path, keepAspectRatio: image.keepAspectRatio ?? false };
}

function assetPathFor(id: string, mimeType: string | undefined): string {
  const encodedId = [...id].map((character) => /[A-Za-z0-9_-]/.test(character) ? character : `_${character.codePointAt(0)!.toString(16)}`).join("");
  const extension = mimeType === "image/jpeg" ? ".jpg" : mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : mimeType === "image/gif" ? ".gif" : "";
  return `assets/images/${encodedId}${extension}`;
}

function solidFillOf(
  fills: PenpotSourceShape["fills"],
  sourceId: string,
  diagnostics: Diagnostic[],
): ColorFill | undefined {
  if (fills == null || fills === "mixed" || fills.length === 0) {
    return undefined;
  }

  const fill = fills[0];
  if (fill.fillImage !== undefined) {
    return undefined;
  }
  if (fill.fillColor === undefined) {
    diagnostics.push({
      severity: "warning",
      sourceId,
      code: "unsupported-fill",
      message: "Only solid color fills are supported in this phase.",
    });
    return undefined;
  }

  const color = normalizeHexColor(fill.fillColor);
  if (color === undefined) {
    diagnostics.push({
      severity: "warning",
      sourceId,
      code: "unsupported-color",
      message: `Unsupported color value ${fill.fillColor}.`,
    });
    return undefined;
  }

  return { color, opacity: fill.fillOpacity ?? 1 };
}

function textStyleOf(shape: PenpotSourceShape, diagnostics: Diagnostic[]): TextStyle {
  const fontSize = finiteNumber(shape.fontSize);
  const lineHeight = finiteNumber(shape.lineHeight);
  const fontWeight = finiteNumber(shape.fontWeight);
  const letterSpacing = finiteNumber(shape.letterSpacing);

  if (shape.fontFamily === "mixed" || shape.fontSize === "mixed") {
    diagnostics.push({
      severity: "warning",
      sourceId: shape.id,
      code: "mixed-text-style",
      message: "Mixed text runs are not yet supported; the common text style was used.",
    });
  }

  return {
    ...(shape.fontFamily === undefined || shape.fontFamily === "mixed"
      ? {}
      : { fontFamily: shape.fontFamily }),
    ...(fontSize === undefined ? {} : { fontSize }),
    ...(fontWeight === undefined ? {} : { fontWeight }),
    ...(lineHeight === undefined ? {} : { lineHeight }),
    ...(letterSpacing === undefined ? {} : { letterSpacing }),
    ...(shape.align === null || shape.align === "mixed" || shape.align === undefined
      ? {}
      : { align: shape.align }),
  };
}

function finiteNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === "mixed") {
    return undefined;
  }

  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
}

function normalizeHexColor(value: string): string | undefined {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  return match === null ? undefined : `#${match[1].toLowerCase()}`;
}

function normalizeName(name: string, sourceId: string): string {
  const words = name.match(/[A-Za-z0-9]+/g) ?? [];
  const normalized = words
    .map((word, index) =>
      index === 0
        ? word.charAt(0).toLowerCase() + word.slice(1)
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join("");
  const withPrefix = /^[A-Za-z_]/.test(normalized) ? normalized : `node${normalized}`;
  return withPrefix || `node${sourceId.replace(/[^A-Za-z0-9]/g, "")}`;
}
