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
  readonly explicit: boolean;
}

export function analyzeResponsiveCandidates(candidates: readonly ResponsiveCandidate[]): ResponsiveAnalysis {
  if (candidates.length < 2) return { diagnostics: [] };
  const diagnostics: Diagnostic[] = [];
  const classified = candidates.map(classifyCandidate);
  if (classified.some((candidate) => candidate === undefined)) return unresolvedIfBreakpointLike(candidates);
  const resolved = classified as readonly ClassifiedCandidate[];
  const groupIds = new Set(resolved.map((candidate) => candidate.groupId));
  if (groupIds.size !== 1) return unresolvedIfBreakpointLike(candidates);

  const explicit = resolved.every((candidate) => candidate.explicit);
  const similarities = pairwiseSimilarities(resolved);
  const minimumSimilarity = Math.min(...similarities);
  if (!explicit && minimumSimilarity < 0.5) {
    return {
      diagnostics: [{
        severity: "warning",
        sourceId: resolved[0].sourceBoardId,
        code: "RESPONSIVE_GROUP_UNRESOLVED",
        message: `Boards named as responsive variants of "${resolved[0].groupName}" are not structurally similar enough to merge safely. Add explicit responsive metadata to confirm the relationship.`,
      }],
    };
  }
  if (minimumSimilarity < 0.8) {
    diagnostics.push({
      severity: "warning",
      sourceId: resolved[0].sourceBoardId,
      code: minimumSimilarity < 0.5 ? "RESPONSIVE_LAYOUT_DIVERGENCE" : "RESPONSIVE_NODE_MATCH_UNCERTAIN",
      message: `Responsive boards for "${resolved[0].groupName}" contain unmatched or structurally different nodes; each breakpoint keeps its own safe layout subtree.`,
    });
  }

  const variants = responsiveVariants(resolved, diagnostics);
  return {
    screen: {
      id: `responsive:${resolved[0].groupId}`,
      name: resolved[0].groupName,
      variants,
    },
    diagnostics,
  };
}

function classifyCandidate(candidate: ResponsiveCandidate): ClassifiedCandidate | undefined {
  if (candidate.metadata !== undefined && candidate.metadata.groupId.trim() !== "") {
    return {
      ...candidate,
      groupId: candidate.metadata.groupId,
      groupName: candidate.metadata.groupName?.trim() || candidate.metadata.groupId,
      explicit: true,
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
    explicit: false,
  };
}

function unresolvedIfBreakpointLike(candidates: readonly ResponsiveCandidate[]): ResponsiveAnalysis {
  const breakpointLike = candidates.filter((candidate) => /(?:^|[\s/_-])(mobile|tablet|desktop)$/i.test(candidate.sourceName.trim()));
  return breakpointLike.length < 2 ? { diagnostics: [] } : {
    diagnostics: [{
      severity: "warning",
      sourceId: breakpointLike[0].sourceBoardId,
      code: "RESPONSIVE_GROUP_UNRESOLVED",
      message: "Selected breakpoint-like boards do not share one exact semantic screen name and were not merged.",
    }],
  };
}

function responsiveVariants(candidates: readonly ClassifiedCandidate[], diagnostics: Diagnostic[]): readonly IrResponsiveVariant[] {
  const sorted = [...candidates].sort((left, right) => candidateOrder(left) - candidateOrder(right) || left.width - right.width || left.sourceBoardId.localeCompare(right.sourceBoardId));
  const inferred = sorted.some((candidate) => candidate.metadata?.minWidth === undefined && candidate.metadata?.maxWidth === undefined);
  if (inferred) {
    diagnostics.push({
      severity: "warning",
      sourceId: sorted[0].sourceBoardId,
      code: "RESPONSIVE_BREAKPOINT_INFERRED",
      message: `Responsive breakpoints for "${sorted[0].groupName}" were inferred from Mobile/Tablet/Desktop semantics and board widths.`,
    });
  }
  return sorted.map((candidate, index): IrResponsiveVariant => {
    const explicitMin = finiteNonNegative(candidate.metadata?.minWidth);
    const explicitMax = finiteNonNegative(candidate.metadata?.maxWidth);
    const inferredBounds = breakpointBounds(candidate, sorted, index);
    return {
      ...((explicitMin ?? inferredBounds.minWidth) === undefined ? {} : { minWidth: explicitMin ?? inferredBounds.minWidth }),
      ...((explicitMax ?? inferredBounds.maxWidth) === undefined ? {} : { maxWidth: explicitMax ?? inferredBounds.maxWidth }),
      root: candidate.root,
      sourceBoardId: candidate.sourceBoardId,
      sourceName: candidate.sourceName,
    };
  });
}

function breakpointBounds(candidate: ClassifiedCandidate, sorted: readonly ClassifiedCandidate[], index: number): { minWidth?: number; maxWidth?: number } {
  const hasMobile = sorted.some((item) => item.breakpointName === "mobile");
  const hasTablet = sorted.some((item) => item.breakpointName === "tablet");
  switch (candidate.breakpointName) {
    case "mobile": return { maxWidth: 600 };
    case "tablet": return { minWidth: hasMobile ? 600 : undefined, maxWidth: 1024 };
    case "desktop": return { minWidth: hasTablet ? 1024 : hasMobile ? 600 : undefined };
    default: {
      const previous = sorted[index - 1];
      const next = sorted[index + 1];
      return {
        ...(previous === undefined ? {} : { minWidth: midpoint(previous.width, candidate.width) }),
        ...(next === undefined ? {} : { maxWidth: midpoint(candidate.width, next.width) }),
      };
    }
  }
}

function candidateOrder(candidate: ClassifiedCandidate): number {
  const explicitMin = finiteNonNegative(candidate.metadata?.minWidth);
  if (explicitMin !== undefined) return explicitMin;
  switch (candidate.breakpointName) {
    case "mobile": return 0;
    case "tablet": return 600;
    case "desktop": return 1024;
    default: return candidate.width;
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

function midpoint(left: number, right: number): number {
  return Math.round((left + right) / 2);
}

function finiteNonNegative(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function normalizeGroupId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "screen";
}
