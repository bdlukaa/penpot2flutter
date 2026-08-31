import type {
  BoardNode,
  ColorFill,
  ConversionResult,
  Diagnostic,
  GroupNode,
  IrNode,
  NodeGeometry,
  NodeStyle,
  RectangleNode,
  TextNode,
  TextStyle,
  UnsupportedNode,
} from "../shared/ir.js";

export interface PenpotSourceFill {
  readonly fillColor?: string;
  readonly fillOpacity?: number;
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
  readonly fills?: readonly PenpotSourceFill[] | "mixed";
  readonly children?: readonly PenpotSourceShape[];
  readonly clipContent?: boolean;
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
}

export function extractSelection(selection: readonly PenpotSourceShape[]): ConversionResult {
  const diagnostics: Diagnostic[] = [];
  const context = { diagnostics };
  const root =
    selection.length === 1
      ? extractNode(selection[0], context)
      : extractSyntheticSelection(selection, context);

  return { root, diagnostics };
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
    style: styleOf(shape, diagnostics),
    diagnostics,
  };

  let node: IrNode;
  switch (shape.type) {
    case "board":
      node = {
        ...base,
        kind: "board",
        clipContent: shape.clipContent ?? false,
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

function styleOf(shape: PenpotSourceShape, diagnostics: Diagnostic[]): NodeStyle {
  const fill = solidFillOf(shape.fills, shape.id, diagnostics);
  return {
    ...(fill === undefined ? {} : { fill }),
    opacity: normalizedOpacity(shape.opacity, shape.id, diagnostics),
  };
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

function solidFillOf(
  fills: PenpotSourceShape["fills"],
  sourceId: string,
  diagnostics: Diagnostic[],
): ColorFill | undefined {
  if (fills === undefined || fills === "mixed" || fills.length === 0) {
    return undefined;
  }

  const fill = fills[0];
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
