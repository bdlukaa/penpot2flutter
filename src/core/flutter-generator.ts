import type { AssetManifestEntry, BoardNode, ColorFill, EdgeInsets, GradientFill, GridLayout, GroupNode, IrNode, NodeStyle, SvgNode, TextNode, TextRun, TextStyle } from "../shared/ir.js";

export function generatePubspecSnippet(assets: readonly AssetManifestEntry[]): string {
  if (assets.length === 0) return "";
  const hasSvg = assets.some((asset) => asset.mimeType === "image/svg+xml");
  return [
    ...(hasSvg ? ["dependencies:", "  flutter_svg: ^2.3.0", ""] : []),
    "flutter:",
    "  assets:",
    ...assets.map((asset) => `    - ${asset.path}`),
    "",
  ].join("\n");
}

export function generateFlutterWidget(root: IrNode): string {
  const className = toPascalCase(root.name) || "GeneratedWidget";
  return [
    ...(containsRotation(root) ? ["import 'dart:math' as math;", ""] : []),
    "import 'package:flutter/material.dart';",
    ...(containsSvg(root) ? ["import 'package:flutter_svg/flutter_svg.dart';"] : []),
    "",
    `class ${className} extends StatelessWidget {`,
    `  const ${className}({super.key});`,
    "",
    "  @override",
    "  Widget build(BuildContext context) {",
    `    // ${root.sourceName}`,
    `    return ${renderNode(root, 2, false)};`,
    "  }",
    "}",
    "",
  ].join("\n");
}

function containsRotation(node: IrNode): boolean {
  return (node.transform?.rotation ?? 0) !== 0 || ("children" in node && node.children.some(containsRotation));
}

function containsSvg(node: IrNode): boolean {
  return node.kind === "svg" || ("children" in node && node.children.some(containsSvg));
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
    case "svg":
      return renderSvg(node, depth);
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
  if (clipBehavior !== "Clip.none") lines.push(`${indent(depth + 1)}clipBehavior: ${clipBehavior},`);
  lines.push(
    `${indent(depth + 1)}child: ${node.flex !== undefined ? renderFlex(node, depth + 1, clipBehavior) : node.grid?.supported === true ? renderGrid(node.grid, node.children, depth + 1) : renderStack(node.children, depth + 1, clipBehavior)},`,
    `${indent(depth)})`,
  );
  return lines.join("\n");
}

function renderStack(children: readonly IrNode[], depth: number, clipBehavior: string): string {
  return [
    "Stack(",
    ...(clipBehavior === "Clip.hardEdge" ? [] : [`${indent(depth + 1)}clipBehavior: ${clipBehavior},`]),
    `${indent(depth + 1)}children: [`,
    ...children.map((child) => `${commentFor(child, depth + 2, renderNode(child, depth + 2, true))},`),
    `${indent(depth + 1)}],`,
    `${indent(depth)})`,
  ].join("\n");
}

function renderGrid(grid: GridLayout, children: readonly IrNode[], depth: number): string {
  return [
    "GridView.count(",
    `${indent(depth + 1)}crossAxisCount: ${grid.columns.length},`,
    ...(grid.rowGap === 0 ? [] : [`${indent(depth + 1)}mainAxisSpacing: ${number(grid.rowGap)},`]),
    ...(grid.columnGap === 0 ? [] : [`${indent(depth + 1)}crossAxisSpacing: ${number(grid.columnGap)},`]),
    ...(paddingIsZero(grid.padding) ? [] : [`${indent(depth + 1)}padding: ${edgeInsetsDirectional(grid.padding)},`]),
    `${indent(depth + 1)}physics: const NeverScrollableScrollPhysics(),`,
    `${indent(depth + 1)}children: [`,
    ...children.map((child) => `${commentFor(child, depth + 2, renderNode(child, depth + 2, false))},`),
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
    ...(clipBehavior === "Clip.hardEdge" ? [] : [`${indent(depth + 1)}clipBehavior: ${clipBehavior},`]),
    `${indent(depth + 1)}children: [`,
    `${indent(depth + 2)}Positioned.fill(`,
    `${indent(depth + 3)}child: ${flex},`,
    `${indent(depth + 2)}),`,
    ...absoluteChildren.map((child) => `${commentFor(child, depth + 2, renderNode(child, depth + 2, true))},`),
    `${indent(depth + 1)}],`,
    `${indent(depth)})`,
  ].join("\n");
}

function renderFlexFlow(node: BoardNode, children: readonly IrNode[], depth: number): string {
  const flex = node.flex;
  if (flex === undefined) return renderStack(node.children, depth, node.clipContent ? "Clip.hardEdge" : "Clip.none");
  const isRow = flex.direction === "row" || flex.direction === "row-reverse";
  const gap = isRow ? flex.columnGap : flex.rowGap;
  const main = mainAxisAlignment(flex.justifyContent);
  const cross = crossAxisAlignment(flex.alignItems);
  const flow = [
    `${isRow ? "Row" : "Column"}(`,
    ...(flex.direction === "row-reverse" ? [`${indent(depth + 1)}textDirection: TextDirection.rtl,`] : []),
    ...(flex.direction === "column-reverse" ? [`${indent(depth + 1)}verticalDirection: VerticalDirection.up,`] : []),
    ...(gap === 0 ? [] : [`${indent(depth + 1)}spacing: ${number(gap)},`]),
    ...(main === "start" ? [] : [`${indent(depth + 1)}mainAxisAlignment: MainAxisAlignment.${main},`]),
    ...(cross === "center" ? [] : [`${indent(depth + 1)}crossAxisAlignment: CrossAxisAlignment.${cross},`]),
    `${indent(depth + 1)}children: [`,
    ...children.map((child) => `${commentFor(child, depth + 2, renderFlexChild(child, depth + 2, isRow))},`),
    `${indent(depth + 1)}],`,
    `${indent(depth)})`,
  ];
  if (paddingIsZero(flex.padding)) return flow.join("\n");
  return [
    "Padding(",
    `${indent(depth + 1)}padding: ${edgeInsetsDirectional(flex.padding)},`,
    `${indent(depth + 1)}child: ${flow.join("\n")},`,
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
    ...node.children.map((child) => `${commentFor(child, depth + 3, renderNode(child, depth + 3, true))},`),
    `${indent(depth + 2)}],`,
    `${indent(depth + 1)}),`,
    `${indent(depth)})`,
  ].join("\n");
}

function renderShape(style: NodeStyle, width: number, height: number, depth: number, ellipse: boolean): string {
  const decoration = renderDecoration(style, depth + (ellipse ? 3 : 2));
  if (decoration === undefined) {
    return [
      "SizedBox(",
      `${indent(depth + 1)}width: ${number(width)},`,
      `${indent(depth + 1)}height: ${number(height)},`,
      `${indent(depth)})`,
    ].join("\n");
  }
  const decorated = [
    "DecoratedBox(",
    `${indent(depth + (ellipse ? 3 : 2))}decoration: ${decoration},`,
    `${indent(depth + (ellipse ? 2 : 1))})`,
  ].join("\n");
  const content = ellipse
    ? ["ClipOval(", `${indent(depth + 2)}child: ${decorated},`, `${indent(depth + 1)})`].join("\n")
    : decorated;
  return [
    "SizedBox(",
    `${indent(depth + 1)}width: ${number(width)},`,
    `${indent(depth + 1)}height: ${number(height)},`,
    `${indent(depth + 1)}child: ${content},`,
    `${indent(depth)})`,
  ].join("\n");
}

function renderSvg(node: SvgNode, depth: number): string {
  return [
    "SvgPicture.asset(",
    `${indent(depth + 1)}'${escapeDart(node.assetPath)}',`,
    `${indent(depth + 1)}width: ${number(node.geometry.width)},`,
    `${indent(depth + 1)}height: ${number(node.geometry.height)},`,
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
  const border = style.border !== undefined && style.border.width > 0 ? style.border : undefined;
  const radius = style.radius !== undefined && [style.radius.topLeft, style.radius.topRight, style.radius.bottomRight, style.radius.bottomLeft].some((value) => value > 0) ? style.radius : undefined;
  const shadows = style.shadows !== undefined && style.shadows.length > 0 ? style.shadows : undefined;
  if (style.fill === undefined && style.gradient === undefined && style.image === undefined && border === undefined && radius === undefined && shadows === undefined) return undefined;
  const properties = [
    ...(style.fill === undefined ? [] : [`color: ${dartColor(style.fill.color, style.fill.opacity)}`]),
    ...(style.gradient === undefined ? [] : [`gradient: ${renderGradient(style.gradient, depth + 1)}`]),
    ...(style.image === undefined ? [] : [`image: DecorationImage(\n${indent(depth + 2)}image: AssetImage('${escapeDart(style.image.assetPath)}'),\n${indent(depth + 2)}fit: BoxFit.${style.image.keepAspectRatio ? "cover" : "fill"},\n${indent(depth + 1)})`]),
    ...(border === undefined ? [] : [`border: Border.all(color: ${dartColor(border.color, border.opacity)}, width: ${number(border.width)})`]),
    ...(radius === undefined ? [] : [`borderRadius: ${borderRadius(radius, depth + 2)}`]),
    ...(shadows === undefined ? [] : [`boxShadow: [\n${shadows.map((shadow) => `${indent(depth + 2)}${renderShadow(shadow, depth + 3)},`).join("\n")}\n${indent(depth + 1)}]`]),
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

function commentFor(node: IrNode, depth: number, rendered: string): string {
  return `${indent(depth)}// ${node.sourceName}\n${indent(depth)}${rendered}`;
}

function paddingIsZero(padding: EdgeInsets): boolean {
  return padding.top === 0 && padding.right === 0 && padding.bottom === 0 && padding.left === 0;
}

function edgeInsetsDirectional(padding: EdgeInsets): string {
  return `EdgeInsetsDirectional.only(top: ${number(padding.top)}, start: ${number(padding.left)}, end: ${number(padding.right)}, bottom: ${number(padding.bottom)})`;
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
