import { componentKey } from "../shared/component-key.js";

export { componentKey } from "../shared/component-key.js";

export interface VariantsLike {
  readonly id: string;
  readonly libraryId: string;
  readonly properties: readonly string[];
  currentValues(property: string): string[];
  variantComponents(): LibraryComponentLike[];
}

export interface LibraryComponentLike {
  readonly id: string;
  readonly libraryId: string;
  readonly name: string;
  readonly path?: string;
  readonly variants?: VariantsLike | null;
  readonly variantProps?: Readonly<Record<string, string>>;
  isVariant?(): boolean;
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
  connectLibrary?(libraryId: string): Promise<LibraryLike>;
}

export interface ComponentReference {
  readonly componentId?: string;
  readonly libraryId?: string;
  readonly componentName?: string;
  readonly componentPath?: string;
  readonly directComponent?: LibraryComponentLike;
}

export type ComponentResolution =
  | { readonly status: "resolved"; readonly component: LibraryComponentLike; readonly library: LibraryLike; readonly source: "shape" | "local" | "connected" | "connected-on-demand" | "relinked" }
  | { readonly status: "missing-identity" }
  | { readonly status: "library-not-connected"; readonly componentId: string; readonly library: LibrarySummaryLike }
  | { readonly status: "library-connection-failed"; readonly componentId: string; readonly libraryId: string }
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

    const pending = this.resolveByIdentity(componentId, reference);
    this.componentCache.set(key, pending);
    return pending;
  }

  private async resolveByIdentity(componentId: string, reference: ComponentReference): Promise<ComponentResolution> {
    const libraryId = reference.libraryId;
    if (libraryId !== undefined && libraryId !== "") {
      let library = this.libraries.get(libraryId);
      if (library === undefined) {
        try {
          const available = await this.available();
          const summary = available.find((candidate) => candidate.id === libraryId);
          if (summary === undefined) return { status: "library-unavailable", componentId, libraryId };
          if (this.context.connectLibrary === undefined) return { status: "library-not-connected", componentId, library: summary };
          try {
            library = await this.context.connectLibrary(libraryId);
            this.libraries.set(library.id, library);
          } catch {
            return { status: "library-connection-failed", componentId, libraryId };
          }
          return componentInLibrary(componentId, library, "connected-on-demand", reference);
        } catch {
          return { status: "resolution-failed", componentId, libraryId };
        }
      }
      return componentInLibrary(componentId, library, library.id === this.context.local.id ? "local" : "connected", reference);
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

function componentInLibrary(
  componentId: string,
  library: LibraryLike,
  source: "local" | "connected" | "connected-on-demand" | "relinked",
  reference: ComponentReference,
): ComponentResolution {
  const component = library.components.find((candidate) => candidate.id === componentId);
  if (component !== undefined) return { status: "resolved", component, library, source };

  const requestedName = reference.componentName?.trim();
  const requestedPath = reference.componentPath?.trim();
  if (requestedName === undefined || requestedName === "") return { status: "component-not-found", componentId, library };
  const displayParts = requestedName.split("/").map((part) => part.trim()).filter(Boolean);
  const nameFromDisplay = displayParts[displayParts.length - 1];
  const pathFromDisplay = displayParts.length > 1 ? displayParts.slice(0, -1).join("/") : undefined;
  const candidates = library.components.filter((candidate) => {
    const nameMatches = candidate.name === requestedName || candidate.name === nameFromDisplay || `${candidate.path} / ${candidate.name}` === requestedName;
    if (!nameMatches) return false;
    const expectedPath = requestedPath ?? pathFromDisplay;
    return expectedPath === undefined || expectedPath === "" || candidate.path === expectedPath;
  });
  if (candidates.length !== 1) return { status: "component-not-found", componentId, library };
  return { status: "resolved", component: candidates[0], library, source: "relinked" };
}
