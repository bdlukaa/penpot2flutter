import type { AssetManifestEntry, BoardNode, ColorFill, DropShadow, EdgeInsets, GeneratedFile, GradientFill, GridLayout, GroupNode, IrComponentDefinition, IrComponentInstanceNode, IrFontManifestEntry, IrNode, IrResponsiveScreen, IrTextTransform, IrToken, IrTokenSet, IrTokenTheme, IrTypographyStyle, IrVariantAxis, NodeStyle, SvgNode, TextNode, TextRun, TextStyle } from "../shared/ir.js";

let componentNames: ReadonlyMap<string, string> = new Map();
let declaredParameters: ReadonlySet<string> = new Set();
let tokenDefinitions: ReadonlyMap<string, IrToken> = new Map();
let typographyDefinitions: ReadonlyMap<string, IrTypographyStyle> = new Map();
let componentVariantEnums: ReadonlyMap<string, string> = new Map();

export function generatePubspecSnippet(assets: readonly AssetManifestEntry[], fonts: readonly IrFontManifestEntry[] = []): string {
  const fontFamilies = fonts.filter((font) => font.assets.length > 0);
  if (assets.length === 0 && fontFamilies.length === 0) return "";
  const hasSvg = assets.some((asset) => asset.mimeType === "image/svg+xml");
  return [
    ...(hasSvg ? ["dependencies:", "  flutter_svg: ^2.3.0", ""] : []),
    "flutter:",
    ...(assets.length === 0 ? [] : ["  assets:", ...assets.map((asset) => `    - ${asset.path}`)]),
    ...(fontFamilies.length === 0 ? [] : [
      "  fonts:",
      ...fontFamilies.flatMap((font) => [
        `    - family: ${font.family}`,
        "      fonts:",
        ...font.assets.map((asset) => [
          `        - asset: ${asset.path}`,
          `          weight: ${asset.weight}`,
          ...(asset.style === "italic" ? ["          style: italic"] : []),
        ].join("\n")),
      ]),
    ]),
    "",
  ].join("\n");
}

export function generateFlutterTokens(
  tokens: readonly IrToken[],
  sets: readonly IrTokenSet[] = [],
  themes: readonly IrTokenTheme[] = [],
): string {
  const byId = new Map(tokens.map((token) => [token.id, token]));
  const groups = new Map<string, IrToken[]>();
  for (const token of [...tokens].sort((a, b) => a.dartClass.localeCompare(b.dartClass) || a.dartName.localeCompare(b.dartName))) {
    if (tokenDartLiteral(token) === undefined) continue;
    const group = groups.get(token.dartClass) ?? [];
    group.push(token);
    groups.set(token.dartClass, group);
  }
  const lines = ["import 'package:flutter/material.dart';", ""];
  for (const [className, classTokens] of [...groups].sort(([left], [right]) => left.localeCompare(right))) {
    lines.push(`abstract final class ${className} {`);
    for (const token of classTokens) {
      lines.push(`  static const ${token.dartName} = ${tokenExpression(token, byId)};`);
    }
    lines.push("}", "");
  }
  const usedIds = new Set(tokens.map((token) => token.id));
  const relevantSets = sets.filter((set) => set.tokenIds.some((id) => usedIds.has(id)));
  if (relevantSets.length > 0) {
    lines.push("abstract final class AppTokenSets {");
    for (const set of relevantSets) {
      const members = set.tokenIds.filter((id) => usedIds.has(id)).map(stringLiteral).join(", ");
      lines.push(`  static const ${dartMemberName(set.name, "set")} = <String>[${members}];`);
    }
    lines.push("}", "");
  }
  const relevantSetIds = new Set(relevantSets.map((set) => set.id));
  const relevantThemes = themes.filter((theme) => theme.enabledSets.some((id) => relevantSetIds.has(id)));
  if (relevantThemes.length > 0) {
    lines.push("abstract final class AppTokenThemes {");
    for (const theme of relevantThemes) {
      const enabledSets = theme.enabledSets.filter((id) => relevantSetIds.has(id)).map(stringLiteral).join(", ");
      lines.push(`  static const ${dartMemberName(theme.name, "theme")} = <String>[${enabledSets}];`);
    }
    lines.push("}", "");
  }
  return lines.join("\n");
}

export function generateFlutterTypography(styles: readonly IrTypographyStyle[]): string {
  return [
    "import 'package:flutter/material.dart';",
    "",
    "abstract final class AppTextStyles {",
    ...[...styles].sort((left, right) => left.name.localeCompare(right.name)).map((style) => `  static const ${style.name} = ${standaloneTextStyle(style)};`),
    "}",
    "",
  ].join("\n");
}

export function generateFlutterWidget(
  root: IrNode,
  components: readonly IrComponentDefinition[] = [],
  tokens: readonly IrToken[] = [],
  responsiveScreen?: IrResponsiveScreen,
  typographyStyles: readonly IrTypographyStyle[] = [],
): string {
  componentNames = buildNameMap(components);
  componentVariantEnums = new Map(components.filter((component) => component.variant?.representation === "members").map((component) => [component.id, component.variant?.enumName ?? `${component.name}Variant`]));
  tokenDefinitions = new Map(tokens.map((token) => [token.id, token]));
  typographyDefinitions = new Map(typographyStyles.map((style) => [style.id, style]));
  declaredParameters = new Set();
  const roots = responsiveScreen?.variants.map((variant) => variant.root) ?? [root];
  const className = toPascalCase(responsiveScreen?.name ?? root.name) || "GeneratedWidget";
  return [
    ...(roots.some(containsRotation) ? ["import 'dart:math' as math;", ""] : []),
    "import 'package:flutter/material.dart';",
    ...(roots.some(containsSvg) ? ["import 'package:flutter_svg/flutter_svg.dart';"] : []),
    ...(roots.some(containsTokens) ? ["import '../app_tokens.dart';"] : []),
    ...(roots.some(containsTypography) ? ["import '../app_typography.dart';"] : []),
    ...componentImports(roots.flatMap((variantRoot) => [...collectInstanceComponentIds(variantRoot)]), components, "../components/"),
    "",
    `class ${className} extends StatelessWidget {`,
    `  const ${className}({super.key});`,
    "",
    "  @override",
    "  Widget build(BuildContext context) {",
    `    // ${responsiveScreen?.name ?? root.sourceName}`,
    ...(responsiveScreen === undefined
      ? [`    return ${renderNode(root, 2, false)};`]
      : renderResponsiveScreen(responsiveScreen)),
    "  }",
    "}",
    "",
  ].join("\n");
}

function renderResponsiveScreen(screen: IrResponsiveScreen): string[] {
  const variants = [...screen.variants].sort((left, right) => (left.minWidth ?? 0) - (right.minWidth ?? 0) || left.sourceBoardId.localeCompare(right.sourceBoardId));
  const lines = [
    "    return LayoutBuilder(",
    "      builder: (context, constraints) {",
  ];
  variants.forEach((variant, index) => {
    const upperBound = variant.maxWidth ?? variants[index + 1]?.minWidth;
    const conditional = index < variants.length - 1 && upperBound !== undefined;
    const rendered = renderResponsiveRoot(variant.root, conditional ? 5 : 4);
    if (conditional) {
      lines.push(`        if (constraints.maxWidth < ${number(upperBound)}) {`, `          // ${variant.sourceName}`, `          return ${rendered};`, "        }");
    } else {
      lines.push(`        // ${variant.sourceName}`, `        return ${rendered};`);
    }
  });
  lines.push("      },", "    );");
  return lines;
}

function renderResponsiveRoot(root: IrNode, depth: number): string {
  if (root.kind !== "board") return renderNode(root, depth, false);
  const clipBehavior = root.clipContent ? "Clip.hardEdge" : "Clip.none";
  const child = root.flex !== undefined
    ? renderFlex(root, depth, clipBehavior)
    : root.grid?.supported === true
      ? renderGrid(root, root.grid, root.children, depth)
      : renderStack(root.children, depth, clipBehavior);
  const decoration = renderDecoration(root, depth + 1);
  if (decoration === undefined) return child;
  return [
    "DecoratedBox(",
    `${indent(depth + 1)}decoration: ${decoration},`,
    `${indent(depth + 1)}child: ${root.clipContent ? `ClipRect(\n${indent(depth + 2)}child: ${child},\n${indent(depth + 1)})` : child},`,
    `${indent(depth)})`,
  ].join("\n");
}

export function generateComponentWidget(component: IrComponentDefinition, components: readonly IrComponentDefinition[], tokens: readonly IrToken[] = [], typographyStyles: readonly IrTypographyStyle[] = []): string {
  componentNames = buildNameMap(components);
  componentVariantEnums = new Map(components.filter((candidate) => candidate.variant?.representation === "members").map((candidate) => [candidate.id, candidate.variant?.enumName ?? `${candidate.name}Variant`]));
  tokenDefinitions = new Map(tokens.map((token) => [token.id, token]));
  typographyDefinitions = new Map(typographyStyles.map((style) => [style.id, style]));
  declaredParameters = new Set(component.parameters.map((parameter) => parameter.name));
  const axes = component.variant?.representation === "members" ? [] : component.variant?.axes ?? [];
  const lines = [
    ...(componentRoots(component).some(containsRotation) ? ["import 'dart:math' as math;", ""] : []),
    "import 'package:flutter/material.dart';",
    ...(componentRoots(component).some(containsSvg) ? ["import 'package:flutter_svg/flutter_svg.dart';"] : []),
    ...(componentRoots(component).some(containsTokens) ? ["import '../app_tokens.dart';"] : []),
    ...(componentRoots(component).some(containsTypography) ? ["import '../app_typography.dart';"] : []),
    ...componentImports(component.dependencies, components, ""),
    "",
    ...(component.variant?.representation === "members"
      ? [`enum ${component.variant.enumName ?? `${component.name}Variant`} {`, ...component.variant.members.map((member) => `  ${member.dartName ?? "member"},`), "}", ""]
      : axes.flatMap((axis) => [`enum ${axis.enumName} {`, ...axis.values.map((value) => `  ${value.name},`), "}", ""])),
    `class ${component.name} extends StatelessWidget {`,
  ];
  const parameters = component.parameters;
  const memberVariant = component.variant?.representation === "members" ? component.variant.enumName ?? `${component.name}Variant` : undefined;
  if (parameters.length === 0 && axes.length === 0 && memberVariant === undefined) {
    lines.push(`  const ${component.name}({super.key});`);
  } else {
    lines.push(`  const ${component.name}({`);
    lines.push("    super.key,");
    if (memberVariant !== undefined) lines.push(`    this.variant = ${memberVariant}.${component.variant!.members.find((member) => member.componentId === component.id)?.dartName ?? component.variant!.members[0]?.dartName ?? "member"},`);
    for (const axis of axes) lines.push(`    this.${axis.name} = ${axis.enumName}.${variantDefaultName(axis)},`);
    for (const parameter of parameters) {
      lines.push(`    this.${parameter.name}${parameter.type === "Color" ? "" : parameter.defaultValue === undefined ? "" : ` = ${stringLiteral(parameter.defaultValue)}`},`);
    }
    lines.push("  });");
    lines.push("");
    if (memberVariant !== undefined) lines.push(`  final ${memberVariant} variant;`);
    for (const axis of axes) lines.push(`  final ${axis.enumName} ${axis.name};`);
    for (const parameter of parameters) lines.push(`  final ${parameter.type === "Color" ? "Color?" : parameter.type} ${parameter.name};`);
  }
  lines.push("", "  @override", "  Widget build(BuildContext context) {", `    // ${component.sourceName}`, ...renderVariantComponentBody(component), "  }", "}", "");
  return lines.join("\n");
}

function componentRoots(component: IrComponentDefinition): readonly IrNode[] {
  return component.variant === undefined ? [component.root] : component.variant.members.map((member) => member.root);
}

function variantDefaultName(axis: IrVariantAxis): string {
  return axis.values.find((value) => value.sourceValue === axis.defaultValue)?.name ?? axis.values[0]?.name ?? "value";
}

function renderVariantComponentBody(component: IrComponentDefinition): string[] {
  const variant = component.variant;
  if (variant === undefined || variant.members.length === 0) {
    return [`    return ${renderNode(component.root, 2, false)};`];
  }
  if (variant.representation === "members") {
    const selector = "variant";
    const enumName = variant.enumName ?? `${component.name}Variant`;
    const lines = [`    return switch (${selector}) {`];
    for (const member of variant.members) lines.push(`      ${enumName}.${member.dartName ?? "member"} => ${renderNode(member.root, 3, false)},`);
    lines.push("    };");
    return lines;
  }
  if (variant.axes.length === 0) return [`    return ${renderNode(component.root, 2, false)};`];
  const selector = variant.axes.length === 1 ? variant.axes[0].name : `(${variant.axes.map((axis) => axis.name).join(", ")})`;
  const lines = [`    return switch (${selector}) {`];
  for (const member of variant.members) {
    const pattern = variant.axes.length === 1
      ? `${member.values[0].enumName}.${member.values[0].valueName}`
      : `(${member.values.map((value) => `${value.enumName}.${value.valueName}`).join(", ")})`;
    lines.push(`      ${pattern} => ${renderNode(member.root, 3, false)},`);
  }
  lines.push(`      _ => throw ArgumentError('Unsupported ${escapeDart(component.name)} variant combination'),`, "    };");
  return lines;
}

export function generateFlutterFiles(
  root: IrNode,
  components: readonly IrComponentDefinition[],
  tokens: readonly IrToken[] = [],
  tokenSets: readonly IrTokenSet[] = [],
  tokenThemes: readonly IrTokenTheme[] = [],
  responsiveScreen?: IrResponsiveScreen,
  typographyStyles: readonly IrTypographyStyle[] = [],
): GeneratedFile[] {
  const screenName = toPascalCase(responsiveScreen?.name ?? root.name) || "GeneratedScreen";
  const responsiveRoots = responsiveScreen?.variants.map((variant) => variant.root) ?? [];
  const usedTokens = reachableTokens([root, ...responsiveRoots], components, tokens);
  const files: GeneratedFile[] = [{ path: `screens/${snakeCase(screenName)}.dart`, source: generateFlutterWidget(root, components, usedTokens, responsiveScreen, typographyStyles) }];
  for (const component of components) {
    files.push({ path: `components/${snakeCase(component.name)}.dart`, source: generateComponentWidget(component, components, usedTokens, typographyStyles) });
  }
  if (usedTokens.length > 0) files.push({ path: "app_tokens.dart", source: generateFlutterTokens(usedTokens, tokenSets, tokenThemes) });
  if (typographyStyles.length > 0) files.push({ path: "app_typography.dart", source: generateFlutterTypography(typographyStyles) });
  if (components.length > 0 || usedTokens.length > 0 || typographyStyles.length > 0) {
    files.push({ path: "penpot_ui.dart", source: generateBarrelExport(components, snakeCase(screenName), usedTokens.length > 0, typographyStyles.length > 0) });
  }
  return files;
}

function generateBarrelExport(components: readonly IrComponentDefinition[], screenFileName: string, hasTokens: boolean, hasTypography: boolean): string {
  return [
    `export 'screens/${screenFileName}.dart';`,
    ...(hasTokens ? ["export 'app_tokens.dart';"] : []),
    ...(hasTypography ? ["export 'app_typography.dart';"] : []),
    ...components.map((component) => `export 'components/${snakeCase(component.name)}.dart';`),
    "",
  ].join("\n");
}

function buildNameMap(components: readonly IrComponentDefinition[]): ReadonlyMap<string, string> {
  return new Map(components.map((component) => [component.id, component.name]));
}

function componentImports(componentIds: Iterable<string>, components: readonly IrComponentDefinition[], prefix: string): string[] {
  return [...new Set(componentIds)]
    .map((id) => components.find((component) => component.id === id))
    .filter((component): component is IrComponentDefinition => component !== undefined)
    .map((component) => `import '${prefix}${snakeCase(component.name)}.dart';`)
    .sort();
}

function collectInstanceComponentIds(node: IrNode): Set<string> {
  const ids = new Set<string>();
  const walk = (current: IrNode): void => {
    if (current.kind === "component-instance") {
      ids.add(current.componentId);
      return;
    }
    if ("children" in current) current.children.forEach(walk);
  };
  walk(node);
  return ids;
}

function stringLiteral(value: string): string {
  return `'${escapeDart(value)}'`;
}

function snakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function containsRotation(node: IrNode): boolean {
  return (node.transform?.rotation ?? 0) !== 0 || ("children" in node && node.children.some(containsRotation));
}

function containsSvg(node: IrNode): boolean {
  return node.kind === "svg" || ("children" in node && node.children.some(containsSvg));
}

function containsTokens(node: IrNode): boolean {
  return (node.tokenReferences?.length ?? 0) > 0 || ("children" in node && node.children.some(containsTokens));
}

function containsTypography(node: IrNode): boolean {
  if (node.kind === "text") {
    if (node.typographyStyleId !== undefined && typographyDefinitions.has(node.typographyStyleId)) return true;
    if (node.runs?.some(runContainsTypography) === true) return true;
  }
  return "children" in node && node.children.some(containsTypography);
}

function runContainsTypography(run: TextRun): boolean {
  return (run.typographyStyleId !== undefined && typographyDefinitions.has(run.typographyStyleId)) || run.children?.some(runContainsTypography) === true;
}

function renderNode(node: IrNode, depth: number, positioned: boolean): string {
  if (!node.visible || node.kind === "unsupported") return "const SizedBox.shrink()";

  const contentDepth = positioned ? depth + 1 : depth;
  const transformDepth = transformWrapperCount(node);
  const opacityDepth = node.style.opacity === 1 && !hasToken(node, "opacity") ? 0 : 1;
  const constraintsDepth = constraintWrapperCount(node);
  let content = renderContent(node, contentDepth + transformDepth + opacityDepth + constraintsDepth);
  if (constraintsDepth > 0) content = renderConstraints(node, content, contentDepth + transformDepth + opacityDepth);
  if (node.transform !== undefined) content = renderTransform(node, content, contentDepth + opacityDepth);
  if (node.style.opacity !== 1 || hasToken(node, "opacity")) {
    content = [
      "Opacity(",
      `${indent(contentDepth + 1)}opacity: ${tokenValue(node, "opacity", number(node.style.opacity))},`,
      `${indent(contentDepth + 1)}child: ${content},`,
      `${indent(contentDepth)})`,
    ].join("\n");
  }
  if (!positioned) return content;
  return [
    "Positioned(",
    `${indent(depth + 1)}left: ${tokenValue(node, "x", number(node.geometry.x))},`,
    `${indent(depth + 1)}top: ${tokenValue(node, "y", number(node.geometry.y))},`,
    `${indent(depth + 1)}child: ${content},`,
    `${indent(depth)})`,
  ].join("\n");
}

function constraintWrapperCount(node: Exclude<IrNode, { kind: "unsupported" }>): number {
  const layout = node.layoutChild;
  if (layout === undefined) return 0;
  const hasBox = layout.minWidth !== undefined || layout.maxWidth !== undefined || layout.minHeight !== undefined || layout.maxHeight !== undefined;
  return Number(hasBox) + Number(layout.aspectRatio !== undefined);
}

function renderConstraints(node: Exclude<IrNode, { kind: "unsupported" }>, child: string, depth: number): string {
  const layout = node.layoutChild;
  if (layout === undefined) return child;
  let constrained = child;
  let innerDepth = depth + Number(layout.minWidth !== undefined || layout.maxWidth !== undefined || layout.minHeight !== undefined || layout.maxHeight !== undefined);
  if (layout.aspectRatio !== undefined) {
    constrained = [
      "AspectRatio(",
      `${indent(innerDepth + 1)}aspectRatio: ${tokenValue(node, "aspectRatio", number(layout.aspectRatio))},`,
      `${indent(innerDepth + 1)}child: ${constrained},`,
      `${indent(innerDepth)})`,
    ].join("\n");
  }
  const properties = [
    ...(layout.minWidth === undefined ? [] : [`minWidth: ${tokenValue(node, "minWidth", number(layout.minWidth))}`]),
    ...(layout.maxWidth === undefined ? [] : [`maxWidth: ${tokenValue(node, "maxWidth", number(layout.maxWidth))}`]),
    ...(layout.minHeight === undefined ? [] : [`minHeight: ${tokenValue(node, "minHeight", number(layout.minHeight))}`]),
    ...(layout.maxHeight === undefined ? [] : [`maxHeight: ${tokenValue(node, "maxHeight", number(layout.maxHeight))}`]),
  ];
  if (properties.length === 0) return constrained;
  return [
    "ConstrainedBox(",
    `${indent(depth + 1)}constraints: BoxConstraints(${properties.join(", ")}),`,
    `${indent(depth + 1)}child: ${constrained},`,
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
      return renderShape(node, depth, false);
    case "svg":
      return renderSvg(node, depth);
    case "component-instance":
      return renderComponentInstance(node, depth);
    case "ellipse":
      return renderShape(node, depth, true);
    case "text":
      return renderText(node, depth);
  }
}

function renderContainer(node: BoardNode, depth: number, clipBehavior: string): string {
  const decoration = renderDecoration(node, depth + 1);
  const child = node.flex !== undefined ? renderFlex(node, depth + 1, clipBehavior) : node.grid?.supported === true ? renderGrid(node, node.grid, node.children, depth + 1) : renderStack(node.children, depth + 1, clipBehavior);
  if (decoration === undefined) {
    return [
      "SizedBox(",
      `${indent(depth + 1)}width: ${tokenValue(node, "width", number(node.geometry.width))},`,
      `${indent(depth + 1)}height: ${tokenValue(node, "height", number(node.geometry.height))},`,
      `${indent(depth + 1)}child: ${child},`,
      `${indent(depth)})`,
    ].join("\n");
  }
  return [
    "Container(",
    `${indent(depth + 1)}width: ${tokenValue(node, "width", number(node.geometry.width))},`,
    `${indent(depth + 1)}height: ${tokenValue(node, "height", number(node.geometry.height))},`,
    `${indent(depth + 1)}decoration: ${decoration},`,
    ...(clipBehavior === "Clip.hardEdge" ? [`${indent(depth + 1)}clipBehavior: ${clipBehavior},`] : []),
    `${indent(depth + 1)}child: ${child},`,
    `${indent(depth)})`,
  ].join("\n");
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

function renderGrid(node: BoardNode, grid: GridLayout, children: readonly IrNode[], depth: number): string {
  return [
    "GridView.count(",
    `${indent(depth + 1)}crossAxisCount: ${grid.columns.length},`,
    ...(grid.rowGap === 0 && !hasToken(node, "rowGap") ? [] : [`${indent(depth + 1)}mainAxisSpacing: ${tokenValue(node, "rowGap", number(grid.rowGap))},`]),
    ...(grid.columnGap === 0 && !hasToken(node, "columnGap") ? [] : [`${indent(depth + 1)}crossAxisSpacing: ${tokenValue(node, "columnGap", number(grid.columnGap))},`]),
    ...(paddingIsZero(grid.padding) && !hasPaddingToken(node) ? [] : [`${indent(depth + 1)}padding: ${edgeInsetsDirectional(grid.padding, node)},`]),
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
    ...(gap === 0 && !hasToken(node, isRow ? "columnGap" : "rowGap") ? [] : [`${indent(depth + 1)}spacing: ${tokenValue(node, isRow ? "columnGap" : "rowGap", number(gap))},`]),
    ...(main === "start" ? [] : [`${indent(depth + 1)}mainAxisAlignment: MainAxisAlignment.${main},`]),
    ...(cross === "center" ? [] : [`${indent(depth + 1)}crossAxisAlignment: CrossAxisAlignment.${cross},`]),
    `${indent(depth + 1)}children: [`,
    ...children.map((child) => `${commentFor(child, depth + 2, renderFlexChild(child, depth + 2, isRow))},`),
    `${indent(depth + 1)}],`,
    `${indent(depth)})`,
  ];
  if (paddingIsZero(flex.padding) && !hasPaddingToken(node)) return flow.join("\n");
  return [
    "Padding(",
    `${indent(depth + 1)}padding: ${edgeInsetsDirectional(flex.padding, node)},`,
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
    `${indent(depth + 1)}width: ${tokenValue(node, "width", number(node.geometry.width))},`,
    `${indent(depth + 1)}height: ${tokenValue(node, "height", number(node.geometry.height))},`,
    `${indent(depth + 1)}child: Stack(`,
    `${indent(depth + 2)}children: [`,
    ...node.children.map((child) => `${commentFor(child, depth + 3, renderNode(child, depth + 3, true))},`),
    `${indent(depth + 2)}],`,
    `${indent(depth + 1)}),`,
    `${indent(depth)})`,
  ].join("\n");
}

function renderShape(node: IrNode, depth: number, ellipse: boolean): string {
  const width = node.geometry.width;
  const height = node.geometry.height;
  const circle = ellipse && width === height;
  const clipDepth = ellipse && !circle ? 1 : 0;
  const decoration = renderDecoration(node, depth + 2 + clipDepth, circle);
  if (decoration === undefined) {
    return `SizedBox(width: ${tokenValue(node, "width", number(width))}, height: ${tokenValue(node, "height", number(height))})`;
  }
  const decorated = [
    "DecoratedBox(",
    `${indent(depth + 2 + clipDepth)}decoration: ${decoration},`,
    `${indent(depth + 1 + clipDepth)})`,
  ].join("\n");
  const content = ellipse && !circle
    ? ["ClipOval(", `${indent(depth + 2)}child: ${decorated},`, `${indent(depth + 1)})`].join("\n")
    : decorated;
  return [
    "SizedBox(",
    `${indent(depth + 1)}width: ${tokenValue(node, "width", number(width))},`,
    `${indent(depth + 1)}height: ${tokenValue(node, "height", number(height))},`,
    `${indent(depth + 1)}child: ${content},`,
    `${indent(depth)})`,
  ].join("\n");
}

function variantEnumNameFor(componentId: string): string {
  return componentVariantEnums.get(componentId) ?? "Variant";
}

function renderComponentInstance(node: IrComponentInstanceNode, depth: number): string {
  const name = componentNames.get(node.componentId);
  if (name === undefined) return "const SizedBox.shrink()";
  const variantArguments = node.variantMemberName === undefined
    ? (node.variantValues ?? []).map((selection) => `${selection.axisName}: ${selection.enumName}.${selection.valueName},`)
    : [`variant: ${variantEnumNameFor(node.componentId)}.${node.variantMemberName},`];
  const overrideArguments = node.arguments.map((argument) => `${argument.name}: ${argument.type === "Color" ? dartColor(argument.value, 1) : `'${escapeDart(argument.value)}'`},`);
  const argumentsList = [...variantArguments, ...overrideArguments];
  if (argumentsList.length === 0) return `${name}()`;
  return [
    `${name}(`,
    ...argumentsList.map((argument) => `${indent(depth + 1)}${argument}`),
    `${indent(depth)})`,
  ].join("\n");
}

function renderSvg(node: SvgNode, depth: number): string {
  return [
    "SvgPicture.asset(",
    `${indent(depth + 1)}'${escapeDart(node.assetPath)}',`,
    `${indent(depth + 1)}width: ${tokenValue(node, "width", number(node.geometry.width))},`,
    `${indent(depth + 1)}height: ${tokenValue(node, "height", number(node.geometry.height))},`,
    `${indent(depth)})`,
  ].join("\n");
}

function renderText(node: TextNode, depth: number): string {
  if (node.runs !== undefined) return renderRichText(node, depth);
  const style = node.textStyle;
  const parameterText = node.parameterName !== undefined && declaredParameters.has(node.parameterName) ? `this.${node.parameterName}` : undefined;
  const text = transformedText(parameterText ?? stringLiteral(transformedLiteral(node.text, node.textTransform)), node.textTransform, parameterText !== undefined);
  const nestedText = node.verticalAlign !== undefined && node.verticalAlign !== "top";
  const textDepth = nestedText ? depth + 1 : depth;
  const textStyle = renderTextStyle(style, node.style.fill, textDepth + 2, node, node.typographyStyleId);
  const textWidget = [
    "Text(",
    `${indent(textDepth + 2)}${text},`,
    ...(style.align === undefined ? [] : [`${indent(textDepth + 2)}textAlign: TextAlign.${style.align},`]),
    ...(node.maxLines === undefined ? [] : [`${indent(textDepth + 2)}maxLines: ${node.maxLines},`]),
    ...(node.overflow === undefined ? [] : [`${indent(textDepth + 2)}overflow: TextOverflow.${node.overflow},`]),
    ...(node.softWrap === undefined ? [] : [`${indent(textDepth + 2)}softWrap: ${node.softWrap},`]),
    ...(textStyle === undefined ? [] : [`${indent(textDepth + 2)}style: ${textStyle},`]),
    `${indent(textDepth + 1)})`,
  ].join("\n");
  const aligned = node.verticalAlign === undefined || node.verticalAlign === "top" ? textWidget : [
    "Align(",
    `${indent(depth + 2)}alignment: Alignment.${verticalTextAlignment(node.verticalAlign, style.align)},`,
    `${indent(depth + 2)}child: ${textWidget},`,
    `${indent(depth + 1)})`,
  ].join("\n");
  return [
    "SizedBox(",
    `${indent(depth + 1)}width: ${tokenValue(node, "width", number(node.geometry.width))},`,
    `${indent(depth + 1)}height: ${tokenValue(node, "height", number(node.geometry.height))},`,
    `${indent(depth + 1)}child: ${aligned},`,
    `${indent(depth)})`,
  ].join("\n");
}

function renderRichText(node: TextNode, depth: number): string {
  const nestedRichText = node.verticalAlign !== undefined && node.verticalAlign !== "top";
  const richDepth = nestedRichText ? depth + 1 : depth;
  const richText = [
    "RichText(",
    ...(node.textStyle.align === undefined ? [] : [`${indent(richDepth + 2)}textAlign: TextAlign.${node.textStyle.align},`]),
    ...(node.maxLines === undefined ? [] : [`${indent(richDepth + 2)}maxLines: ${node.maxLines},`]),
    ...(node.overflow === undefined ? [] : [`${indent(richDepth + 2)}overflow: TextOverflow.${node.overflow},`]),
    ...(node.softWrap === undefined ? [] : [`${indent(richDepth + 2)}softWrap: ${node.softWrap},`]),
    `${indent(richDepth + 2)}text: TextSpan(`,
    `${indent(richDepth + 3)}children: [`,
    ...(node.runs ?? []).map((run) => `${indent(richDepth + 4)}${renderTextSpan(run, richDepth + 4)},`),
    `${indent(richDepth + 3)}],`,
    `${indent(richDepth + 2)}),`,
    `${indent(richDepth + 1)})`,
  ].join("\n");
  const aligned = node.verticalAlign === undefined || node.verticalAlign === "top" ? richText : [
    "Align(",
    `${indent(depth + 2)}alignment: Alignment.${verticalTextAlignment(node.verticalAlign, node.textStyle.align)},`,
    `${indent(depth + 2)}child: ${richText},`,
    `${indent(depth + 1)})`,
  ].join("\n");
  return [
    "SizedBox(",
    `${indent(depth + 1)}width: ${tokenValue(node, "width", number(node.geometry.width))},`,
    `${indent(depth + 1)}height: ${tokenValue(node, "height", number(node.geometry.height))},`,
    `${indent(depth + 1)}child: ${aligned},`,
    `${indent(depth)})`,
  ].join("\n");
}

function renderTextSpan(run: TextRun, depth: number): string {
  const style = renderTextStyle(run.style, undefined, depth + 1, undefined, run.typographyStyleId);
  return [
    "TextSpan(",
    ...(style === undefined ? [] : [`${indent(depth + 1)}style: ${style},`]),
    ...(run.text === "" ? [] : [`${indent(depth + 1)}text: ${stringLiteral(transformedLiteral(run.text, run.textTransform))},`]),
    ...(run.children == null || run.children.length === 0 ? [] : [
      `${indent(depth + 1)}children: [`,
      ...run.children.map((child) => `${indent(depth + 2)}${renderTextSpan(child, depth + 2)},`),
      `${indent(depth + 1)}],`,
    ]),
    `${indent(depth)})`,
  ].join("\n");
}

function renderTextStyle(style: TextStyle, fillColor: ColorFill | undefined, styleDepth: number, node?: IrNode, typographyStyleId?: string): string | undefined {
  if (node !== undefined && hasToken(node, "typography")) return tokenValue(node, "typography", "const TextStyle()");
  const reusable = typographyStyleId === undefined ? undefined : typographyDefinitions.get(typographyStyleId);
  if (reusable !== undefined) return `AppTextStyles.${reusable.name}`;
  const properties = [
    ...(style.fontFamily === undefined ? [] : [`fontFamily: ${tokenValue(node, "fontFamily", stringLiteral(style.fontFamily))}`]),
    ...(style.fallbackFamilies === undefined || style.fallbackFamilies.length === 0 ? [] : [`fontFamilyFallback: const [${style.fallbackFamilies.map(stringLiteral).join(", ")}]`]),
    ...(style.fontSize === undefined ? [] : [`fontSize: ${tokenValue(node, "fontSize", number(style.fontSize))}`]),
    ...(style.fontWeight === undefined ? [] : [`fontWeight: ${tokenValue(node, "fontWeight", fontWeight(style.fontWeight))}`]),
    ...(style.fontStyle === "italic" ? ["fontStyle: FontStyle.italic"] : style.fontStyle === "normal" ? ["fontStyle: FontStyle.normal"] : []),
    ...(style.lineHeight === undefined || style.fontSize === undefined ? [] : [`height: ${tokenValue(node, "lineHeight", number(style.lineHeight))}`]),
    ...(style.letterSpacing === undefined ? [] : [`letterSpacing: ${tokenValue(node, "letterSpacing", number(style.letterSpacing))}`]),
    ...(style.decoration === "underline" ? ["decoration: TextDecoration.underline"] : style.decoration === "line-through" ? ["decoration: TextDecoration.lineThrough"] : []),
    ...(style.color !== undefined ? [`color: ${tokenValue(node, "textColor", dartColor(style.color.color, style.color.opacity))}`] : fillColor === undefined ? [] : [`color: ${tokenValue(node, "textColor", dartColor(fillColor.color, fillColor.opacity))}`]),
  ];
  return properties.length === 0 ? undefined : [`TextStyle(`, ...properties.map((property) => `${indent(styleDepth + 1)}${property},`), `${indent(styleDepth)})`].join("\n");
}

function renderDecoration(node: IrNode, depth: number, circle = false): string | undefined {
  const style = node.style;
  const border = style.border !== undefined && (style.border.width > 0 || hasToken(node, "strokeWidth")) ? style.border : undefined;
  const radius = !circle && style.radius !== undefined && [style.radius.topLeft, style.radius.topRight, style.radius.bottomRight, style.radius.bottomLeft].some((value) => value > 0) ? style.radius : undefined;
  const shadows = style.shadows !== undefined && style.shadows.length > 0 ? style.shadows : undefined;
  if (style.fill === undefined && style.gradient === undefined && style.image === undefined && border === undefined && radius === undefined && shadows === undefined) return undefined;
  const properties = [
    ...(circle ? ["shape: BoxShape.circle"] : []),
    ...(style.fill === undefined ? [] : [`color: ${node.fillParameterName === undefined || !declaredParameters.has(node.fillParameterName) ? tokenValue(node, "fill", dartColor(style.fill.color, style.fill.opacity)) : `this.${node.fillParameterName} ?? ${tokenValue(node, "fill", dartColor(style.fill.color, style.fill.opacity))}`}`]),
    ...(style.gradient === undefined ? [] : [`gradient: ${tokenValue(node, "gradient", renderGradient(style.gradient, depth + 1))}`]),
    ...(style.image === undefined ? [] : [`image: DecorationImage(\n${indent(depth + 2)}image: AssetImage('${escapeDart(style.image.assetPath)}'),\n${indent(depth + 2)}fit: BoxFit.${style.image.keepAspectRatio ? "cover" : "fill"},\n${indent(depth + 1)})`]),
    ...(border === undefined ? [] : [`border: Border.all(color: ${tokenValue(node, "strokeColor", dartColor(border.color, border.opacity))}, width: ${tokenValue(node, "strokeWidth", number(border.width))})`]),
    ...(radius === undefined ? [] : [`borderRadius: ${borderRadius(radius, depth + 2, node)}`]),
    ...(shadows === undefined ? [] : [`boxShadow: ${tokenValue(node, "shadow", `[\n${shadows.map((shadow) => `${indent(depth + 2)}${renderShadow(shadow, depth + 3)},`).join("\n")}\n${indent(depth + 1)}]`)}`]),
  ];
  const hasRuntimeValue = node.fillParameterName !== undefined && declaredParameters.has(node.fillParameterName);
  return properties.length === 1 && !properties[0].includes("\n") && !hasRuntimeValue
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

function borderRadius(radius: NonNullable<NodeStyle["radius"]>, depth: number, node: IrNode): string {
  const values = [radius.topLeft, radius.topRight, radius.bottomRight, radius.bottomLeft];
  if (values.every((value) => value === values[0]) || hasToken(node, "borderRadius")) {
    return `BorderRadius.circular(${tokenValue(node, "borderRadius", number(values[0]))})`;
  }
  return [
    "BorderRadius.only(",
    `${indent(depth)}topLeft: Radius.circular(${tokenValue(node, "borderRadiusTopLeft", number(radius.topLeft))}),`,
    `${indent(depth)}topRight: Radius.circular(${tokenValue(node, "borderRadiusTopRight", number(radius.topRight))}),`,
    `${indent(depth)}bottomRight: Radius.circular(${tokenValue(node, "borderRadiusBottomRight", number(radius.bottomRight))}),`,
    `${indent(depth)}bottomLeft: Radius.circular(${tokenValue(node, "borderRadiusBottomLeft", number(radius.bottomLeft))}),`,
    `${indent(depth - 1)})`,
  ].join("\n");
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

function edgeInsetsDirectional(padding: EdgeInsets, node: IrNode): string {
  return `EdgeInsetsDirectional.only(top: ${tokenValue(node, "paddingTop", number(padding.top))}, start: ${tokenValue(node, "paddingLeft", number(padding.left))}, end: ${tokenValue(node, "paddingRight", number(padding.right))}, bottom: ${tokenValue(node, "paddingBottom", number(padding.bottom))})`;
}

function hasPaddingToken(node: IrNode): boolean {
  return ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"].some((property) => hasToken(node, property));
}

function hasToken(node: IrNode | undefined, property: string): boolean {
  return node?.tokenReferences?.some((reference) => reference.property === property && tokenDefinitions.has(reference.tokenId)) === true;
}

function tokenValue(node: IrNode | undefined, property: string, fallback: string): string {
  const reference = node?.tokenReferences?.find((candidate) => candidate.property === property);
  if (reference === undefined) return fallback;
  const token = tokenDefinitions.get(reference.tokenId);
  return token === undefined || tokenDartLiteral(token) === undefined ? fallback : `${token.dartClass}.${token.dartName}`;
}

function dartColor(hex: string, opacity: number): string {
  const alpha = Math.round(Math.min(Math.max(opacity, 0), 1) * 255).toString(16).padStart(2, "0");
  return `Color(0x${alpha}${hex.slice(1)})`;
}

function reachableTokens(roots: readonly IrNode[], components: readonly IrComponentDefinition[], tokens: readonly IrToken[]): readonly IrToken[] {
  const byId = new Map(tokens.map((token) => [token.id, token]));
  const ids = new Set<string>();
  const collect = (node: IrNode): void => {
    for (const reference of node.tokenReferences ?? []) ids.add(reference.tokenId);
    if ("children" in node) node.children.forEach(collect);
  };
  roots.forEach(collect);
  for (const component of components) componentRoots(component).forEach(collect);
  const includeAliasTargets = (id: string): void => {
    const target = byId.get(id)?.aliasTargetId;
    if (target === undefined || ids.has(target)) return;
    ids.add(target);
    includeAliasTargets(target);
  };
  for (const id of [...ids]) includeAliasTargets(id);
  return tokens.filter((token) => ids.has(token.id));
}

function standaloneTextStyle(style: IrTypographyStyle): string {
  const properties = [
    ...(style.fontFamily === undefined ? [] : [`fontFamily: ${stringLiteral(style.fontFamily)}`]),
    ...(style.fallbackFamilies === undefined || style.fallbackFamilies.length === 0 ? [] : [`fontFamilyFallback: const [${style.fallbackFamilies.map(stringLiteral).join(", ")}]`]),
    ...(style.fontSize === undefined ? [] : [`fontSize: ${number(style.fontSize)}`]),
    ...(style.fontWeight === undefined ? [] : [`fontWeight: ${fontWeight(style.fontWeight)}`]),
    ...(style.fontStyle === "italic" ? ["fontStyle: FontStyle.italic"] : []),
    ...(style.lineHeight === undefined ? [] : [`height: ${number(style.lineHeight)}`]),
    ...(style.letterSpacing === undefined ? [] : [`letterSpacing: ${number(style.letterSpacing)}`]),
    ...(style.decoration === "underline" ? ["decoration: TextDecoration.underline"] : style.decoration === "line-through" ? ["decoration: TextDecoration.lineThrough"] : []),
    ...(style.color === undefined ? [] : [`color: ${dartColor(style.color.color, style.color.opacity)}`]),
  ];
  return ["TextStyle(", ...properties.map((property) => `    ${property},`), "  )"].join("\n");
}

function transformedLiteral(value: string, transform: IrTextTransform | undefined): string {
  switch (transform) {
    case "uppercase": return value.toUpperCase();
    case "lowercase": return value.toLowerCase();
    case "capitalize": return value.replace(/(^|\\s)(\\S)/g, (_, prefix: string, character: string) => `${prefix}${character.toUpperCase()}`);
    default: return value;
  }
}

function transformedText(expression: string, transform: IrTextTransform | undefined, dynamic: boolean): string {
  if (!dynamic || transform === undefined) return expression;
  if (transform === "uppercase") return `${expression}.toUpperCase()`;
  if (transform === "lowercase") return `${expression}.toLowerCase()`;
  return `${expression}.replaceAllMapped(RegExp(r'\\b\\w'), (match) => match[0]!.toUpperCase())`;
}

function verticalTextAlignment(vertical: "center" | "bottom", horizontal: TextStyle["align"]): string {
  const prefix = vertical === "center" ? "center" : "bottom";
  const suffix = horizontal === "right" ? "Right" : horizontal === "center" ? "Center" : "Left";
  return `${prefix}${suffix}`;
}

function tokenExpression(token: IrToken, tokens: ReadonlyMap<string, IrToken>): string {
  const target = token.aliasTargetId === undefined ? undefined : tokens.get(token.aliasTargetId);
  if (target !== undefined && compatibleTokenTypes(token, target) && !aliasCycleFrom(token.id, tokens)) {
    return `${target.dartClass}.${target.dartName}`;
  }
  return tokenDartLiteral(token) ?? "0.0";
}

function aliasCycleFrom(id: string, tokens: ReadonlyMap<string, IrToken>): boolean {
  const visited = new Set<string>();
  let current: string | undefined = id;
  while (current !== undefined) {
    if (visited.has(current)) return true;
    visited.add(current);
    current = tokens.get(current)?.aliasTargetId;
  }
  return false;
}

function compatibleTokenTypes(left: IrToken, right: IrToken): boolean {
  return tokenRuntimeType(left) === tokenRuntimeType(right);
}

function tokenRuntimeType(token: IrToken): string {
  switch (token.type) {
    case "color": return "Color";
    case "font-family": return "String";
    case "font-weight": return "FontWeight";
    case "typography": return "TextStyle";
    case "shadow": return "List<BoxShadow>";
    case "gradient": return "Gradient";
    case "duration": return "Duration";
    default: return "double";
  }
}

function tokenDartLiteral(token: IrToken): string | undefined {
  switch (token.type) {
    case "color": return typeof token.value === "string" ? tokenColor(token.value) : undefined;
    case "font-family": return typeof token.value === "string" ? stringLiteral(token.value) : undefined;
    case "font-weight": return typeof token.value === "number" && Number.isFinite(token.value) ? fontWeight(token.value) : undefined;
    case "typography": return typographyTokenLiteral(token.value);
    case "shadow": return Array.isArray(token.value) ? shadowTokenLiteral(token.value as readonly DropShadow[]) : undefined;
    case "gradient": return isGradientTokenValue(token.value) ? renderGradient(token.value, 0) : undefined;
    case "duration": return typeof token.value === "number" && Number.isFinite(token.value) ? `Duration(milliseconds: ${number(token.value)})` : undefined;
    case "unknown": return undefined;
    default: return typeof token.value === "number" && Number.isFinite(token.value) ? doubleLiteral(token.value) : undefined;
  }
}

function tokenColor(value: string): string | undefined {
  const normalized = value.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(normalized)) return `Color(0xff${normalized.toLowerCase()})`;
  if (/^[0-9a-fA-F]{8}$/.test(normalized)) return `Color(0x${normalized.toLowerCase()})`;
  return undefined;
}

function typographyTokenLiteral(value: IrToken["value"]): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value) || isGradientTokenValue(value)) return undefined;
  const typography = value as { fontFamily?: string; fontSize?: number; fontWeight?: number; lineHeight?: number; letterSpacing?: number; color?: string };
  const properties = [
    ...(typeof typography.fontFamily === "string" ? [`fontFamily: ${stringLiteral(typography.fontFamily)}`] : []),
    ...(typeof typography.fontSize === "number" ? [`fontSize: ${number(typography.fontSize)}`] : []),
    ...(typeof typography.fontWeight === "number" ? [`fontWeight: ${fontWeight(typography.fontWeight)}`] : []),
    ...(typeof typography.lineHeight === "number" ? [`height: ${number(typography.lineHeight)}`] : []),
    ...(typeof typography.letterSpacing === "number" ? [`letterSpacing: ${number(typography.letterSpacing)}`] : []),
    ...(typeof typography.color === "string" && tokenColor(typography.color) !== undefined ? [`color: ${tokenColor(typography.color)}`] : []),
  ];
  return `TextStyle(${properties.join(", ")})`;
}

function shadowTokenLiteral(shadows: readonly DropShadow[]): string {
  return `<BoxShadow>[${shadows.map((shadow) => renderShadow(shadow, 1)).join(", ")}]`;
}

function isGradientTokenValue(value: IrToken["value"]): value is GradientFill {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "type" in value && (value.type === "linear" || value.type === "radial") && "stops" in value && Array.isArray(value.stops);
}

function dartMemberName(value: string, fallback: string): string {
  const pascal = value.split(/[^A-Za-z0-9]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
  const camel = pascal === "" ? fallback : pascal.charAt(0).toLowerCase() + pascal.slice(1);
  return /^[A-Za-z]/.test(camel) ? camel : `${fallback}${camel}`;
}

function fontWeight(value: number): string {
  return `FontWeight.w${Math.min(900, Math.max(100, Math.round(value / 100) * 100))}`;
}

function toPascalCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("").replace(/^[^A-Za-z]+/, "");
}

function doubleLiteral(value: number): string {
  const literal = number(value);
  return literal.includes(".") ? literal : `${literal}.0`;
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
  return [...value].map((character) => {
    switch (character) {
      case "\\": return "\\\\";
      case "'": return "\\'";
      case "$": return "\\$";
      case "\n": return "\\n";
      default: return character;
    }
  }).join("");
}
