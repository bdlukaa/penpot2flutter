import type { Diagnostic, IrNode, IrResponsiveScreen, IrResponsiveVariant } from "../shared/ir.js";

export interface ResponsiveMetadata {
  readonly groupId: string;
  readonly groupName?: string;
  readonly minWidth?: number;
  readonly maxWidth?: number;
}

export interface ResponsiveCandidate {
  readonly sourceBoardId: string;
  readonly sourceName: string;
  readonly width: number;
  readonly root: IrNode;
  readonly metadata?: ResponsiveMetadata;
}

export interface ResponsiveAnalysis {
  readonly screen?: IrResponsiveScreen;
  readonly diagnostics: readonly Diagnostic[];
}

interface ClassifiedCandidate extends ResponsiveCandidate {
  readonly groupId: string;
  readonly groupName: string;
  readonly breakpointName?: "mobile" | "tablet" | "desktop";
}

export function analyzeResponsiveCandidates(candidates: readonly ResponsiveCandidate[]): ResponsiveAnalysis {
  if (candidates.length < 2) return { diagnostics: [] };
  const diagnostics: Diagnostic[] = [];
  const classified = candidates.map(classifyCandidate);
  if (classified.some((candidate) => candidate === undefined)) return unresolvedIfBreakpointLike(candidates);
  const resolved = classified as readonly ClassifiedCandidate[];
  const groupIds = new Set(resolved.map((candidate) => candidate.groupId));
  if (groupIds.size !== 1) return unresolvedIfBreakpointLike(candidates);

  const minimumSimilarity = Math.min(...pairwiseSimilarities(resolved));
  if (minimumSimilarity < 0.8) {
    diagnostics.push({
      severity: "info",
      sourceId: resolved[0].sourceBoardId,
      code: "RESPONSIVE_LAYOUT_DIVERGENCE",
      message: `Explicit responsive boards for "${resolved[0].groupName}" contain different structures. Each design composition preserves its own source subtree.`,
    });
  }

  const variants = responsiveVariants(resolved);
  if (!hasExplicitResolverBounds(variants)) {
    diagnostics.push({
      severity: "design-recommendation",
      sourceId: resolved[0].sourceBoardId,
      code: "RESPONSIVE_BOUNDS_NOT_EXPLICIT",
      message: `Responsive family "${resolved[0].groupName}" has no complete explicit breakpoint bounds. Separate design compositions are generated; add explicit min/max metadata only if a deterministic convenience resolver is wanted.`,
    });
  }
  return {
    screen: {
      id: `responsive:${resolved[0].groupId}`,
      name: resolved[0].groupName,
      variants,
    },
    diagnostics,
  };
}

export function hasExplicitResolverBounds(variants: readonly IrResponsiveVariant[]): boolean {
  if (variants.length < 2) return false;
  const sorted = [...variants].sort(compareVariants);
  return sorted.every((variant, index) => {
    if (index === sorted.length - 1) return variant.minWidth !== undefined;
    return variant.maxWidth !== undefined || sorted[index + 1]?.minWidth !== undefined;
  });
}

function classifyCandidate(candidate: ResponsiveCandidate): ClassifiedCandidate | undefined {
  if (candidate.metadata !== undefined && candidate.metadata.groupId.trim() !== "") {
    return {
      ...candidate,
      groupId: candidate.metadata.groupId,
      groupName: candidate.metadata.groupName?.trim() || candidate.metadata.groupId,
    };
  }
  const match = candidate.sourceName.trim().match(/^(.*?)(?:\s*[/_-]\s*|\s+)(mobile|tablet|desktop)$/i);
  if (match === null || match[1].trim() === "") return undefined;
  const groupName = match[1].trim();
  return {
    ...candidate,
    groupId: normalizeGroupId(groupName),
    groupName,
    breakpointName: match[2].toLowerCase() as ClassifiedCandidate["breakpointName"],
  };
}

function unresolvedIfBreakpointLike(candidates: readonly ResponsiveCandidate[]): ResponsiveAnalysis {
  const breakpointLike = candidates.filter((candidate) => /(?:^|[\s/_-])(mobile|tablet|desktop)$/i.test(candidate.sourceName.trim()));
  return breakpointLike.length < 2 ? { diagnostics: [] } : {
    diagnostics: [{
      severity: "design-recommendation",
      sourceId: breakpointLike[0].sourceBoardId,
      code: "RESPONSIVE_GROUP_UNRESOLVED",
      message: "Selected responsive-looking boards do not share one exact semantic family name. They remain separate design compositions.",
    }],
  };
}

function responsiveVariants(candidates: readonly ClassifiedCandidate[]): readonly IrResponsiveVariant[] {
  return [...candidates]
    .sort((left, right) => breakpointOrder(left.breakpointName) - breakpointOrder(right.breakpointName) || left.width - right.width || left.sourceBoardId.localeCompare(right.sourceBoardId))
    .map((candidate): IrResponsiveVariant => ({
      ...(finiteNonNegative(candidate.metadata?.minWidth) === undefined ? {} : { minWidth: finiteNonNegative(candidate.metadata?.minWidth) }),
      ...(finiteNonNegative(candidate.metadata?.maxWidth) === undefined ? {} : { maxWidth: finiteNonNegative(candidate.metadata?.maxWidth) }),
      root: candidate.root,
      sourceBoardId: candidate.sourceBoardId,
      sourceName: candidate.sourceName,
    }));
}

function compareVariants(left: IrResponsiveVariant, right: IrResponsiveVariant): number {
  return (left.minWidth ?? Number.NEGATIVE_INFINITY) - (right.minWidth ?? Number.NEGATIVE_INFINITY)
    || left.sourceBoardId.localeCompare(right.sourceBoardId);
}

function breakpointOrder(value: ClassifiedCandidate["breakpointName"]): number {
  switch (value) {
    case "mobile": return 0;
    case "tablet": return 1;
    case "desktop": return 2;
    default: return 3;
  }
}

function pairwiseSimilarities(candidates: readonly ResponsiveCandidate[]): readonly number[] {
  const scores: number[] = [];
  for (let index = 1; index < candidates.length; index++) scores.push(structuralSimilarity(candidates[0].root, candidates[index].root));
  return scores.length === 0 ? [1] : scores;
}

function structuralSimilarity(left: IrNode, right: IrNode): number {
  const leftKeys = semanticKeys(left);
  const rightKeys = semanticKeys(right);
  const union = new Set([...leftKeys, ...rightKeys]);
  if (union.size === 0) return left.kind === right.kind ? 1 : 0;
  let intersection = 0;
  for (const key of leftKeys) if (rightKeys.has(key)) intersection++;
  return intersection / union.size;
}

function semanticKeys(root: IrNode): ReadonlySet<string> {
  const keys = new Set<string>();
  const walk = (node: IrNode, path: string): void => {
    const identity = node.kind === "component-instance"
      ? `component:${node.componentId}`
      : `node:${normalizeGroupId(node.sourceName)}:${node.kind}`;
    keys.add(`${path}:${identity}`);
    if ("children" in node) node.children.forEach((child, index) => walk(child, `${path}.${index}`));
  };
  if ("children" in root) root.children.forEach((child, index) => walk(child, String(index)));
  return keys;
}

function finiteNonNegative(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function normalizeGroupId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "composition";
}
