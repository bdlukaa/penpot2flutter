import type { Diagnostic, IrInteraction, IrInteractionKind, IrInteractionTrigger, IrNode, IrOverlayOptions, IrPrototypeAnimation, IrPrototypeMetadata } from "../shared/ir.js";

export interface PenpotSourceScreenMetadata {
  readonly role?: "screen" | "composition" | "component-catalog" | "documentation" | "overlay";
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

export interface PenpotPrototypeDestinationSource {
  readonly id: string;
  readonly name: string;
}

export interface PenpotPrototypeSource {
  readonly destinations?: readonly PenpotPrototypeDestinationSource[];
  readonly flows: readonly PenpotSourceFlow[];
  readonly interactions: readonly PenpotSourceInteraction[];
}

export interface ScreenCandidate {
  readonly id: string;
  readonly name: string;
  readonly root: IrNode;
  readonly metadata?: PenpotSourceScreenMetadata;
}

export interface PrototypeMetadataAnalysis {
  readonly metadata?: IrPrototypeMetadata;
  readonly diagnostics: readonly Diagnostic[];
}

/** Preserves explicit prototype data without selecting an application router. */
export function analyzePrototypeMetadata(candidates: readonly ScreenCandidate[], prototype?: PenpotPrototypeSource): PrototypeMetadataAnalysis {
  if (prototype === undefined) return { diagnostics: [] };
  const diagnostics: Diagnostic[] = [];
  const destinationNames = new Map<string, string>();
  for (const destination of prototype.destinations ?? []) destinationNames.set(destination.id, destination.name);
  for (const candidate of candidates) {
    if (destinationNames.has(candidate.id) && destinationNames.get(candidate.id) !== candidate.name) {
      diagnostics.push(diagnostic(candidate.id, "PROTOTYPE_DESTINATION_DUPLICATE_ID", `More than one prototype destination uses stable id "${candidate.id}"; the page destination name was retained.`));
    } else {
      destinationNames.set(candidate.id, candidate.name);
    }
  }

  for (const flow of prototype.flows) {
    if (!destinationNames.has(flow.startingBoardId)) {
      diagnostics.push(diagnostic(flow.startingBoardId, "FLOW_ENTRY_UNRESOLVED", `Prototype flow "${flow.name}" starts at unavailable board "${flow.startingBoardId}".`));
      destinationNames.set(flow.startingBoardId, flow.startingBoardId);
    }
  }
  for (const interaction of prototype.interactions) {
    const targetId = interaction.action.destinationBoardId;
    if (targetId !== undefined && !destinationNames.has(targetId)) {
      diagnostics.push(diagnostic(interaction.ownerShapeId, "PROTOTYPE_DESTINATION_UNRESOLVED", `Prototype interaction "${interaction.id}" targets unavailable board "${targetId}". The stable target id was preserved.`));
      destinationNames.set(targetId, targetId);
    }
  }

  const interactions = dedupeInteractions(prototype.interactions)
    .map(irInteractionFromSource)
    .sort((left, right) => left.id.localeCompare(right.id));
  const flows = [...prototype.flows]
    .map((flow) => ({ id: flow.id, name: flow.name, destinationId: flow.startingBoardId }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const destinations = [...destinationNames]
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const overlayDestinationIds = [...new Set(interactions
    .filter((interaction) => interaction.kind === "open-overlay" || interaction.kind === "toggle-overlay")
    .flatMap((interaction) => interaction.targetId === undefined ? [] : [interaction.targetId]))]
    .sort();

  if (interactions.length === 0 && flows.length === 0) return { diagnostics };
  return { metadata: { destinations, interactions, flows, overlayDestinationIds }, diagnostics };
}

/** @deprecated Use analyzePrototypeMetadata. */
export const analyzeScreenNavigation = analyzePrototypeMetadata;

export function irInteractionFromSource(interaction: PenpotSourceInteraction): IrInteraction {
  return {
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
  };
}

function dedupeInteractions(interactions: readonly PenpotSourceInteraction[]): readonly PenpotSourceInteraction[] {
  const unique = new Map<string, PenpotSourceInteraction>();
  for (const interaction of interactions) if (!unique.has(interaction.id)) unique.set(interaction.id, interaction);
  return [...unique.values()];
}

function diagnostic(sourceId: string, code: string, message: string): Diagnostic {
  return { severity: "warning", sourceId, code, message };
}
