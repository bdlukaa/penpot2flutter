import type { Diagnostic, GeneratedFile, IrToken, IrTokenSet, IrTokenTheme } from "../shared/ir.js";
import { tokenDartLiteral, tokenRuntimeType } from "./flutter-generator.js";
import { dartClassSegment, dartMemberName } from "./token-naming.js";
import { createTokenResolverIndexes, resolveTokenSets } from "./token-registry.js";

interface TokenTree {
  readonly path: readonly string[];
  readonly children: Map<string, TokenTree>;
  token?: IrToken;
}

export function validateFlutterThemeGeneration(
  tokens: readonly IrToken[],
  themes: readonly IrTokenTheme[],
  files: readonly GeneratedFile[],
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const hasTokenFields = files.some((file) => file.path === "theme/penpot_tokens.dart")
    && files.some((file) => file.path === "theme/penpot_token_namespaces.dart");
  const hasThemes = files.some((file) => file.path === "theme/penpot_themes.dart" && file.source.includes("ThemeData buildPenpotTheme"));
  if (tokens.length > 0 && !hasTokenFields) {
    diagnostics.push({ severity: "error", sourceId: "token-catalog", code: "TOKEN_GENERATION_MISMATCH", message: `The catalog contains ${tokens.length} token definitions, but no typed Flutter token fields were generated.` });
    diagnostics.push({ severity: "error", sourceId: "token-catalog", code: "THEME_EXTENSION_GENERATION_FAILED", message: "PenpotTokens ThemeExtension generation failed." });
  }
  if (themes.length > 0 && !hasThemes) {
    diagnostics.push({ severity: "error", sourceId: "token-catalog", code: "TOKEN_THEME_GENERATION_MISMATCH", message: `The catalog contains ${themes.length} themes, but no Flutter ThemeData builder was generated.` });
    diagnostics.push({ severity: "error", sourceId: "token-catalog", code: "THEME_DATA_GENERATION_FAILED", message: "Penpot ThemeData generation failed." });
  }
  return diagnostics;
}

export function generateFlutterThemeFiles(
  tokens: readonly IrToken[],
  sets: readonly IrTokenSet[],
  themes: readonly IrTokenTheme[],
): GeneratedFile[] {
  if (tokens.length === 0) return [];
  const semanticTokens = uniqueSemanticTokens(tokens);
  const tree = tokenTree(semanticTokens);
  const groups = themeGroups(themes);
  return [
    { path: "theme/penpot_token_namespaces.dart", source: generateNamespaces(tree) },
    { path: "theme/penpot_tokens.dart", source: generateExtension(tree) },
    { path: "theme/penpot_themes.dart", source: generateThemes(tree, tokens, sets, themes, groups) },
    { path: "theme/penpot_theme_extensions.dart", source: generateContextExtension() },
    { path: "penpot.dart", source: generateExports() },
    { path: "penpot_manifest.json", source: JSON.stringify({ tokens: { sets: sets.length, definitions: tokens.length, themes: themes.length, groups: [...groups.keys()], generatedThemeNames: themes.map((theme) => `${theme.group} / ${theme.name}`) } }, null, 2) + "\n" },
  ];
}

function uniqueSemanticTokens(tokens: readonly IrToken[]): readonly IrToken[] {
  const byName = new Map<string, IrToken>();
  for (const token of tokens) byName.set(token.sourceName, token);
  return [...byName.values()].sort((left, right) => left.sourceName.localeCompare(right.sourceName));
}

function tokenTree(tokens: readonly IrToken[]): TokenTree {
  const root: TokenTree = { path: [], children: new Map() };
  for (const token of tokens) {
    let node = root;
    for (const segment of token.path) {
      let child = node.children.get(segment);
      if (child === undefined) {
        child = { path: [...node.path, segment], children: new Map() };
        node.children.set(segment, child);
      }
      node = child;
    }
    node.token = token;
  }
  return root;
}

function generateNamespaces(root: TokenTree): string {
  const nodes: TokenTree[] = [];
  const collect = (node: TokenTree): void => {
    for (const child of sortedChildren(node)) collect(child);
    if (node.path.length > 0 && node.children.size > 0) nodes.push(node);
  };
  collect(root);
  return [
    "import 'package:flutter/material.dart';",
    "",
    ...nodes.flatMap((node) => namespaceClass(node)),
  ].join("\n");
}

function namespaceClass(node: TokenTree): string[] {
  const fields = sortedChildren(node);
  const className = namespaceClassName(node.path);
  return [
    "@immutable",
    `class ${className} {`,
    `  const ${className}({`,
    ...fields.map((child) => `    required this.${member(last(child.path))},`),
    "  });",
    "",
    ...fields.map((child) => `  final ${nodeType(child)} ${member(last(child.path))};`),
    "}",
    "",
  ];
}

function generateExtension(root: TokenTree): string {
  const fields = sortedChildren(root);
  return [
    "import 'package:flutter/material.dart';",
    "",
    "import 'penpot_token_namespaces.dart';",
    "",
    "@immutable",
    "class PenpotTokens extends ThemeExtension<PenpotTokens> {",
    "  const PenpotTokens({",
    ...fields.map((child) => `    required this.${member(child.path[0])},`),
    "  });",
    "",
    ...fields.map((child) => `  final ${nodeType(child)} ${member(child.path[0])};`),
    "",
    "  factory PenpotTokens.fromMap(Map<String, Object> values) => PenpotTokens(",
    ...fields.map((child) => `    ${member(child.path[0])}: ${constructNode(child)},`),
    "  );",
    "",
    "  @override",
    "  PenpotTokens copyWith({",
    ...fields.map((child) => `    ${nodeType(child)}? ${member(child.path[0])},`),
    "  }) => PenpotTokens(",
    ...fields.map((child) => `    ${member(child.path[0])}: ${member(child.path[0])} ?? this.${member(child.path[0])},`),
    "  );",
    "",
    "  @override",
    "  PenpotTokens lerp(covariant PenpotTokens? other, double t) => other == null || t < 0.5 ? this : other;",
    "}",
    "",
  ].join("\n");
}

function constructNode(node: TokenTree): string {
  if (node.children.size === 0) return `values[${dartString(node.token!.sourceName)}] as ${tokenRuntimeType(node.token!)}`;
  return `${namespaceClassName(node.path)}(${sortedChildren(node).map((child) => `${member(last(child.path))}: ${constructNode(child)}`).join(", ")})`;
}

function generateThemes(
  root: TokenTree,
  tokens: readonly IrToken[],
  sets: readonly IrTokenSet[],
  themes: readonly IrTokenTheme[],
  groups: ReadonlyMap<string, readonly IrTokenTheme[]>,
): string {
  const resolverIndexes = createTokenResolverIndexes(tokens);
  const tokenByIdentity = resolverIndexes.definitionsByIdentity;
  const unscopedTokenById = resolverIndexes.unscopedDefinitionsById;
  const baseSetIds = sets.filter((set) => set.active).map((set) => set.id);
  const resolvedBySet = new Map(sets.map((set) => [set.id, resolveTokenSets(tokens, sets, new Set([...baseSetIds, set.id]), resolverIndexes).tokens]));
  const semanticTokens = uniqueSemanticTokens(tokens);
  const groupEntries = [...groups.entries()];
  const enumNames = uniqueNames(groupEntries.map(([group]) => `Penpot${dartClassSegment(group || "Theme")}`));
  const parameterNames = uniqueNames(groupEntries.map(([group]) => member(group || "theme")));
  const themeMembers = new Map(themes.map((theme) => [theme.id, member(theme.name)]));
  const colorSchemeMappings = materialMappings(semanticTokens, "color", "color", ["primary", "onPrimary", "primaryContainer", "onPrimaryContainer", "secondary", "onSecondary", "secondaryContainer", "onSecondaryContainer", "tertiary", "onTertiary", "tertiaryContainer", "onTertiaryContainer", "error", "onError", "errorContainer", "onErrorContainer", "surface", "onSurface", "outline", "outlineVariant", "shadow", "scrim", "inverseSurface", "onInverseSurface", "inversePrimary", "surfaceTint"]);
  const textThemeMappings = materialMappings(semanticTokens, "typography", "typography", ["displayLarge", "displayMedium", "displaySmall", "headlineLarge", "headlineMedium", "headlineSmall", "titleLarge", "titleMedium", "titleSmall", "bodyLarge", "bodyMedium", "bodySmall", "labelLarge", "labelMedium", "labelSmall"]);
  const lines = [
    "import 'package:flutter/material.dart';",
    "",
    "import 'penpot_tokens.dart';",
    "",
    ...groupEntries.flatMap(([, groupedThemes], index) => [
      `enum ${enumNames[index]} {`,
      ...groupedThemes.map((theme) => `  ${themeMembers.get(theme.id)},`),
      "}",
      "",
    ]),
    "final Map<String, Object> _fallbackValues = {",
    ...semanticTokens.map((token) => `  ${dartString(token.sourceName)}: ${tokenDartLiteral(token) ?? fallbackLiteral(token)},`),
    "};",
    "",
    "final Map<String, Map<String, _TokenDefinition>> _setValues = {",
    ...sets.flatMap((set) => [
      `  ${dartString(set.id)}: {`,
      ...set.tokenIds.flatMap((id) => {
        const token = tokenByIdentity.get(`${set.id}:${id}`) ?? unscopedTokenById.get(id);
        if (token === undefined) return [];
        const resolved = resolvedBySet.get(set.id)?.get(token.sourceName);
        const resolvedToken = resolved?.id === token.id && resolved?.setId === token.setId && resolved.value !== token.value ? { ...token, value: resolved.value } : token;
        return [`    ${dartString(token.sourceName)}: _TokenDefinition(${tokenDartLiteral(resolvedToken) ?? fallbackLiteral(resolvedToken)}, ${wholeAlias(token.rawValue) === undefined ? "null" : dartString(wholeAlias(token.rawValue)!)}),`];
      }),
      "  },",
    ]),
    "};",
    "",
    "const _setOrder = <String>[",
    ...sets.map((set) => `  ${dartString(set.id)},`),
    "];",
    "",
    "Map<String, Object> _resolveValues(Iterable<String> selectedSets) {",
    "  final selected = selectedSets.toSet();",
    "  final definitions = <String, _TokenDefinition>{};",
    "  for (final setId in _setOrder) {",
    "    if (selected.contains(setId)) definitions.addAll(_setValues[setId]!);",
    "  }",
    "  final values = Map<String, Object>.of(_fallbackValues);",
    "  final resolving = <String>{};",
    "  Object resolve(String name) {",
    "    final definition = definitions[name];",
    "    if (definition == null) return values[name]!;",
    "    if (!resolving.add(name)) throw StateError('Penpot token alias cycle at $name');",
    "    final value = definition.alias == null ? definition.value : resolve(definition.alias!);",
    "    resolving.remove(name);",
    "    return values[name] = value;",
    "  }",
    "  for (final name in definitions.keys) resolve(name);",
    "  return values;",
    "}",
    "",
    "ThemeData buildPenpotTheme({",
    ...groupEntries.map(([, groupedThemes], index) => `  ${enumNames[index]} ${parameterNames[index]} = ${enumNames[index]}.${themeMembers.get(groupedThemes.find((theme) => theme.active)?.id ?? groupedThemes[0].id)},`),
    "}) {",
    "  final setIds = <String>{",
    ...sets.filter((set) => set.active).map((set) => `    ${dartString(set.id)},`),
    "  };",
    ...groupEntries.map(([, groupedThemes], index) => `  setIds.addAll(switch (${parameterNames[index]}) {\n${groupedThemes.map((theme) => `    ${enumNames[index]}.${themeMembers.get(theme.id)} => const [${theme.activeSetIds.map(dartString).join(", ")}],`).join("\n")}\n  });`),
    "  final values = _resolveValues(setIds);",
    "  final tokens = PenpotTokens.fromMap(values);",
    "  return ThemeData(",
    ...(colorSchemeMappings.length === 0 ? [] : ["    colorScheme: ThemeData().colorScheme.copyWith(", ...colorSchemeMappings.map(({ role, token }) => `      ${role}: values[${dartString(token.sourceName)}] as Color,`), "    ),"]),
    ...(textThemeMappings.length === 0 ? [] : ["    textTheme: ThemeData().textTheme.copyWith(", ...textThemeMappings.map(({ role, token }) => `      ${role}: values[${dartString(token.sourceName)}] as TextStyle,`), "    ),"]),
    "    extensions: [tokens],",
    "  );",
    "}",
    "",
    ...themes.map((theme) => {
      const groupIndex = groupEntries.findIndex(([group]) => group === theme.group);
      return `final ThemeData ${member(`penpot ${theme.group} ${theme.name} theme`)} = buildPenpotTheme(${parameterNames[groupIndex]}: ${enumNames[groupIndex]}.${themeMembers.get(theme.id)});`;
    }),
    "",
    "class _TokenDefinition {",
    "  const _TokenDefinition(this.value, this.alias);",
    "  final Object value;",
    "  final String? alias;",
    "}",
    "",
  ];
  void root;
  return lines.join("\n");
}

function generateContextExtension(): string {
  return [
    "import 'package:flutter/material.dart';",
    "",
    "import 'penpot_tokens.dart';",
    "",
    "extension PenpotThemeContext on BuildContext {",
    "  PenpotTokens get penpot {",
    "    final tokens = Theme.of(this).extension<PenpotTokens>();",
    "    assert(tokens != null, 'PenpotTokens is missing from ThemeData.extensions.');",
    "    return tokens!;",
    "  }",
    "}",
    "",
  ].join("\n");
}

function generateExports(): string {
  return [
    "export 'theme/penpot_theme_extensions.dart';",
    "export 'theme/penpot_token_namespaces.dart';",
    "export 'theme/penpot_tokens.dart';",
    "export 'theme/penpot_themes.dart';",
    "",
  ].join("\n");
}

function materialMappings(
  tokens: readonly IrToken[],
  namespace: string,
  type: IrToken["type"],
  roles: readonly string[],
): readonly { readonly role: string; readonly token: IrToken }[] {
  const byName = new Map(tokens.map((token) => [token.sourceName.toLowerCase(), token]));
  return roles.flatMap((role) => {
    const token = byName.get(`${namespace}.${role}`.toLowerCase());
    return token?.type === type ? [{ role, token }] : [];
  });
}

function themeGroups(themes: readonly IrTokenTheme[]): ReadonlyMap<string, readonly IrTokenTheme[]> {
  const groups = new Map<string, IrTokenTheme[]>();
  for (const theme of themes) groups.set(theme.group, [...(groups.get(theme.group) ?? []), theme]);
  return groups;
}

function sortedChildren(node: TokenTree): readonly TokenTree[] {
  return [...node.children.values()].sort((left, right) => last(left.path).localeCompare(last(right.path)));
}

function last(path: readonly string[]): string {
  return path[path.length - 1]!;
}

function nodeType(node: TokenTree): string {
  return node.children.size > 0 ? namespaceClassName(node.path) : tokenRuntimeType(node.token!);
}

function namespaceClassName(path: readonly string[]): string {
  return `Penpot${path.map(dartClassSegment).join("")}Tokens`;
}

export function tokenAccessPath(path: readonly string[]): string {
  return path.map(member).join(".");
}

function member(value: string): string {
  return dartMemberName(value, "token");
}


function uniqueNames(values: readonly string[]): readonly string[] {
  const used = new Set<string>();
  return values.map((value) => {
    let result = value;
    let suffix = 2;
    while (used.has(result)) result = `${value}${suffix++}`;
    used.add(result);
    return result;
  });
}

function wholeAlias(value: unknown): string | undefined {
  return typeof value === "string" ? /^\{([^{}]+)\}$/.exec(value.trim())?.[1].trim() : undefined;
}

function fallbackLiteral(token: IrToken): string {
  switch (tokenRuntimeType(token)) {
    case "Color": return "const Color(0x00000000)";
    case "String": return "''";
    case "FontWeight": return "FontWeight.normal";
    case "TextStyle": return "const TextStyle()";
    case "List<BoxShadow>": return "const <BoxShadow>[]";
    case "TextDecoration": return "TextDecoration.none";
    case "Duration": return "Duration.zero";
    case "Object": return dartString(JSON.stringify(token.rawValue ?? token.value));
    default: return "0.0";
  }
}

function dartString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\$/g, "\\$")}'`;
}
