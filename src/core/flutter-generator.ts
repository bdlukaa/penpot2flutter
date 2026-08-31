import type { AssetManifestEntry, BoardNode, ColorFill, GradientFill, GridLayout, GroupNode, IrNode, NodeStyle, TextNode, TextRun, TextStyle } from "../shared/ir.js";

export function generatePubspecAssetsSnippet(assets: readonly AssetManifestEntry[]): string {
  return assets.length === 0 ? "" : ["flutter:", "  assets:", ...assets.map((asset) => `    - ${asset.path}`), ""].join("\n");
}

export function generateFlutterWidget(root: IrNode): string {
  const className = toPascalCase(root.name) || "GeneratedWidget";
  return [
    ...(containsRotation(root) ? ["import 'dart:math' as math;", ""] : []),
    "import 'package:flutter/material.dart';",
    "",
    `class ${className} extends StatelessWidget {`,
    `  const ${className}({super.key});`,
    "",
    "  @override",
    "  Widget build(BuildContext context) {",
    `    return ${renderNode(root, 2, false)};`,
    "  }",
    "}",
    "",
  ].join("\n");
}

function containsRotation(node: IrNode): boolean {
  return (node.transform?.rotation ?? 0) !== 0 || ("children" in node && node.children.some(containsRotation));
}

function renderNode(node: IrNode, depth: number, positioned: boolean): string {
  if (!node.visible || node.kind === "unsupported") return "const SizedBox.shrink()";

  const contentDepth = positioned ? depth + 1 : depth;
  const transformDepth = transformWrapperCount(node);
  const opacityDepth = node.style.opacity === 1 ? 0 : 1;
  let content = renderContent(node, contentDepth + transformDepth + opacityDepth);
  if (node.transform !== undefined) content = renderTransform(node, content, contentDepth + opacityDepth);
  if (node.style.opacity !== 1) {
    content = [
      "Opacity(",
      `${indent(contentDepth + 1)}opacity: ${number(node.style.opacity)},`,
      `${indent(contentDepth + 1)}child: ${content},`,
      `${indent(contentDepth)})`,
    ].join("\n");
  }
  if (!positioned) return content;
  return [
    "Positioned(",
    `${indent(depth + 1)}left: ${number(node.geometry.x)},`,
    `${indent(depth + 1)}top: ${number(node.geometry.y)},`,
    `${indent(depth + 1)}child: ${content},`,
    `${indent(depth)})`,
  ].join("\n");
}

function transformWrapperCount(node: Exclude<IrNode, { kind: "unsupported" }>): number {
  const transform = node.transform;
  return transform === undefined ? 0 : Number(transform.rotation !== 0) + Number(transform.flipX || transform.flipY);
}

function renderTransform(node: Exclude<IrNode, { kind: "unsupported" }>, child: string, depth: number): string {
  const transform = node.transform;
  if (transform === undefined) return child;
  const flipped = transform.flipX || transform.flipY;
  const scaleDepth = depth + Number(transform.rotation !== 0);
  const scaled = !flipped ? child : [
    "Transform(",
    `${indent(scaleDepth + 1)}alignment: Alignment.center,`,
    `${indent(scaleDepth + 1)}transform: Matrix4.diagonal3Values(${transform.flipX ? "-1" : "1"}, ${transform.flipY ? "-1" : "1"}, 1),`,
    `${indent(scaleDepth + 1)}child: ${child},`,
    `${indent(scaleDepth)})`,
  ].join("\n");
  return transform.rotation === 0
    ? scaled
    : [
        "Transform.rotate(",
        `${indent(depth + 1)}angle: ${number(transform.rotation)} * math.pi / 180,`,
        `${indent(depth + 1)}alignment: Alignment.center,`,
        `${indent(depth + 1)}child: ${scaled},`,
        `${indent(depth)})`,
      ].join("\n");
}

function renderContent(node: Exclude<IrNode, { kind: "unsupported" }>, depth: number): string {
  switch (node.kind) {
    case "board":
      return renderContainer(node, depth, node.clipContent ? "Clip.hardEdge" : "Clip.none");
    case "group":
      return renderGroup(node, depth);
    case "rectangle":
    case "image":
      return renderShape(node.style, node.geometry.width, node.geometry.height, depth, false);
    case "ellipse":
      return renderShape(node.style, node.geometry.width, node.geometry.height, depth, true);
    case "text":
      return renderText(node, depth);
  }
}

function renderContainer(node: BoardNode, depth: number, clipBehavior: string): string {
  const lines = ["Container(", `${indent(depth + 1)}width: ${number(node.geometry.width)},`, `${indent(depth + 1)}height: ${number(node.geometry.height)},`];
  const decoration = renderDecoration(node.style, depth + 1);
  if (decoration !== undefined) lines.push(`${indent(depth + 1)}decoration: ${decoration},`);
  lines.push(
    `${indent(depth + 1)}clipBehavior: ${clipBehavior},`,
    `${indent(depth + 1)}child: ${node.flex !== undefined ? renderFlex(node, depth + 1, clipBehavior) : node.grid?.supported === true ? renderGrid(node.grid, node.children, depth + 1) : renderStack(node.children, depth + 1, clipBehavior)},`,
    `${indent(depth)})`,
  );
  return lines.join("\n");
}

function renderStack(children: readonly IrNode[], depth: number, clipBehavior: string): string {
  return [
    "Stack(",
    `${indent(depth + 1)}clipBehavior: ${clipBehavior},`,
    `${indent(depth + 1)}children: [`,
    ...children.map((child) => `${indent(depth + 2)}${renderNode(child, depth + 2, true)},`),
    `${indent(depth + 1)}],`,
    `${indent(depth)})`,
  ].join("\n");
}

function renderGrid(grid: GridLayout, children: readonly IrNode[], depth: number): string {
  return [
    "GridView.count(",
    `${indent(depth + 1)}crossAxisCount: ${grid.columns.length},`,
    `${indent(depth + 1)}mainAxisSpacing: ${number(grid.rowGap)},`,
    `${indent(depth + 1)}crossAxisSpacing: ${number(grid.columnGap)},`,
    `${indent(depth + 1)}padding: EdgeInsets.only(top: ${number(grid.padding.top)}, right: ${number(grid.padding.right)}, bottom: ${number(grid.padding.bottom)}, left: ${number(grid.padding.left)}),`,
    `${indent(depth + 1)}physics: const NeverScrollableScrollPhysics(),`,
    `${indent(depth + 1)}children: [`,
    ...children.map((child) => `${indent(depth + 2)}${renderNode(child, depth + 2, false)},`),
    `${indent(depth + 1)}],`,
    `${indent(depth)})`,
  ].join("\n");
}

function renderFlex(node: BoardNode, depth: number, clipBehavior: string): string {
  const flowChildren = node.children.filter((child) => !child.layoutChild?.absolute);
  const absoluteChildren = node.children.filter((child) => child.layoutChild?.absolute);
  const flex = renderFlexFlow(node, flowChildren, depth + (absoluteChildren.length === 0 ? 0 : 2));
  if (absoluteChildren.length === 0) return flex;
  return [
    "Stack(",
    `${indent(depth + 1)}clipBehavior: ${clipBehavior},`,
    `${indent(depth + 1)}children: [`,
    `${indent(depth + 2)}Positioned.fill(`,
    `${indent(depth + 3)}child: ${flex},`,
    `${indent(depth + 2)}),`,
    ...absoluteChildren.map((child) => `${indent(depth + 2)}${renderNode(child, depth + 2, true)},`),
    `${indent(depth + 1)}],`,
    `${indent(depth)})`,
  ].join("\n");
}

function renderFlexFlow(node: BoardNode, children: readonly IrNode[], depth: number): string {
  const flex = node.flex;
  if (flex === undefined) return renderStack(node.children, depth, node.clipContent ? "Clip.hardEdge" : "Clip.none");
  const isRow = flex.direction === "row" || flex.direction === "row-reverse";
  const gap = isRow ? flex.columnGap : flex.rowGap;
  const renderedChildren = children.flatMap((child, index) => [
    ...(index === 0 ? [] : [`SizedBox(${isRow ? "width" : "height"}: ${number(gap)})`]),
    renderFlexChild(child, depth + 3, isRow),
  ]);
  const layout = [
    `${isRow ? "Row" : "Column"}(`,
    ...(flex.direction === "row-reverse" ? [`${indent(depth + 2)}textDirection: TextDirection.rtl,`] : []),
    ...(flex.direction === "column-reverse" ? [`${indent(depth + 2)}verticalDirection: VerticalDirection.up,`] : []),
    `${indent(depth + 2)}mainAxisAlignment: MainAxisAlignment.${mainAxisAlignment(flex.justifyContent)},`,
    `${indent(depth + 2)}crossAxisAlignment: CrossAxisAlignment.${crossAxisAlignment(flex.alignItems)},`,
    `${indent(depth + 2)}children: [`,
    ...renderedChildren.map((child) => `${indent(depth + 3)}${child},`),
    `${indent(depth + 2)}],`,
    `${indent(depth + 1)}),`,
  ];
  return [
    "Padding(",
    `${indent(depth + 1)}padding: EdgeInsets.only(top: ${number(flex.padding.top)}, right: ${number(flex.padding.right)}, bottom: ${number(flex.padding.bottom)}, left: ${number(flex.padding.left)}),`,
    `${indent(depth + 1)}child: ${layout.join("\n")}`,
    `${indent(depth)})`,
  ].join("\n");
}

function renderFlexChild(node: IrNode, depth: number, isRow: boolean): string {
  const mainAxisSizing = isRow ? node.layoutChild?.horizontalSizing : node.layoutChild?.verticalSizing;
  const crossAxisSizing = isRow ? node.layoutChild?.verticalSizing : node.layoutChild?.horizontalSizing;
  const child = renderNode(node, depth + Number(mainAxisSizing === "fill") + Number(crossAxisSizing === "fill"), false);
  const crossAxisChild = crossAxisSizing === "fill"
    ? ["SizedBox(", `${indent(depth + Number(mainAxisSizing === "fill") + 1)}${isRow ? "height" : "width"}: double.infinity,`, `${indent(depth + Number(mainAxisSizing === "fill") + 1)}child: ${child},`, `${indent(depth + Number(mainAxisSizing === "fill"))})`].join("\n")
    : child;
  return mainAxisSizing === "fill"
    ? ["Expanded(", `${indent(depth + 1)}child: ${crossAxisChild},`, `${indent(depth)})`].join("\n")
    : crossAxisChild;
}

function mainAxisAlignment(value: string | undefined): string {
  switch (value) {
    case "center": return "center";
    case "end": return "end";
    case "space-between": return "spaceBetween";
    case "space-around": return "spaceAround";
    case "space-evenly": return "spaceEvenly";
    default: return "start";
  }
}

function crossAxisAlignment(value: string | undefined): string {
  switch (value) {
    case "end": return "end";
    case "center": return "center";
    case "stretch": return "stretch";
    default: return "start";
  }
}

function renderGroup(node: GroupNode, depth: number): string {
  return [
    "SizedBox(",
    `${indent(depth + 1)}width: ${number(node.geometry.width)},`,
    `${indent(depth + 1)}height: ${number(node.geometry.height)},`,
    `${indent(depth + 1)}child: Stack(`,
    `${indent(depth + 2)}children: [`,
    ...node.children.map((child) => `${indent(depth + 3)}${renderNode(child, depth + 3, true)},`),
    `${indent(depth + 2)}],`,
    `${indent(depth + 1)}),`,
    `${indent(depth)})`,
  ].join("\n");
}

function renderShape(style: NodeStyle, width: number, height: number, depth: number, ellipse: boolean): string {
  const decoration = renderDecoration(style, depth + (ellipse ? 3 : 2));
  const child = decoration === undefined
    ? "const SizedBox.expand()"
    : ["DecoratedBox(", `${indent(depth + (ellipse ? 3 : 2))}decoration: ${decoration},`, `${indent(depth + (ellipse ? 2 : 1))})`].join("\n");
  const content = !ellipse
    ? child
    : ["ClipOval(", `${indent(depth + 2)}child: ${child},`, `${indent(depth + 1)})`].join("\n");
  return [
    "SizedBox(",
    `${indent(depth + 1)}width: ${number(width)},`,
    `${indent(depth + 1)}height: ${number(height)},`,
    `${indent(depth + 1)}child: ${content},`,
    `${indent(depth)})`,
  ].join("\n");
}

function renderText(node: TextNode, depth: number): string {
  if (node.runs !== undefined) return renderRichText(node, depth);
  const style = node.textStyle;
  const textStyle = renderTextStyle(style, node.style.fill, depth + 2);
  return [
    "SizedBox(",
    `${indent(depth + 1)}width: ${number(node.geometry.width)},`,
    `${indent(depth + 1)}height: ${number(node.geometry.height)},`,
    `${indent(depth + 1)}child: Text(`,
    `${indent(depth + 2)}'${escapeDart(node.text)}',`,
    ...(style.align === undefined ? [] : [`${indent(depth + 2)}textAlign: TextAlign.${style.align},`]),
    ...(textStyle === undefined ? [] : [`${indent(depth + 2)}style: ${textStyle},`]),
    `${indent(depth + 1)}),`,
    `${indent(depth)})`,
  ].join("\n");
}

function renderRichText(node: TextNode, depth: number): string {
  return [
    "SizedBox(",
    `${indent(depth + 1)}width: ${number(node.geometry.width)},`,
    `${indent(depth + 1)}height: ${number(node.geometry.height)},`,
    `${indent(depth + 1)}child: RichText(`,
    ...(node.textStyle.align === undefined ? [] : [`${indent(depth + 2)}textAlign: TextAlign.${node.textStyle.align},`]),
    `${indent(depth + 2)}text: TextSpan(`,
    `${indent(depth + 3)}children: [`,
    ...(node.runs ?? []).map((run) => `${indent(depth + 4)}${renderTextSpan(run, depth + 4)},`),
    `${indent(depth + 3)}],`,
    `${indent(depth + 2)}),`,
    `${indent(depth + 1)}),`,
    `${indent(depth)})`,
  ].join("\n");
}

function renderTextSpan(run: TextRun, depth: number): string {
  const style = renderTextStyle(run.style, undefined, depth + 1);
  return [
    "TextSpan(",
    ...(style === undefined ? [] : [`${indent(depth + 1)}style: ${style},`]),
    `${indent(depth + 1)}text: '${escapeDart(run.text)}',`,
    `${indent(depth)})`,
  ].join("\n");
}

function renderTextStyle(style: TextStyle, fillColor: ColorFill | undefined, styleDepth: number): string | undefined {
  const properties = [
    ...(style.fontFamily === undefined ? [] : [`fontFamily: '${escapeDart(style.fontFamily)}'`]),
    ...(style.fontSize === undefined ? [] : [`fontSize: ${number(style.fontSize)}`]),
    ...(style.fontWeight === undefined ? [] : [`fontWeight: ${fontWeight(style.fontWeight)}`]),
    ...(style.fontStyle === "italic" ? ["fontStyle: FontStyle.italic"] : style.fontStyle === "normal" ? ["fontStyle: FontStyle.normal"] : []),
    ...(style.lineHeight === undefined || style.fontSize === undefined ? [] : [`height: ${number(style.lineHeight)}`]),
    ...(style.letterSpacing === undefined ? [] : [`letterSpacing: ${number(style.letterSpacing)}`]),
    ...(style.decoration === "underline" ? ["decoration: TextDecoration.underline"] : style.decoration === "line-through" ? ["decoration: TextDecoration.lineThrough"] : []),
    ...(style.color !== undefined ? [`color: ${dartColor(style.color.color, style.color.opacity)}`] : fillColor === undefined ? [] : [`color: ${dartColor(fillColor.color, fillColor.opacity)}`]),
  ];
  return properties.length === 0 ? undefined : [`TextStyle(`, ...properties.map((property) => `${indent(styleDepth + 1)}${property},`), `${indent(styleDepth)})`].join("\n");
}

function renderDecoration(style: NodeStyle, depth: number): string | undefined {
  if (style.fill === undefined && style.gradient === undefined && style.image === undefined && style.border === undefined && style.radius === undefined && style.shadows === undefined) return undefined;
  const properties = [
    ...(style.fill === undefined ? [] : [`color: ${dartColor(style.fill.color, style.fill.opacity)}`]),
    ...(style.gradient === undefined ? [] : [`gradient: ${renderGradient(style.gradient, depth + 1)}`]),
    ...(style.image === undefined ? [] : [`image: DecorationImage(\n${indent(depth + 2)}image: AssetImage('${escapeDart(style.image.assetPath)}'),\n${indent(depth + 2)}fit: BoxFit.${style.image.keepAspectRatio ? "cover" : "fill"},\n${indent(depth + 1)})`]),
    ...(style.border === undefined ? [] : [`border: Border.all(color: ${dartColor(style.border.color, style.border.opacity)}, width: ${number(style.border.width)})`]),
    ...(style.radius === undefined ? [] : [`borderRadius: ${borderRadius(style.radius, depth + 2)}`]),
    ...(style.shadows === undefined ? [] : [`boxShadow: [\n${style.shadows.map((shadow) => `${indent(depth + 2)}${renderShadow(shadow, depth + 3)},`).join("\n")}\n${indent(depth + 1)}]`]),
  ];
  return properties.length === 1 && !properties[0].includes("\n")
    ? `const BoxDecoration(${properties[0]})`
    : `BoxDecoration(\n${properties.map((property) => `${indent(depth + 1)}${property},`).join("\n")}\n${indent(depth)})`;
}

function renderGradient(gradient: GradientFill, depth: number): string {
  const colors = gradient.stops.map((stop) => dartColor(stop.color, stop.opacity)).join(", ");
  const stops = gradient.stops.map((stop) => number(stop.offset)).join(", ");
  if (gradient.type === "radial") {
    return ["RadialGradient(", `${indent(depth + 1)}center: Alignment(${number(gradient.startX * 2 - 1)}, ${number(gradient.startY * 2 - 1)}),`, `${indent(depth + 1)}radius: ${number(gradient.width)},`, `${indent(depth + 1)}colors: [${colors}],`, `${indent(depth + 1)}stops: [${stops}],`, `${indent(depth)})`].join("\n");
  }
  return ["LinearGradient(", `${indent(depth + 1)}begin: Alignment(${number(gradient.startX * 2 - 1)}, ${number(gradient.startY * 2 - 1)}),`, `${indent(depth + 1)}end: Alignment(${number(gradient.endX * 2 - 1)}, ${number(gradient.endY * 2 - 1)}),`, `${indent(depth + 1)}colors: [${colors}],`, `${indent(depth + 1)}stops: [${stops}],`, `${indent(depth)})`].join("\n");
}

function borderRadius(radius: NonNullable<NodeStyle["radius"]>, depth: number): string {
  const values = [radius.topLeft, radius.topRight, radius.bottomRight, radius.bottomLeft];
  if (values.every((value) => value === values[0])) return `BorderRadius.circular(${number(values[0])})`;
  return ["BorderRadius.only(", `${indent(depth)}topLeft: Radius.circular(${number(radius.topLeft)}),`, `${indent(depth)}topRight: Radius.circular(${number(radius.topRight)}),`, `${indent(depth)}bottomRight: Radius.circular(${number(radius.bottomRight)}),`, `${indent(depth)}bottomLeft: Radius.circular(${number(radius.bottomLeft)}),`, `${indent(depth - 1)})`].join("\n");
}

function renderShadow(shadow: NonNullable<NodeStyle["shadows"]>[number], depth: number): string {
  return ["BoxShadow(", `${indent(depth)}color: ${dartColor(shadow.color, shadow.opacity)},`, `${indent(depth)}offset: Offset(${number(shadow.offsetX)}, ${number(shadow.offsetY)}),`, `${indent(depth)}blurRadius: ${number(shadow.blur)},`, `${indent(depth)}spreadRadius: ${number(shadow.spread)},`, `${indent(depth - 1)})`].join("\n");
}

function dartColor(hex: string, opacity: number): string {
  const alpha = Math.round(Math.min(Math.max(opacity, 0), 1) * 255).toString(16).padStart(2, "0");
  return `Color(0x${alpha}${hex.slice(1)})`;
}

function fontWeight(value: number): string {
  return `FontWeight.w${Math.min(900, Math.max(100, Math.round(value / 100) * 100))}`;
}

function toPascalCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("").replace(/^[^A-Za-z]+/, "");
}

function number(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Number(value.toFixed(2));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function indent(depth: number): string {
  return "  ".repeat(depth);
}

function escapeDart(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
}
