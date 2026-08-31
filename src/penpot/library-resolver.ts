import { componentKey } from "../shared/component-key.js";

export { componentKey } from "../shared/component-key.js";

export interface LibraryComponentLike {
  readonly id: string;
  readonly libraryId: string;
  readonly name: string;
  readonly path?: string;
  mainInstance(): unknown;
}

export interface LibraryLike {
  readonly id: string;
  readonly name: string;
  readonly components: readonly LibraryComponentLike[];
}

export interface LibrarySummaryLike {
  readonly id: string;
  readonly name: string;
}

export interface ReadOnlyLibraryContext {
  readonly local: LibraryLike;
  readonly connected: readonly LibraryLike[];
  availableLibraries(): Promise<readonly LibrarySummaryLike[]>;
}

export interface ComponentReference {
  readonly componentId?: string;
  readonly libraryId?: string;
  readonly directComponent?: LibraryComponentLike;
}

export type ComponentResolution =
  | { readonly status: "resolved"; readonly component: LibraryComponentLike; readonly library: LibraryLike; readonly source: "shape" | "local" | "connected" }
  | { readonly status: "missing-identity" }
  | { readonly status: "library-not-connected"; readonly componentId: string; readonly library: LibrarySummaryLike }
  | { readonly status: "library-unavailable"; readonly componentId: string; readonly libraryId: string }
  | { readonly status: "component-not-found"; readonly componentId: string; readonly library: LibraryLike }
  | { readonly status: "resolution-failed"; readonly componentId?: string; readonly libraryId?: string };

export class LibraryResolver {
  private readonly libraries = new Map<string, LibraryLike>();
  private readonly componentCache = new Map<string, Promise<ComponentResolution>>();
  private availableLibraries?: Promise<readonly LibrarySummaryLike[]>;

  constructor(private readonly context: ReadOnlyLibraryContext) {
    this.libraries.set(context.local.id, context.local);
    for (const library of context.connected) this.libraries.set(library.id, library);
  }

  async resolve(reference: ComponentReference): Promise<ComponentResolution> {
    if (reference.directComponent !== undefined) {
      const library = this.libraries.get(reference.directComponent.libraryId) ?? {
        id: reference.directComponent.libraryId,
        name: "Shared library",
        components: [reference.directComponent],
      };
      return { status: "resolved", component: reference.directComponent, library, source: library.id === this.context.local.id ? "local" : "shape" };
    }

    const componentId = reference.componentId;
    if (componentId === undefined || componentId === "") return { status: "missing-identity" };
    const key = componentKey(reference.libraryId, componentId);
    const cached = this.componentCache.get(key);
    if (cached !== undefined) return cached;

    const pending = this.resolveByIdentity(componentId, reference.libraryId);
    this.componentCache.set(key, pending);
    return pending;
  }

  private async resolveByIdentity(componentId: string, libraryId: string | undefined): Promise<ComponentResolution> {
    if (libraryId !== undefined && libraryId !== "") {
      const library = this.libraries.get(libraryId);
      if (library !== undefined) return componentInLibrary(componentId, library, library.id === this.context.local.id ? "local" : "connected");

      try {
        const available = await this.available();
        const summary = available.find((candidate) => candidate.id === libraryId);
        return summary === undefined
          ? { status: "library-unavailable", componentId, libraryId }
          : { status: "library-not-connected", componentId, library: summary };
      } catch {
        return { status: "resolution-failed", componentId, libraryId };
      }
    }

    const matches = [...this.libraries.values()]
      .map((library) => ({ library, component: library.components.find((candidate) => candidate.id === componentId) }))
      .filter((match): match is { library: LibraryLike; component: LibraryComponentLike } => match.component !== undefined);
    if (matches.length === 1) {
      const { library, component } = matches[0];
      return { status: "resolved", component, library, source: library.id === this.context.local.id ? "local" : "connected" };
    }
    return { status: "resolution-failed", componentId };
  }

  private available(): Promise<readonly LibrarySummaryLike[]> {
    return this.availableLibraries ??= this.context.availableLibraries();
  }
}

function componentInLibrary(componentId: string, library: LibraryLike, source: "local" | "connected"): ComponentResolution {
  const component = library.components.find((candidate) => candidate.id === componentId);
  return component === undefined ? { status: "component-not-found", componentId, library } : { status: "resolved", component, library, source };
}
