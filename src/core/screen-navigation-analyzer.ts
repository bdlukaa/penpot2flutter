import type { Diagnostic, IrInteraction, IrInteractionKind, IrInteractionTrigger, IrNavigationEdge, IrNavigationGraph, IrNode, IrOverlayOptions, IrPrototypeAnimation, IrScreen, IrRouterStrategy } from "../shared/ir.js";

export interface PenpotSourceScreenMetadata {
  readonly role?: "screen" | "component-catalog" | "documentation" | "overlay";
  readonly routeName?: string;
}

export interface PenpotSourcePrototypeAction {
  readonly type: IrInteractionKind;
  readonly destinationBoardId?: string;
  readonly url?: string;
  readonly preserveScrollPosition?: boolean;
  readonly animation?: IrPrototypeAnimation;
  readonly overlay?: IrOverlayOptions;
}

export interface PenpotSourceInteraction {
  readonly id: string;
  readonly ownerShapeId: string;
  readonly trigger: IrInteractionTrigger;
  readonly delayMs?: number;
  readonly action: PenpotSourcePrototypeAction;
}

export interface PenpotSourceFlow {
  readonly id: string;
  readonly name: string;
  readonly startingBoardId: string;
}

export interface PenpotPrototypeSource {
  readonly flows: readonly PenpotSourceFlow[];
  readonly interactions: readonly PenpotSourceInteraction[];
  readonly routerStrategy?: IrRouterStrategy;
}

export interface ScreenCandidate {
  readonly id: string;
  readonly name: string;
  readonly root: IrNode;
  readonly metadata?: PenpotSourceScreenMetadata;
}

export interface ScreenNavigationAnalysis {
  readonly graph?: IrNavigationGraph;
  readonly diagnostics: readonly Diagnostic[];
}

export function analyzeScreenNavigation(candidates: readonly ScreenCandidate[], prototype?: PenpotPrototypeSource): ScreenNavigationAnalysis {
  if (prototype === undefined) return { diagnostics: [] };
  const diagnostics: Diagnostic[] = [];
  const byId = new Map<string, ScreenCandidate>();
  for (const candidate of candidates) {
    if (byId.has(candidate.id)) {
      diagnostics.push(diagnostic(candidate.id, "SCREEN_DUPLICATE_ID", `More than one board uses the stable screen id "${candidate.id}".`));
      continue;
    }
    byId.set(candidate.id, candidate);
  }

  const ownerBoards = new Map<string, string>();
  for (const candidate of candidates) mapNodeOwners(candidate.root, candidate.id, ownerBoards);
  const overlayIds = new Set<string>();
  const screenIds = new Set<string>();
  for (const flow of prototype.flows) {
    if (byId.has(flow.startingBoardId)) screenIds.add(flow.startingBoardId);
    else diagnostics.push(diagnostic(flow.startingBoardId, "FLOW_ENTRY_UNRESOLVED", `Prototype flow "${flow.name}" starts at unavailable board "${flow.startingBoardId}".`));
  }
  for (const interaction of prototype.interactions) {
    const destination = interaction.action.destinationBoardId;
    if (destination === undefined) continue;
    if (!byId.has(destination)) {
      diagnostics.push(diagnostic(interaction.ownerShapeId, "NAVIGATION_TARGET_UNRESOLVED", `Prototype interaction "${interaction.id}" targets unavailable board "${destination}".`));
      continue;
    }
    if (interaction.action.type === "open-overlay" || interaction.action.type === "toggle-overlay") overlayIds.add(destination);
    else if (interaction.action.type === "navigate") screenIds.add(destination);
  }
  for (const candidate of candidates) {
    if (candidate.metadata?.role === "screen") screenIds.add(candidate.id);
    if (candidate.metadata?.role === "overlay") overlayIds.add(candidate.id);
  }
  for (const overlayId of overlayIds) screenIds.delete(overlayId);

  const screens = [...screenIds]
    .map((id) => byId.get(id))
    .filter((candidate): candidate is ScreenCandidate => candidate !== undefined)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((candidate) => screenFor(candidate, prototype.interactions, ownerBoards));
  const screenById = new Map(screens.map((screen) => [screen.id, screen]));
  const routes = new Map<string, string>();
  const routedScreens = screens.map((screen) => {
    const routeName = routeFor(screen, byId.get(screen.id)?.metadata?.routeName, routes, diagnostics);
    return { ...screen, routeName };
  });
  const edges = edgesFor(routedScreens, prototype.interactions, ownerBoards, diagnostics);
  const flowEntries = prototype.flows
    .filter((flow) => screenById.has(flow.startingBoardId))
    .map((flow) => ({ id: flow.id, name: flow.name, screenId: flow.startingBoardId }))
    .sort((left, right) => left.id.localeCompare(right.id));

  if (routedScreens.length === 0 && candidates.length > 0) {
    diagnostics.push(diagnostic(candidates[0].id, "SCREEN_CLASSIFICATION_UNCERTAIN", "No board has prototype or explicit screen metadata, so no application screen was generated."));
  }
  return {
    ...(routedScreens.length === 0 ? {} : {
      graph: {
        screens: routedScreens,
        edges,
        flowEntries,
        overlays: [...overlayIds].sort().flatMap((id) => {
          const overlay = byId.get(id);
          return overlay === undefined ? [] : [{ ...screenFor(overlay, prototype.interactions, ownerBoards) }];
        }),
        routerStrategy: prototype.routerStrategy ?? "navigator",
      },
    }),
    diagnostics,
  };
}

function screenFor(candidate: ScreenCandidate, interactions: readonly PenpotSourceInteraction[], ownerBoards: ReadonlyMap<string, string>): IrScreen {
  return {
    id: candidate.id,
    name: candidate.name,
    root: candidate.root,
    interactions: dedupeInteractions(interactions
      .filter((interaction) => ownerBoards.get(interaction.ownerShapeId) === candidate.id))
      .map((interaction): IrInteraction => ({
        id: interaction.id,
        sourceNodeId: interaction.ownerShapeId,
        trigger: interaction.trigger,
        kind: interaction.action.type,
        ...(interaction.action.destinationBoardId === undefined ? {} : { targetId: interaction.action.destinationBoardId }),
        ...(interaction.delayMs === undefined ? {} : { delayMs: interaction.delayMs }),
        ...(interaction.action.url === undefined ? {} : { url: interaction.action.url }),
        ...(interaction.action.preserveScrollPosition === undefined ? {} : { preserveScrollPosition: interaction.action.preserveScrollPosition }),
        ...(interaction.action.animation === undefined ? {} : { animation: interaction.action.animation }),
        ...(interaction.action.overlay === undefined ? {} : { overlay: interaction.action.overlay }),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function dedupeInteractions(interactions: readonly PenpotSourceInteraction[]): readonly PenpotSourceInteraction[] {
  const unique = new Map<string, PenpotSourceInteraction>();
  for (const interaction of interactions) if (!unique.has(interaction.id)) unique.set(interaction.id, interaction);
  return [...unique.values()];
}

function edgesFor(screens: readonly IrScreen[], interactions: readonly PenpotSourceInteraction[], ownerBoards: ReadonlyMap<string, string>, diagnostics: Diagnostic[]): readonly IrNavigationEdge[] {
  const screenIds = new Set(screens.map((screen) => screen.id));
  return interactions.flatMap((interaction) => {
    const fromScreenId = ownerBoards.get(interaction.ownerShapeId);
    if (fromScreenId === undefined || !screenIds.has(fromScreenId)) return [];
    const targetId = interaction.action.destinationBoardId;
    if ((interaction.action.type === "navigate" || interaction.action.type === "back") && targetId !== undefined && !screenIds.has(targetId)) {
      diagnostics.push(diagnostic(interaction.ownerShapeId, "NAVIGATION_TARGET_UNRESOLVED", `Prototype interaction "${interaction.id}" targets a board that is not a generated screen.`));
      return [];
    }
    return [{ id: interaction.id, fromScreenId, ...(targetId === undefined ? {} : { toScreenId: targetId }), interactionId: interaction.id, kind: interaction.action.type }];
  }).sort((left, right) => left.id.localeCompare(right.id));
}

function routeFor(screen: IrScreen, explicitRoute: string | undefined, used: Map<string, string>, diagnostics: Diagnostic[]): string {
  const base = normalizeRoute(explicitRoute ?? screen.name);
  let route = base;
  if (used.has(route)) {
    route = `${base}-${shortId(screen.id)}`;
    diagnostics.push(diagnostic(screen.id, "ROUTE_NAME_COLLISION", `Route "${base}" is shared by boards "${used.get(base)}" and "${screen.id}"; the latter uses "${route}".`));
  }
  used.set(route, screen.id);
  return route;
}

function mapNodeOwners(node: IrNode, boardId: string, owners: Map<string, string>): void {
  owners.set(node.sourceId, boardId);
  if ("children" in node) node.children.forEach((child) => mapNodeOwners(child, boardId, owners));
}

function normalizeRoute(value: string): string {
  const normalized = value.trim().replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `/${normalized || "screen"}`;
}

function shortId(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.slice(-8) || "id";
}

function diagnostic(sourceId: string, code: string, message: string): Diagnostic {
  return { severity: "warning", sourceId, code, message };
}
