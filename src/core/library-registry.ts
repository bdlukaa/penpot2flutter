import type {
  Diagnostic,
  IrAsset,
  IrComponentDefinition,
  IrLibrary,
  IrLibraryScope,
  IrLibrarySource,
  IrToken,
  IrTokenSet,
} from "../shared/ir.js";

interface LibraryRegistryInput {
  readonly sources: readonly IrLibrarySource[];
  readonly components: readonly IrComponentDefinition[];
  readonly tokens: readonly IrToken[];
  readonly tokenSets: readonly IrTokenSet[];
  readonly assets: readonly IrAsset[];
}

export interface LibraryRegistryResult {
  readonly libraries: readonly IrLibrary[];
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Creates the serializable library dependency graph after all compiler inputs
 * have been normalized. Library IDs, never display names, define identity.
 */
export function buildIrLibraries(input: LibraryRegistryInput): LibraryRegistryResult {
  const diagnostics: Diagnostic[] = [];
  const sources = new Map<string, IrLibrarySource>();
  const componentById = new Map(input.components.map((component) => [component.id, component]));
  const ensure = (id: string, scope: IrLibraryScope = "shared"): IrLibrarySource => {
    const existing = sources.get(id);
    if (existing !== undefined) return existing;
    const source = { id, name: `Library ${id}`, scope };
    sources.set(id, source);
    return source;
  };

  for (const source of input.sources) sources.set(source.id, source);
  for (const component of input.components) {
    if (component.sourceLibraryId !== undefined) ensure(component.sourceLibraryId, component.sourceLibraryScope ?? "shared");
  }
  for (const token of input.tokens) {
    if (token.sourceLibraryId !== undefined) ensure(token.sourceLibraryId, token.sourceLibraryScope ?? "shared");
  }
  for (const asset of input.assets) {
    if (asset.sourceLibraryId !== undefined) ensure(asset.sourceLibraryId, asset.sourceLibraryScope ?? "shared");
  }

  const sourceList = [...sources.values()].sort((left, right) => left.id.localeCompare(right.id));
  diagnoseNames(sourceList, diagnostics);
  const libraries = sourceList.map((source): IrLibrary => {
    const componentIds = input.components
      .filter((component) => component.sourceLibraryId === source.id)
      .map((component) => component.id)
      .sort();
    const tokenSetIds = input.tokenSets
      .filter((set) => set.sourceLibraryId === source.id)
      .map((set) => set.id)
      .sort();
    const assetIds = input.assets
      .filter((asset) => asset.sourceLibraryId === source.id)
      .map((asset) => asset.id)
      .sort();
    const dependencies = new Set<string>();
    for (const componentId of componentIds) {
      const component = componentById.get(componentId)!;
      for (const dependencyId of component.dependencies) {
        const dependency = componentById.get(dependencyId);
        if (dependency?.sourceLibraryId !== undefined && dependency.sourceLibraryId !== source.id) dependencies.add(dependency.sourceLibraryId);
      }
    }
    return {
      ...source,
      components: componentIds,
      tokenSets: tokenSetIds,
      assets: assetIds,
      dependencies: [...dependencies].sort(),
    };
  });
  diagnoseCycles(libraries, diagnostics);
  return { libraries, diagnostics };
}

export function libraryModuleName(library: Pick<IrLibrarySource, "id" | "name">): string {
  const words = library.name
    .normalize("NFKD")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
  return words.join("_") || library.id.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase() || "library";
}

function diagnoseNames(libraries: readonly IrLibrarySource[], diagnostics: Diagnostic[]): void {
  const names = new Map<string, IrLibrarySource>();
  for (const library of libraries) {
    const moduleName = libraryModuleName(library);
    const previous = names.get(moduleName);
    if (previous !== undefined && previous.id !== library.id) {
      diagnostics.push({
        severity: "error",
        sourceId: library.id,
        code: "LIBRARY_NAME_COLLISION",
        message: `Libraries "${previous.name}" (${previous.id}) and "${library.name}" (${library.id}) normalize to the same Flutter module name "${moduleName}".`,
      });
    } else {
      names.set(moduleName, library);
    }
  }
}

function diagnoseCycles(libraries: readonly IrLibrary[], diagnostics: Diagnostic[]): void {
  const byId = new Map(libraries.map((library) => [library.id, library]));
  const visiting: string[] = [];
  const visited = new Set<string>();
  const reported = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    const cycleStart = visiting.indexOf(id);
    if (cycleStart >= 0) {
      const cycle = [...visiting.slice(cycleStart), id];
      const key = cycle.join("→");
      if (!reported.has(key)) {
        reported.add(key);
        diagnostics.push({
          severity: "error",
          sourceId: id,
          code: "LIBRARY_DEPENDENCY_CYCLE",
          message: `Library dependency cycle: ${cycle.join(" → ")}. Shared modules are emitted once; resolve the circular component dependency before use.`,
        });
      }
      return;
    }
    const library = byId.get(id);
    if (library === undefined) return;
    visiting.push(id);
    library.dependencies.forEach(visit);
    visiting.pop();
    visited.add(id);
  };
  libraries.forEach((library) => visit(library.id));
}
