import type { Diagnostic, IrComponentDefinition, IrNode } from "../shared/ir.js";

export interface DesignQualitySummary {
  readonly errors: number;
  readonly warnings: number;
  readonly information: number;
  readonly recommendations: number;
}

export interface DesignQualityAnalysis {
  readonly diagnostics: readonly Diagnostic[];
  readonly summary: DesignQualitySummary;
}

/** Reports source-design opportunities without changing normalized nodes or generated Dart. */
export function analyzeDesignQuality(roots: readonly IrNode[], components: readonly IrComponentDefinition[]): DesignQualityAnalysis {
  const diagnostics: Diagnostic[] = [];
  const structures = new Map<string, IrNode[]>();
  const colors = new Map<string, IrNode[]>();
  const typography = new Map<string, IrNode[]>();

  for (const root of roots) {
    walk(root, (node) => {
      if (node.kind === "board" || node.kind === "group") {
        const fingerprint = structureFingerprint(node);
        const matches = structures.get(fingerprint) ?? [];
        matches.push(node);
        structures.set(fingerprint, matches);
      }
      if (node.style.fill !== undefined && !hasToken(node, "fill")) add(colors, `${node.style.fill.color}:${node.style.fill.opacity}`, node);
      if (node.kind === "text" && !hasToken(node, "typography")) add(typography, typographyFingerprint(node), node);
    });
    if (root.kind === "board" && root.children.length >= 3 && root.flex === undefined && root.grid === undefined) {
      diagnostics.push({
        severity: "design-recommendation",
        sourceId: root.sourceId,
        code: "SCREEN_HAS_NO_RESPONSIVE_SEMANTICS",
        message: `Screen "${root.sourceName}" uses fixed/absolute layout without responsive semantics. Add Flex, Grid, constraints, or breakpoint boards to improve generated Flutter adaptability.`,
      });
    }
  }

  for (const nodes of structures.values()) {
    if (nodes.length < 3 || nodes.some((node) => node.kind === "component-instance")) continue;
    const name = nodes[0].sourceName;
    diagnostics.push({
      severity: "design-recommendation",
      sourceId: nodes[0].sourceId,
      code: "REPEATED_STRUCTURE_NOT_COMPONENT",
      message: `"${name}" appears structurally identical ${nodes.length} times. Consider creating a Penpot component to generate one reusable Flutter widget.`,
    });
  }
  for (const [value, nodes] of colors) {
    if (nodes.length < 3) continue;
    diagnostics.push({
      severity: "design-recommendation",
      sourceId: nodes[0].sourceId,
      code: "REPEATED_COLOR_NOT_TOKEN",
      message: `Color ${value.split(":")[0]} is repeated ${nodes.length} times without a design-token reference. Consider creating a color token.`,
    });
  }
  for (const nodes of typography.values()) {
    if (nodes.length < 3) continue;
    diagnostics.push({
      severity: "design-recommendation",
      sourceId: nodes[0].sourceId,
      code: "REPEATED_TYPOGRAPHY_NOT_TOKEN",
      message: `Typography style on "${nodes[0].sourceName}" is repeated ${nodes.length} times without a typography-token reference. Consider creating a typography token.`,
    });
  }

  // Components are intentionally excluded: their repeated use is already semantic source structure.
  void components;
  const summary: DesignQualitySummary = {
    errors: diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
    warnings: diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length,
    information: diagnostics.filter((diagnostic) => diagnostic.severity === "info").length,
    recommendations: diagnostics.filter((diagnostic) => diagnostic.severity === "design-recommendation").length,
  };
  return { diagnostics, summary };
}

function walk(node: IrNode, visit: (node: IrNode) => void): void {
  visit(node);
  if ("children" in node) node.children.forEach((child) => walk(child, visit));
}

function add(map: Map<string, IrNode[]>, key: string, node: IrNode): void {
  const nodes = map.get(key) ?? [];
  nodes.push(node);
  map.set(key, nodes);
}

function hasToken(node: IrNode, property: string): boolean {
  return node.tokenReferences?.some((reference) => reference.property === property) === true;
}

function structureFingerprint(node: Extract<IrNode, { kind: "board" | "group" }>): string {
  return `${node.kind}(${node.children.map((child) => child.kind === "component-instance" ? `component:${child.componentId}` : "children" in child ? structureFingerprint(child as Extract<IrNode, { kind: "board" | "group" }>) : child.kind).join(",")})`;
}

function typographyFingerprint(node: Extract<IrNode, { kind: "text" }>): string {
  const style = node.textStyle;
  return [style.fontFamily, style.fontSize, style.fontWeight, style.fontStyle, style.lineHeight, style.letterSpacing, style.decoration, style.align].join("|");
}
