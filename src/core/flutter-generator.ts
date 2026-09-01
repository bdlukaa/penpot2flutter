import type { AssetManifestEntry, BoardNode, ColorFill, DropShadow, EdgeInsets, GeneratedFile, GradientFill, GridLayout, GroupNode, IrAsset, IrComponentDefinition, IrComponentInstanceNode, IrFontManifestEntry, IrInteraction, IrLibrary, IrNavigationGraph, IrNode, IrPrototypeAnimation, IrResponsiveScreen, IrScreen, IrTextTransform, IrToken, IrTokenReference, IrTokenSet, IrTokenTheme, IrTypographyStyle, IrVariantAxis, NodeStyle, SvgNode, TextNode, TextRun, TextStyle } from "../shared/ir.js";
import { generateFlutterThemeFiles, tokenAccessPath } from "./flutter-theme-generator.js";
import { libraryModuleName } from "./library-registry.js";
export { dartMemberName } from "./token-naming.js";

let componentNames: ReadonlyMap<string, string> = new Map();
let declaredParameters: ReadonlySet<string> = new Set();
let tokenDefinitions: ReadonlyMap<string, IrToken> = new Map();
let typographyDefinitions: ReadonlyMap<string, IrTypographyStyle> = new Map();
let componentVariantEnums: ReadonlyMap<string, string> = new Map();
let assetDefinitions: ReadonlyMap<string, IrAsset> = new Map();
let assetConstants: ReadonlyMap<string, string> = new Map();
let nodeInteractions: ReadonlyMap<string, readonly IrInteraction[]> = new Map();
let prototypeTargets: ReadonlyMap<string, PrototypeTarget> = new Map();
let prototypeAnchorIds: ReadonlySet<string> = new Set();
let prototypeOverlayActions: ReadonlyMap<string, IrInteraction> = new Map();

interface PrototypeTarget {
  readonly className: string;
  readonly path: string;
}

type PubspecAsset = AssetManifestEntry | IrAsset;

export function generatePubspecSnippet(assets: readonly PubspecAsset[], fonts: readonly IrFontManifestEntry[] = []): string {
  const fontFamilies = fonts.filter((font) => font.assets.length > 0);
  const paths = [...new Set(assets.filter((asset) => !("type" in asset && asset.type === "font")).map(assetFilename))].sort();
  if (paths.length === 0 && fontFamilies.length === 0) return "";
  const hasSvg = assets.some((asset) => "type" in asset ? asset.type === "svg" : asset.mimeType === "image/svg+xml");
  return [
    ...(hasSvg ? ["dependencies:", "  flutter_svg: ^2.3.0", ""] : []),
    "flutter:",
    ...(paths.length === 0 ? [] : ["  assets:", ...paths.map((path) => `    - ${path}`)]),
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


function assetFilename(asset: PubspecAsset): string {
  return "filename" in asset ? asset.filename : asset.path;
}

export function generateFlutterAssets(assets: readonly IrAsset[]): string {
  const lines = ["abstract final class AppAssets {"];
  for (const asset of assets) lines.push(`  static const ${assetConstants.get(asset.id) ?? dartAssetName(asset.filename)} = '${escapeDart(asset.filename)}';`);
  lines.push("}", "");
  return lines.join("\n");
}

function buildAssetConstants(assets: readonly IrAsset[]): ReadonlyMap<string, string> {
  const used = new Set<string>();
  const entries = [...assets].sort((left, right) => left.filename.localeCompare(right.filename) || left.id.localeCompare(right.id));
  const result = new Map<string, string>();
  for (const asset of entries) {
    const base = dartAssetName(asset.filename);
    let name = base;
    let suffix = 2;
    while (used.has(name)) name = `${base}${suffix++}`;
    used.add(name);
    result.set(asset.id, name);
  }
  return result;
}

function dartAssetName(filename: string): string {
  const basename = filename.split("/")[filename.split("/").length - 1]?.replace(/\.[^.]+$/, "") ?? "asset";
  const words: string[] = basename.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const value = words.map((word: string, index: number) => index === 0 ? word.charAt(0).toLowerCase() + word.slice(1) : word.charAt(0).toUpperCase() + word.slice(1)).join("");
  return /^[A-Za-z_]/.test(value) ? value || "asset" : `asset${value}`;
}

function assetReference(assetId: string | undefined, fallback: string): string {
  const constant = assetId === undefined ? undefined : assetConstants.get(assetId);
  return constant === undefined ? stringLiteral(fallback) : `AppAssets.${constant}`;
}

function imageFit(image: NonNullable<NodeStyle["image"]>): string {
  if (image.fit !== undefined) return image.fit;
  return image.keepAspectRatio ? "cover" : "fill";
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
  assets: readonly IrAsset[] = [],
  assetImport?: string,
  componentPaths?: ReadonlyMap<string, string>,
  sourcePath?: string,
  classNameOverride?: string,
  interactions: readonly IrInteraction[] = [],
  targets: ReadonlyMap<string, PrototypeTarget> = new Map(),
  prototypeImports: readonly string[] = [],
): string {
  componentNames = buildNameMap(components);
  componentVariantEnums = new Map(components.filter((component) => component.variant?.representation === "members").map((component) => [component.id, component.variant?.enumName ?? `${component.name}Variant`]));
  tokenDefinitions = tokenDefinitionMap(tokens);
  typographyDefinitions = new Map(typographyStyles.map((style) => [style.id, style]));
  assetDefinitions = new Map(assets.map((asset) => [asset.id, asset]));
  assetConstants = buildAssetConstants(assets);
  declaredParameters = new Set();
  nodeInteractions = interactionsByNode(interactions);
  prototypeTargets = targets;
  prototypeAnchorIds = new Set(interactions.flatMap((interaction) => interaction.overlay?.relativeToSourceId === undefined ? [] : [interaction.overlay.relativeToSourceId]));
  prototypeOverlayActions = new Map(interactions.filter((interaction) => (interaction.kind === "open-overlay" || interaction.kind === "toggle-overlay") && interaction.targetId !== undefined).map((interaction) => [interaction.targetId!, interaction]));
  const roots = responsiveScreen?.variants.map((variant) => variant.root) ?? [root];
  const className = classNameOverride ?? (toPascalCase(responsiveScreen?.name ?? root.name) || "GeneratedWidget");
  return [
    ...(roots.some(containsRotation) ? ["import 'dart:math' as math;", ""] : []),
    "import 'package:flutter/material.dart';",
    ...(roots.some(containsSvg) ? ["import 'package:flutter_svg/flutter_svg.dart';"] : []),
    ...(assetImport !== undefined && roots.some(containsAssetReference) ? [`import '${assetImport}';`] : []),
    ...(roots.some(containsTokens) ? ["import '../theme/penpot_theme_extensions.dart';"] : []),
    ...(roots.some(containsTypography) ? ["import '../app_typography.dart';"] : []),
    ...(interactions.length === 0 ? [] : ["import '../prototype_interactions.dart';"]),
    ...prototypeImports,
    ...componentImports(roots.flatMap((variantRoot) => [...collectInstanceComponentIds(variantRoot)]), components, "../components/", componentPaths, sourcePath),
    "",
    `class ${className} extends StatelessWidget {`,
    `  const ${className}({super.key});`,
    "",
    "  @override",
    "  Widget build(BuildContext context) {",
    `    // ${commentText(responsiveScreen?.name ?? root.sourceName)}`,
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
      lines.push(`        if (constraints.maxWidth < ${number(upperBound)}) {`, `          // ${commentText(variant.sourceName)}`, `          return ${rendered};`, "        }");
    } else {
      lines.push(`        // ${commentText(variant.sourceName)}`, `        return ${rendered};`);
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

export function generateComponentWidget(component: IrComponentDefinition, components: readonly IrComponentDefinition[], tokens: readonly IrToken[] = [], typographyStyles: readonly IrTypographyStyle[] = [], assets: readonly IrAsset[] = [], assetImport?: string, componentPaths?: ReadonlyMap<string, string>, sourcePath?: string): string {
  componentNames = buildNameMap(components);
  componentVariantEnums = new Map(components.filter((candidate) => candidate.variant?.representation === "members").map((candidate) => [candidate.id, candidate.variant?.enumName ?? `${candidate.name}Variant`]));
  tokenDefinitions = tokenDefinitionMap(tokens);
  typographyDefinitions = new Map(typographyStyles.map((style) => [style.id, style]));
  assetDefinitions = new Map(assets.map((asset) => [asset.id, asset]));
  assetConstants = buildAssetConstants(assets);
  nodeInteractions = new Map();
  prototypeTargets = new Map();
  prototypeAnchorIds = new Set();
  prototypeOverlayActions = new Map();
  declaredParameters = new Set(component.parameters.map((parameter) => parameter.name));
  const axes = component.variant?.representation === "members" ? [] : component.variant?.axes ?? [];
  const lines = [
    ...(componentRoots(component).some(containsRotation) ? ["import 'dart:math' as math;", ""] : []),
    "import 'package:flutter/material.dart';",
    ...(componentRoots(component).some(containsSvg) ? ["import 'package:flutter_svg/flutter_svg.dart';"] : []),
    ...(assetImport !== undefined && componentRoots(component).some(containsAssetReference) ? [`import '${assetImport}';`] : []),
    ...(componentRoots(component).some(containsTokens) ? ["import '../theme/penpot_theme_extensions.dart';"] : []),
    ...(componentRoots(component).some(containsTypography) ? ["import '../app_typography.dart';"] : []),
    ...componentImports(component.dependencies, components, "", componentPaths, sourcePath),
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
  lines.push("", "  @override", "  Widget build(BuildContext context) {", `    // ${commentText(component.sourceName)}`, ...renderVariantComponentBody(component), "  }", "}", "");
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
  cachedThemeFiles?: readonly GeneratedFile[],
  assets: readonly IrAsset[] = [],
  libraries: readonly IrLibrary[] = [],
  navigationGraph?: IrNavigationGraph,
): GeneratedFile[] {
  const screenName = toPascalCase(responsiveScreen?.name ?? root.name) || "GeneratedScreen";
  const sharedLibraries = libraries.filter((library) => library.scope === "shared");
  const libraryById = new Map(sharedLibraries.map((library) => [library.id, library]));
  const componentPaths = new Map(components.map((component) => [
    component.id,
    component.sourceLibraryScope === "shared" && component.sourceLibraryId !== undefined
      ? `libraries/${libraryModuleName(libraryById.get(component.sourceLibraryId) ?? { id: component.sourceLibraryId, name: component.sourceLibraryId })}/components/${snakeCase(component.name)}.dart`
      : `components/${snakeCase(component.name)}.dart`,
  ]));
  const screenPath = `screens/${snakeCase(screenName)}.dart`;
  const targets: ReadonlyMap<string, PrototypeTarget> = navigationGraph === undefined ? new Map() : new Map<string, PrototypeTarget>([
    ...navigationGraph.screens.map((screen) => [screen.id, { className: screenClassName(screen), path: `screens/${snakeCase(screenClassName(screen))}.dart` }] as const),
    ...navigationGraph.overlays.map((overlay) => [overlay.id, { className: overlayClassName(overlay.name), path: `overlays/${snakeCase(overlayClassName(overlay.name))}.dart` }] as const),
  ]);
  const prototypeImportsFor = (sourcePath: string, interactions: readonly IrInteraction[]): readonly string[] => [...new Set(interactions.flatMap((interaction) => {
    const target = interaction.targetId === undefined ? undefined : targets.get(interaction.targetId);
    return target === undefined || target.path === sourcePath ? [] : [`import '${relativeDartImport(sourcePath, target.path)}';`];
  }))].sort();
  const files: GeneratedFile[] = navigationGraph === undefined
    ? [{
        path: screenPath,
        source: generateFlutterWidget(root, components, tokens, responsiveScreen, typographyStyles, assets, "../assets.dart", componentPaths, screenPath),
      }]
    : [
        ...navigationGraph.screens.map((screen) => {
          const path = `screens/${snakeCase(screenClassName(screen))}.dart`;
          return { path, source: generateFlutterWidget(screen.root, components, tokens, undefined, typographyStyles, assets, "../assets.dart", componentPaths, path, screenClassName(screen), screen.interactions, targets, prototypeImportsFor(path, screen.interactions)) };
        }),
        ...navigationGraph.overlays.map((overlay) => {
          const path = `overlays/${snakeCase(overlayClassName(overlay.name))}.dart`;
          return { path, source: generateFlutterWidget(overlay.root, components, tokens, undefined, typographyStyles, assets, "../assets.dart", componentPaths, path, overlayClassName(overlay.name), overlay.interactions, targets, prototypeImportsFor(path, overlay.interactions)) };
        }),
      ];
  if (navigationGraph !== undefined) {
    files.push({ path: "navigation.dart", source: generateNavigatorFile(navigationGraph) });
    if (navigationGraph.screens.some((screen) => screen.interactions.length > 0) || navigationGraph.overlays.some((overlay) => overlay.interactions.length > 0)) files.push({ path: "prototype_interactions.dart", source: generatePrototypeInteractions() });
  }
  for (const component of components) {
    const path = componentPaths.get(component.id)!;
    files.push({ path, source: generateComponentWidget(component, components, tokens, typographyStyles, assets, assetImportFor(path), componentPaths, path) });
  }
  if (assets.length > 0) files.push({ path: "assets.dart", source: generateFlutterAssets(assets) });

  const localTokens = tokens.filter((token) => token.sourceLibraryScope !== "shared");
  const localSets = tokenSets.filter((set) => set.sourceLibraryScope !== "shared");
  const localThemes = tokenThemes.filter((theme) => theme.sourceLibraryScope !== "shared");
  files.push(...(cachedThemeFiles ?? generateFlutterThemeFiles(localTokens, localSets, localThemes)));
  for (const library of sharedLibraries) {
    const module = libraryModuleName(library);
    const prefix = `libraries/${module}`;
    const libraryTokens = tokens.filter((token) => token.sourceLibraryId === library.id);
    const librarySets = tokenSets.filter((set) => set.sourceLibraryId === library.id);
    const libraryThemes = tokenThemes.filter((theme) => theme.sourceLibraryId === library.id);
    for (const themeFile of generateFlutterThemeFiles(libraryTokens, librarySets, libraryThemes)) {
      if (themeFile.path.startsWith("theme/")) files.push({ ...themeFile, path: `${prefix}/${themeFile.path}` });
    }
    if (library.assets.length > 0) files.push({ path: `${prefix}/assets.dart`, source: "export '../../assets.dart';\n" });
    const exports = [
      ...components.filter((component) => component.sourceLibraryId === library.id).map((component) => `export 'components/${snakeCase(component.name)}.dart';`),
      ...(library.assets.length === 0 ? [] : ["export 'assets.dart';"]),
      ...(libraryTokens.length === 0 ? [] : ["export 'theme/penpot_theme_extensions.dart';", "export 'theme/penpot_token_namespaces.dart';", "export 'theme/penpot_tokens.dart';", "export 'theme/penpot_themes.dart';"]),
      "",
    ];
    files.push({ path: `${prefix}/${module}.dart`, source: exports.join("\n") });
  }
  if (typographyStyles.length > 0) files.push({ path: "app_typography.dart", source: generateFlutterTypography(typographyStyles) });
  const barrel = files.find((file) => file.path === "penpot.dart");
  const exports = generateBarrelExport(components.filter((component) => component.sourceLibraryScope !== "shared"), navigationGraph === undefined ? [snakeCase(screenName)] : navigationGraph.screens.map((screen) => snakeCase(screenClassName(screen))), localTokens.length > 0, typographyStyles.length > 0, assets.length > 0)
    + (navigationGraph === undefined ? "" : "export 'navigation.dart';\n")
    + sharedLibraries.map((library) => `export 'libraries/${libraryModuleName(library)}/${libraryModuleName(library)}.dart';`).join("\n")
    + (sharedLibraries.length === 0 ? "" : "\n");
  if (barrel === undefined) files.push({ path: "penpot.dart", source: exports });
  else files[files.indexOf(barrel)] = { ...barrel, source: barrel.source + exports };
  const manifest = JSON.stringify({ libraries: libraries.map((library) => ({ libraryId: library.id, name: library.name, scope: library.scope, ...(library.sourceRevision === undefined ? {} : { sourceRevision: library.sourceRevision }) })), files: files.map((file) => file.path).sort() }, null, 2) + "\n";
  const existingManifest = files.findIndex((file) => file.path === "penpot_manifest.json");
  if (existingManifest >= 0) files[existingManifest] = { path: "penpot_manifest.json", source: manifest };
  else if (libraries.length > 0) files.push({ path: "penpot_manifest.json", source: manifest });
  return files;
}

function overlayClassName(name: string): string {
  const base = toPascalCase(name) || "Generated";
  return base.endsWith("Overlay") ? base : `${base}Overlay`;
}

function generatePrototypeInteractions(): string {
  return [
    "import 'dart:async';",
    "",
    "import 'package:flutter/material.dart';",
    "",
    "class PenpotDelayedInteraction extends StatefulWidget {",
    "  const PenpotDelayedInteraction({super.key, required this.delay, required this.onTriggered, required this.child});",
    "",
    "  final Duration delay;",
    "  final void Function(BuildContext context) onTriggered;",
    "  final Widget child;",
    "",
    "  @override",
    "  State<PenpotDelayedInteraction> createState() => _PenpotDelayedInteractionState();",
    "}",
    "",
    "class _PenpotDelayedInteractionState extends State<PenpotDelayedInteraction> {",
    "  Timer? _timer;",
    "",
    "  @override",
    "  void initState() {",
    "    super.initState();",
    "    _timer = Timer(widget.delay, () { if (mounted) widget.onTriggered(context); });",
    "  }",
    "",
    "  @override",
    "  void dispose() { _timer?.cancel(); super.dispose(); }",
    "",
    "  @override",
    "  Widget build(BuildContext context) => widget.child;",
    "}",
    "",
    "class PenpotAnchor extends StatefulWidget {",
    "  const PenpotAnchor({super.key, required this.id, required this.child});",
    "  final String id;",
    "  final Widget child;",
    "  @override State<PenpotAnchor> createState() => _PenpotAnchorState();",
    "}",
    "",
    "class _PenpotAnchorState extends State<PenpotAnchor> {",
    "  @override void didChangeDependencies() { super.didChangeDependencies(); PenpotPrototype.registerAnchor(widget.id, context); }",
    "  @override void dispose() { PenpotPrototype.unregisterAnchor(widget.id, context); super.dispose(); }",
    "  @override Widget build(BuildContext context) => widget.child;",
    "}",
    "",
    "class PenpotOverlayPortal extends StatefulWidget {",
    "  const PenpotOverlayPortal({super.key, required this.id, required this.overlayChildBuilder, required this.child, this.position = 'center', this.relativeTo, this.manualPosition, this.duration = Duration.zero, this.curve = Curves.linear, this.transition = 'dissolve', this.direction = 'right', this.way = 'in', this.dismissible = true, this.barrier = true});",
    "  final String id; final WidgetBuilder overlayChildBuilder; final Widget child; final String position; final String? relativeTo; final Offset? manualPosition; final Duration duration; final Curve curve; final String transition; final String direction; final String way; final bool dismissible; final bool barrier;",
    "  @override State<PenpotOverlayPortal> createState() => _PenpotOverlayPortalState();",
    "}",
    "",
    "class _PenpotOverlayPortalState extends State<PenpotOverlayPortal> {",
    "  final _controller = OverlayPortalController();",
    "  @override void initState() { super.initState(); PenpotPrototype.registerPortal(widget.id, _controller); }",
    "  @override void dispose() { PenpotPrototype.unregisterPortal(widget.id, _controller); super.dispose(); }",
    "  @override Widget build(BuildContext context) => OverlayPortal(controller: _controller, overlayChildBuilder: (context) => PenpotPrototype.buildOverlay(context, widget), child: widget.child);",
    "}",
    "",
    "abstract final class PenpotPrototype {",
    "  static final Map<String, OverlayPortalController> _overlays = {};",
    "  static final Map<String, BuildContext> _anchors = {};",
    "  static void registerAnchor(String id, BuildContext context) => _anchors[id] = context;",
    "  static void unregisterAnchor(String id, BuildContext context) { if (_anchors[id] == context) _anchors.remove(id); }",
    "  static void registerPortal(String id, OverlayPortalController controller) => _overlays[id] = controller;",
    "  static void unregisterPortal(String id, OverlayPortalController controller) { if (_overlays[id] == controller) _overlays.remove(id); }",
    "",
    "  static Future<void> navigate(BuildContext context, WidgetBuilder destination, {Duration duration = Duration.zero, Curve curve = Curves.linear, String transition = 'dissolve', String direction = 'right', String way = 'in'}) {",
    "    return Navigator.of(context).push(PageRouteBuilder<void>(pageBuilder: (_, __, ___) => destination(context), transitionDuration: duration, reverseTransitionDuration: duration, transitionsBuilder: (_, animation, __, child) {",
    "      if (transition == 'dissolve') return FadeTransition(opacity: animation, child: child);",
    "      final begin = _offset(direction, way);",
    "      return SlideTransition(position: Tween<Offset>(begin: begin, end: Offset.zero).chain(CurveTween(curve: curve)).animate(animation), child: child);",
    "    }));",
    "  }",
    "",
    "  static void openOverlay(BuildContext context, String id) => _overlays[id]?.show();",
    "",
    "  static void toggleOverlay(String id) {",
    "    final controller = _overlays[id];",
    "    if (controller == null) return;",
    "    if (controller.isShowing) controller.hide(); else controller.show();",
    "  }",
    "",
    "  static void closeOverlay(String id) => _overlays[id]?.hide();",
    "  static void closeLastOverlay() { if (_overlays.isNotEmpty) closeOverlay(_overlays.keys.last); }",
    "  static Widget buildOverlay(BuildContext context, PenpotOverlayPortal portal) {",
    "    final content = TweenAnimationBuilder<double>(duration: portal.duration, tween: Tween(begin: 0, end: 1), curve: portal.curve, builder: (_, value, child) => portal.transition == 'dissolve' ? Opacity(opacity: value, child: child) : FractionalTranslation(translation: _offset(portal.direction, portal.way) * (1 - value), child: child), child: portal.overlayChildBuilder(context));",
    "    return Stack(children: [if (portal.barrier) ModalBarrier(dismissible: portal.dismissible, color: Colors.black54, onDismiss: () => closeOverlay(portal.id)), _position(portal.position, content, anchor: _anchorRect(portal.relativeTo, Overlay.of(context)), manualPosition: portal.manualPosition)]);",
    "  }",
    "",
    "  static void unresolved(BuildContext context) { ScaffoldMessenger.maybeOf(context)?.showSnackBar(const SnackBar(content: Text('Penpot prototype target is unavailable.'))); }",
    "",
    "  static Offset _offset(String direction, String way) {",
    "    final base = switch (direction) { 'left' => const Offset(-1, 0), 'up' => const Offset(0, -1), 'down' => const Offset(0, 1), _ => const Offset(1, 0) };",
    "    return way == 'out' ? -base : base;",
    "  }",
    "",
    "  static Rect? _anchorRect(String? id, OverlayState overlay) {",
    "    final anchor = id == null ? null : _anchors[id];",
    "    final source = anchor?.findRenderObject() as RenderBox?;",
    "    final target = overlay.context.findRenderObject() as RenderBox?;",
    "    if (source == null || target == null || !source.hasSize || !target.hasSize) return null;",
    "    final origin = target.globalToLocal(source.localToGlobal(Offset.zero));",
    "    return origin & source.size;",
    "  }",
    "",
    "  static Widget _position(String position, Widget child, {Rect? anchor, Offset? manualPosition}) {",
    "    if (position == 'manual' && manualPosition != null) return Positioned(left: manualPosition.dx, top: manualPosition.dy, child: child);",
    "    if (anchor == null) return switch (position) {",
    "      'top-left' => Align(alignment: Alignment.topLeft, child: child), 'top-center' => Align(alignment: Alignment.topCenter, child: child), 'top-right' => Align(alignment: Alignment.topRight, child: child),",
    "      'bottom-left' => Align(alignment: Alignment.bottomLeft, child: child), 'bottom-center' => Align(alignment: Alignment.bottomCenter, child: child), 'bottom-right' => Align(alignment: Alignment.bottomRight, child: child),",
    "      _ => Center(child: child),",
    "    };",
    "    final alignment = switch (position) {",
    "      'top-left' => Alignment.topLeft, 'top-center' => Alignment.topCenter, 'top-right' => Alignment.topRight,",
    "      'bottom-left' => Alignment.bottomLeft, 'bottom-center' => Alignment.bottomCenter, 'bottom-right' => Alignment.bottomRight, _ => Alignment.center,",
    "    };",
    "    return Positioned.fromRect(rect: anchor, child: OverflowBox(maxWidth: double.infinity, maxHeight: double.infinity, alignment: alignment, child: child));",
    "  }",
    "}",
    "",
  ].join("\n");
}

function screenClassName(screen: IrScreen): string {
  const name = toPascalCase(screen.name) || "Generated";
  return name.endsWith("Screen") ? name : `${name}Screen`;
}

function generateNavigatorFile(graph: IrNavigationGraph): string {
  const screens = [...graph.screens].sort((left, right) => left.id.localeCompare(right.id));
  const initialRoute = graph.flowEntries[0]?.screenId ?? screens[0]?.id;
  const initialScreen = screens.find((screen) => screen.id === initialRoute) ?? screens[0];
  if (initialScreen === undefined) return "";
  return [
    "import 'package:flutter/material.dart';",
    ...screens.map((screen) => `import 'screens/${snakeCase(screenClassName(screen))}.dart';`),
    "",
    "abstract final class PenpotNavigation {",
    `  static const initialRoute = '${escapeDart(initialScreen.routeName ?? "/")}';`,
    "",
    "  static Route<dynamic> onGenerateRoute(RouteSettings settings) {",
    "    return MaterialPageRoute<void>(",
    "      settings: settings,",
    "      builder: (context) => switch (settings.name) {",
    ...screens.map((screen) => `        '${escapeDart(screen.routeName ?? "/")}' => const ${screenClassName(screen)}(),`),
    `        _ => const ${screenClassName(initialScreen)}(),`,
    "      },",
    "    );",
    "  }",
    "}",
    "",
  ].join("\n");
}

function generateBarrelExport(components: readonly IrComponentDefinition[], screenFileNames: readonly string[], hasTokens: boolean, hasTypography: boolean, hasAssets: boolean): string {
  return [
    ...screenFileNames.map((screenFileName) => `export 'screens/${screenFileName}.dart';`),
    ...(hasTokens ? [] : []),
    ...(hasTypography ? ["export 'app_typography.dart';"] : []),
    ...(hasAssets ? ["export 'assets.dart';"] : []),
    ...components.map((component) => `export 'components/${snakeCase(component.name)}.dart';`),
    "",
  ].join("\n");
}

function buildNameMap(components: readonly IrComponentDefinition[]): ReadonlyMap<string, string> {
  return new Map(components.map((component) => [component.id, component.name]));
}

function componentImports(componentIds: Iterable<string>, components: readonly IrComponentDefinition[], prefix: string, componentPaths?: ReadonlyMap<string, string>, sourcePath?: string): string[] {
  return [...new Set(componentIds)]
    .map((id) => components.find((component) => component.id === id))
    .filter((component): component is IrComponentDefinition => component !== undefined)
    .map((component) => {
      const target = componentPaths?.get(component.id);
      return `import '${target === undefined || sourcePath === undefined ? `${prefix}${snakeCase(component.name)}.dart` : relativeDartImport(sourcePath, target)}';`;
    })
    .sort();
}

function assetImportFor(path: string): string {
  return relativeDartImport(path, "assets.dart");
}

function relativeDartImport(fromPath: string, toPath: string): string {
  const from = fromPath.split("/").slice(0, -1);
  const to = toPath.split("/");
  while (from[0] !== undefined && from[0] === to[0]) {
    from.shift();
    to.shift();
  }
  return `${from.map(() => "..").concat(to).join("/")}`;
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
  return (node.transform?.rotation ?? 0) !== 0 || hasToken(node, "rotation") || ("children" in node && node.children.some(containsRotation));
}

function containsSvg(node: IrNode): boolean {
  return (node.kind === "svg" && (node.assetType === undefined || node.assetType === "svg")) || ("children" in node && node.children.some(containsSvg));
}

function containsAssetReference(node: IrNode): boolean {
  return (node.kind === "svg" && node.assetId !== undefined && assetDefinitions.has(node.assetId))
    || (node.style.image?.assetId !== undefined && assetDefinitions.has(node.style.image.assetId))
    || ("children" in node && node.children.some(containsAssetReference));
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
  content = renderPrototypeInteractions(node, content, contentDepth);
  for (const interaction of prototypeOverlayActions.values()) {
    if (interaction.overlay?.relativeToSourceId !== node.sourceId && interaction.sourceNodeId !== node.sourceId) continue;
    if (interaction.targetId === undefined) continue;
    const target = prototypeTargets.get(interaction.targetId);
    if (target === undefined) continue;
    const animation = interaction.animation;
    content = ["PenpotOverlayPortal(", `${indent(contentDepth + 1)}id: '${escapeDart(interaction.targetId)}',`, `${indent(contentDepth + 1)}overlayChildBuilder: (context) => const ${target.className}(),`, `${indent(contentDepth + 1)}position: '${interaction.overlay?.position ?? "center"}',`, ...(interaction.overlay?.relativeToSourceId === undefined ? [] : [`${indent(contentDepth + 1)}relativeTo: '${escapeDart(interaction.overlay.relativeToSourceId)}',`]), ...(interaction.overlay?.manualPosition === undefined ? [] : [`${indent(contentDepth + 1)}manualPosition: Offset(${number(interaction.overlay.manualPosition.x)}, ${number(interaction.overlay.manualPosition.y)}),`]), ...(animation === undefined ? [] : [`${indent(contentDepth + 1)}duration: Duration(milliseconds: ${number(animation.durationMs)}),`, `${indent(contentDepth + 1)}curve: ${curveFor(animation.easing)},`, `${indent(contentDepth + 1)}transition: '${animation.type}',`, `${indent(contentDepth + 1)}direction: '${animation.direction ?? "right"}',`, `${indent(contentDepth + 1)}way: '${animation.way ?? "in"}',`]), ...(interaction.overlay?.closeWhenClickOutside === undefined ? [] : [`${indent(contentDepth + 1)}dismissible: ${interaction.overlay.closeWhenClickOutside},`]), ...(interaction.overlay?.addBackgroundOverlay === undefined ? [] : [`${indent(contentDepth + 1)}barrier: ${interaction.overlay.addBackgroundOverlay},`]), `${indent(contentDepth + 1)}child: ${nestedInteractionChild(content)},`, `${indent(contentDepth)})`].join("\n");
  }
  if (prototypeAnchorIds.has(node.sourceId)) content = ["PenpotAnchor(", `${indent(contentDepth + 1)}id: '${escapeDart(node.sourceId)}',`, `${indent(contentDepth + 1)}child: ${content},`, `${indent(contentDepth)})`].join("\n");
  if (!positioned) return content;
  return [
    "Positioned(",
    `${indent(depth + 1)}left: ${tokenValue(node, "x", number(node.geometry.x))},`,
    `${indent(depth + 1)}top: ${tokenValue(node, "y", number(node.geometry.y))},`,
    `${indent(depth + 1)}child: ${content},`,
    `${indent(depth)})`,
  ].join("\n");
}

function interactionsByNode(interactions: readonly IrInteraction[]): ReadonlyMap<string, readonly IrInteraction[]> {
  const grouped = new Map<string, IrInteraction[]>();
  for (const interaction of interactions) grouped.set(interaction.sourceNodeId, [...(grouped.get(interaction.sourceNodeId) ?? []), interaction]);
  return grouped;
}

function renderPrototypeInteractions(node: IrNode, child: string, depth: number): string {
  const interactions = nodeInteractions.get(node.sourceId);
  if (interactions === undefined || interactions.length === 0) return child;
  const urlInteraction = interactions.find((interaction) => interaction.kind === "open-url" && interaction.url !== undefined);
  const callback = (interaction: IrInteraction, followLink?: string): string => {
    const animation = animationArguments(interaction.animation);
    switch (interaction.kind) {
      case "navigate": {
        const target = interaction.targetId === undefined ? undefined : prototypeTargets.get(interaction.targetId);
        return target === undefined ? "PenpotPrototype.unresolved(context)" : `PenpotPrototype.navigate(context, () => const ${target.className}()${animation === "" ? "" : `, ${animation}`})`;
      }
      case "open-overlay": {
        const target = interaction.targetId === undefined ? undefined : prototypeTargets.get(interaction.targetId);
        return target === undefined ? "PenpotPrototype.unresolved(context)" : `PenpotPrototype.openOverlay(context, '${escapeDart(interaction.targetId!)}')`;
      }
      case "toggle-overlay": {
        const target = interaction.targetId === undefined ? undefined : prototypeTargets.get(interaction.targetId);
        return target === undefined ? "PenpotPrototype.unresolved(context)" : `PenpotPrototype.toggleOverlay('${escapeDart(interaction.targetId!)}')`;
      }
      case "close-overlay": return interaction.targetId === undefined ? `PenpotPrototype.closeLastOverlay(${animation})` : `PenpotPrototype.closeOverlay('${escapeDart(interaction.targetId)}'${animation === "" ? "" : `, ${animation}`})`;
      case "back": return "Navigator.of(context).maybePop()";
      case "open-url": return followLink === undefined ? "PenpotPrototype.unresolved(context)" : followLink;
    }
  };
  const callbacks = (trigger: IrInteraction["trigger"], followLink?: string): readonly string[] => interactions.filter((interaction) => interaction.trigger === trigger).map((interaction) => callback(interaction, followLink));
  const actionBlock = (actions: readonly string[], callbackDepth: number): string => ["{", ...actions.map((action) => `${indent(callbackDepth + 1)}${action};`), `${indent(callbackDepth)}}`].join("\n");
  let rendered = child;
  const click = callbacks("click", urlInteraction === undefined ? undefined : "followLink()");
  if (click.length > 0) rendered = ["GestureDetector(", `${indent(depth + 1)}behavior: HitTestBehavior.opaque,`, `${indent(depth + 1)}onTap: () ${actionBlock(click, depth + 1)},`, `${indent(depth + 1)}child: ${nestedInteractionChild(rendered)},`, `${indent(depth)})`].join("\n");
  const enter = callbacks("mouse-enter", urlInteraction === undefined ? undefined : "followLink()");
  const leave = callbacks("mouse-leave", urlInteraction === undefined ? undefined : "followLink()");
  if (enter.length > 0 || leave.length > 0) rendered = ["MouseRegion(", ...(enter.length === 0 ? [] : [`${indent(depth + 1)}onEnter: (_) ${actionBlock(enter, depth + 1)},`]), ...(leave.length === 0 ? [] : [`${indent(depth + 1)}onExit: (_) ${actionBlock(leave, depth + 1)},`]), `${indent(depth + 1)}child: ${nestedInteractionChild(rendered)},`, `${indent(depth)})`].join("\n");
  for (const interaction of interactions.filter((item) => item.trigger === "after-delay")) {
    rendered = ["PenpotDelayedInteraction(", `${indent(depth + 1)}delay: Duration(milliseconds: ${number(interaction.delayMs ?? 0)}),`, `${indent(depth + 1)}onTriggered: (context) ${actionBlock([callback(interaction, urlInteraction === undefined ? undefined : "followLink()")], depth + 1)},`, `${indent(depth + 1)}child: ${nestedInteractionChild(rendered)},`, `${indent(depth)})`].join("\n");
  }
  return urlInteraction === undefined ? rendered : ["Link(", `${indent(depth + 1)}uri: Uri.parse('${escapeDart(urlInteraction.url!)}'),`, `${indent(depth + 1)}builder: (context, followLink) => ${nestedInteractionChild(rendered)},`, `${indent(depth)})`].join("\n");
}

function nestedInteractionChild(child: string): string {
  return child.replace(/\n/g, "\n  ");
}

function animationArguments(animation: IrPrototypeAnimation | undefined): string {
  if (animation === undefined) return "";
  return `duration: Duration(milliseconds: ${number(animation.durationMs)}), curve: ${curveFor(animation.easing)}, transition: '${animation.type}', direction: '${animation.direction ?? "right"}', way: '${animation.way ?? "in"}'`;
}


function curveFor(easing: IrPrototypeAnimation["easing"]): string {
  switch (easing) {
    case "ease": return "Curves.ease";
    case "ease-in": return "Curves.easeIn";
    case "ease-out": return "Curves.easeOut";
    case "ease-in-out": return "Curves.easeInOut";
    default: return "Curves.linear";
  }
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
  const innerDepth = depth + Number(layout.minWidth !== undefined || layout.maxWidth !== undefined || layout.minHeight !== undefined || layout.maxHeight !== undefined);
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
  return transform === undefined ? 0 : Number(transform.rotation !== 0 || hasToken(node, "rotation")) + Number(transform.flipX || transform.flipY);
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
  return transform.rotation === 0 && !hasToken(node, "rotation")
    ? scaled
    : [
        "Transform.rotate(",
        `${indent(depth + 1)}angle: ${tokenValue(node, "rotation", number(transform.rotation))} * math.pi / 180,`,
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
  const meaningful = children.filter((child) => !isNoopNode(child));
  if (clipBehavior === "Clip.none" && meaningful.length === 1 && children.length > meaningful.length) {
    const child = meaningful[0];
    const rendered = renderNode(child, depth + 1, false);
    const left = child.geometry.x;
    const top = child.geometry.y;
    if (left === 0 && top === 0) return commentFor(child, depth, rendered);
    return commentFor(child, depth, [
      "Padding(",
      `${indent(depth + 1)}padding: EdgeInsets.only(left: ${number(left)}, top: ${number(top)}),`,
      `${indent(depth + 1)}child: ${rendered},`,
      `${indent(depth)})`,
    ].join("\n"));
  }
  return [
    "Stack(",
    ...(clipBehavior === "Clip.hardEdge" ? [] : [`${indent(depth + 1)}clipBehavior: ${clipBehavior},`]),
    `${indent(depth + 1)}children: [`,
    ...children.map((child) => `${commentFor(child, depth + 2, renderNode(child, depth + 2, true))},`),
    `${indent(depth + 1)}],`,
    `${indent(depth)})`,
  ].join("\n");
}

function isNoopNode(node: IrNode): boolean {
  return !node.visible || node.kind === "unsupported";
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

function argumentTokenValue(argument: IrComponentInstanceNode["arguments"][number]): string | undefined {
  if (argument.tokenPath === undefined) return undefined;
  return `context.penpot.${tokenAccessPath(argument.tokenPath)}`;
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
  const overrideArguments = node.arguments.map((argument) => `${argument.name}: ${argumentTokenValue(argument) ?? (argument.type === "Color" ? dartColor(argument.value, 1) : `'${escapeDart(argument.value)}'`)},`);
  const argumentsList = [...variantArguments, ...overrideArguments];
  if (argumentsList.length === 0) return `${name}()`;
  return [
    `${name}(`,
    ...argumentsList.map((argument) => `${indent(depth + 1)}${argument}`),
    `${indent(depth)})`,
  ].join("\n");
}

function renderSvg(node: SvgNode, depth: number): string {
  const asset = node.assetType !== undefined && node.assetType !== "svg"
    ? [
        "Image.asset(",
        `${indent(depth + 1)}${assetReference(node.assetId, node.assetPath)},`,
        `${indent(depth + 1)}width: ${tokenValue(node, "width", number(node.geometry.width))},`,
        `${indent(depth + 1)}height: ${tokenValue(node, "height", number(node.geometry.height))},`,
        `${indent(depth + 1)}fit: BoxFit.contain,`,
        `${indent(depth)})`,
      ].join("\n")
    : [
        "SvgPicture.asset(",
        `${indent(depth + 1)}${assetReference(node.assetId, node.assetPath)},`,
        `${indent(depth + 1)}width: ${tokenValue(node, "width", number(node.geometry.width))},`,
        `${indent(depth + 1)}height: ${tokenValue(node, "height", number(node.geometry.height))},`,
        `${indent(depth)})`,
      ].join("\n");
  const radius = node.style.radius;
  if (radius === undefined || [radius.topLeft, radius.topRight, radius.bottomRight, radius.bottomLeft].every((value) => value === 0)) return asset;
  return [
    "ClipRRect(",
    `${indent(depth + 1)}borderRadius: ${borderRadius(radius, depth + 2, node)},`,
    `${indent(depth + 1)}child: ${asset},`,
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
    ...(style.decoration === "underline" ? [`decoration: ${tokenValue(node, "textDecoration", "TextDecoration.underline")}`] : style.decoration === "line-through" ? [`decoration: ${tokenValue(node, "textDecoration", "TextDecoration.lineThrough")}`] : hasToken(node, "textDecoration") ? [`decoration: ${tokenValue(node, "textDecoration", "TextDecoration.none")}`] : []),
    ...(style.color !== undefined ? [`color: ${tokenValue(node, "textColor", dartColor(style.color.color, style.color.opacity), "fill")}`] : fillColor === undefined ? [] : [`color: ${tokenValue(node, "textColor", dartColor(fillColor.color, fillColor.opacity), "fill")}`]),
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
    ...(style.image === undefined ? [] : [`image: DecorationImage(\n${indent(depth + 2)}image: AssetImage(${assetReference(style.image.assetId, style.image.assetPath)}),\n${indent(depth + 2)}fit: BoxFit.${imageFit(style.image)},\n${style.image.alignment === undefined ? "" : `${indent(depth + 2)}alignment: Alignment.${style.image.alignment},\n`}${indent(depth + 1)})`]),
    ...(border === undefined ? [] : [`border: Border.all(color: ${tokenValue(node, "strokeColor", dartColor(border.color, border.opacity))}, width: ${tokenValue(node, "strokeWidth", number(border.width))})`]),
    ...(radius === undefined ? [] : [`borderRadius: ${borderRadius(radius, depth + 2, node)}`]),
    ...(shadows === undefined ? [] : [`boxShadow: ${tokenValue(node, "shadow", `[\n${shadows.map((shadow) => `${indent(depth + 2)}${renderShadow(shadow, depth + 3)},`).join("\n")}\n${indent(depth + 1)}]`)}`]),
  ];
  const hasRuntimeValue = (node.fillParameterName !== undefined && declaredParameters.has(node.fillParameterName)) || (hasToken(node, "fill") && tokenDefinitions.get(node.tokenReferences?.find((reference) => reference.property === "fill")?.tokenId ?? "")?.type === "color");
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
  return `${indent(depth)}// ${commentText(node.sourceName)}\n${indent(depth)}${rendered}`;
}

function commentText(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
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

function tokenDefinitionMap(tokens: readonly IrToken[]): ReadonlyMap<string, IrToken> {
  const definitions = new Map<string, IrToken>();
  for (const token of tokens) {
    definitions.set(`${token.setId ?? ""}:${token.id}`, token);
    if (token.setId === undefined) definitions.set(token.id, token);
  }
  return definitions;
}

function tokenDefinition(reference: IrTokenReference): IrToken | undefined {
  if (reference.tokenId === undefined) return undefined;
  return tokenDefinitions.get(`${reference.tokenSetId ?? ""}:${reference.tokenId}`)
    ?? (reference.tokenSetId === undefined ? tokenDefinitions.get(reference.tokenId) : undefined);
}

function hasToken(node: IrNode | undefined, property: string, ...aliases: readonly string[]): boolean {
  return node?.tokenReferences?.some((reference) => [property, ...aliases].includes(reference.property) && tokenDefinition(reference) !== undefined) === true;
}

function tokenValue(node: IrNode | undefined, property: string, fallback: string, ...aliases: readonly string[]): string {
  const reference = node?.tokenReferences?.find((candidate) => [property, ...aliases].includes(candidate.property));
  if (reference === undefined || tokenDefinition(reference) === undefined) return fallback;
  return `context.penpot.${tokenAccessPath(reference.tokenPath)}`;
}

function dartColor(hex: string, opacity: number): string {
  const alpha = Math.round(Math.min(Math.max(opacity, 0), 1) * 255).toString(16).padStart(2, "0");
  return `Color(0x${alpha}${hex.slice(1)})`;
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


export function tokenRuntimeType(token: IrToken): string {
  switch (token.type) {
    case "color": return "Color";
    case "font-family": return "String";
    case "font-weight": return "FontWeight";
    case "text-case": return "String";
    case "text-decoration": return "TextDecoration";
    case "typography": return "TextStyle";
    case "shadow": return "List<BoxShadow>";
    case "gradient": return "Gradient";
    case "duration": return "Duration";
    case "unknown": return "Object";
    default: return "double";
  }
}

export function tokenDartLiteral(token: IrToken): string | undefined {
  switch (token.type) {
    case "color": return typeof token.value === "string" ? tokenColor(token.value) : undefined;
    case "font-family": return typeof token.value === "string" ? stringLiteral(token.value) : undefined;
    case "font-weight": return typeof token.value === "number" && Number.isFinite(token.value) ? fontWeight(token.value) : undefined;
    case "text-case": return typeof token.value === "string" ? stringLiteral(token.value) : undefined;
    case "text-decoration": return typeof token.value === "string" ? token.value === "underline" ? "TextDecoration.underline" : token.value === "line-through" || token.value === "strike-through" ? "TextDecoration.lineThrough" : "TextDecoration.none" : undefined;
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
  const typography = value as { fontFamily?: string; fontFamilyFallbacks?: readonly string[]; fontSize?: number; fontWeight?: number; lineHeight?: number; letterSpacing?: number; color?: string };
  const properties = [
    ...(typeof typography.fontFamily === "string" ? [`fontFamily: ${stringLiteral(typography.fontFamily)}`] : []),
    ...(typography.fontFamilyFallbacks === undefined || typography.fontFamilyFallbacks.length === 0 ? [] : [`fontFamilyFallback: const [${typography.fontFamilyFallbacks.map(stringLiteral).join(", ")}]`]),
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
