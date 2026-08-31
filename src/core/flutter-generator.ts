import type { BoardNode, GroupNode, IrNode, NodeStyle, TextNode } from "../shared/ir.js";

export function generateFlutterWidget(root: IrNode): string {
  const className = toPascalCase(root.name) || "GeneratedWidget";
  return [
    "import 'package:flutter/material.dart';",
    "",
    `class ${className} extends StatelessWidget {`,
    `  const ${className}({super.key});`,
    "",
    "  @override",
    "  Widget build(BuildContext context) {",
    `    return ${renderRoot(root, 2)};`,
    "  }",
    "}",
    "",
  ].join("\n");
}

function renderRoot(node: IrNode, depth: number): string {
  return renderNode(node, depth, false);
}

function renderNode(node: IrNode, depth: number, positioned: boolean): string {
  if (!node.visible || node.kind === "unsupported") {
    return "const SizedBox.shrink()";
  }

  const content = renderContent(node, positioned ? depth + 1 : depth);
  const withOpacity =
    node.style.opacity === 1
      ? content
      : `Opacity(\n${indent(depth + 1)}opacity: ${number(node.style.opacity)},\n${indent(depth + 1)}child: ${content},\n${indent(depth)})`;

  if (!positioned) {
    return withOpacity;
  }

  return [
    "Positioned(",
    `${indent(depth + 1)}left: ${number(node.geometry.x)},`,
    `${indent(depth + 1)}top: ${number(node.geometry.y)},`,
    `${indent(depth + 1)}child: ${withOpacity},`,
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
      return renderRectangle(node.style, node.geometry.width, node.geometry.height, depth);
    case "text":
      return renderText(node, depth);
  }
}

function renderContainer(node: BoardNode, depth: number, clipBehavior: string): string {
  const lines = [
    "Container(",
    `${indent(depth + 1)}width: ${number(node.geometry.width)},`,
    `${indent(depth + 1)}height: ${number(node.geometry.height)},`,
  ];
  const decoration = renderDecoration(node.style);
  if (decoration !== undefined) {
    lines.push(`${indent(depth + 1)}decoration: ${decoration},`);
  }
  lines.push(
    `${indent(depth + 1)}clipBehavior: ${clipBehavior},`,
    `${indent(depth + 1)}child: Stack(`,
    `${indent(depth + 2)}clipBehavior: ${clipBehavior},`,
    `${indent(depth + 2)}children: [`,
    ...node.children.map((child) => `${indent(depth + 3)}${renderNode(child, depth + 3, true)},`),
    `${indent(depth + 2)}],`,
    `${indent(depth + 1)}),`,
    `${indent(depth)})`,
  );
  return lines.join("\n");
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

function renderRectangle(style: NodeStyle, width: number, height: number, depth: number): string {
  const decoration = renderDecoration(style);
  const lines = [
    "SizedBox(",
    `${indent(depth + 1)}width: ${number(width)},`,
    `${indent(depth + 1)}height: ${number(height)},`,
  ];
  if (decoration !== undefined) {
    lines.push(`${indent(depth + 1)}child: DecoratedBox(decoration: ${decoration}),`);
  }
  lines.push(`${indent(depth)})`);
  return lines.join("\n");
}

function renderText(node: TextNode, depth: number): string {
  const style = node.textStyle;
  const textStyle = [
    ...(style.fontFamily === undefined ? [] : [`fontFamily: '${escapeDart(style.fontFamily)}'`]),
    ...(style.fontSize === undefined ? [] : [`fontSize: ${number(style.fontSize)}`]),
    ...(style.fontWeight === undefined ? [] : [`fontWeight: ${fontWeight(style.fontWeight)}`]),
    ...(style.lineHeight === undefined || style.fontSize === undefined
      ? []
      : [`height: ${number(style.lineHeight)}`]),
    ...(style.letterSpacing === undefined ? [] : [`letterSpacing: ${number(style.letterSpacing)}`]),
    ...(node.style.fill === undefined ? [] : [`color: ${dartColor(node.style.fill.color, node.style.fill.opacity)}`]),
  ];
  const lines = [
    "SizedBox(",
    `${indent(depth + 1)}width: ${number(node.geometry.width)},`,
    `${indent(depth + 1)}height: ${number(node.geometry.height)},`,
    `${indent(depth + 1)}child: Text(`,
    `${indent(depth + 2)}'${escapeDart(node.text)}',`,
    ...(style.align === undefined ? [] : [`${indent(depth + 2)}textAlign: TextAlign.${style.align},`]),
    ...(textStyle.length === 0
      ? []
      : [
          `${indent(depth + 2)}style: TextStyle(`,
          ...textStyle.map((property) => `${indent(depth + 3)}${property},`),
          `${indent(depth + 2)}),`,
        ]),
    `${indent(depth + 1)}),`,
    `${indent(depth)})`,
  ];
  return lines.join("\n");
}

function renderDecoration(style: NodeStyle): string | undefined {
  return style.fill === undefined
    ? undefined
    : `const BoxDecoration(color: ${dartColor(style.fill.color, style.fill.opacity)})`;
}

function dartColor(hex: string, opacity: number): string {
  const alpha = Math.round(Math.min(Math.max(opacity, 0), 1) * 255)
    .toString(16)
    .padStart(2, "0");
  return `Color(0x${alpha}${hex.slice(1)})`;
}

function fontWeight(value: number): string {
  const nearest = Math.min(900, Math.max(100, Math.round(value / 100) * 100));
  return `FontWeight.w${nearest}`;
}

function toPascalCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
    .replace(/^[^A-Za-z]+/, "");
}

function number(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function indent(depth: number): string {
  return "  ".repeat(depth);
}

function escapeDart(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
}
