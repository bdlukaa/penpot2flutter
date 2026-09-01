import type { PenpotTokenInput } from "./extractor.js";
import type { Diagnostic } from "../shared/ir.js";

export interface DesignSystemMetadata {
  readonly sets: number;
  readonly themes: number;
  readonly tokens: number;
  readonly groups: readonly string[];
  readonly setNames: readonly string[];
  readonly themeNames: readonly string[];
}

export type DesignSystemIndexStatus = "idle" | "loading-metadata" | "indexing" | "ready" | "stale" | "error";

export type IndexInvalidationReason =
  | "tokens-changed"
  | "themes-changed"
  | "library-changed"
  | "manual-refresh";

export interface DesignSystemReadiness {
  readonly metadata: boolean;
  readonly selectionDependencies: boolean;
  readonly fullIndex: boolean;
}

export interface IndexProgress {
  readonly processed: number;
  readonly total: number;
  readonly phase: "tokens" | "aliases" | "themes" | "bindings";
}

export interface DesignSystemIndexState {
  readonly status: DesignSystemIndexStatus;
  readonly readiness: DesignSystemReadiness;
  readonly metadata?: DesignSystemMetadata;
  readonly progress?: IndexProgress;
  /** Development telemetry; wall time can exceed CPU time because work yields. */
  readonly timings: Readonly<Record<string, number>>;
  readonly diagnostics: readonly Diagnostic[];
  readonly error?: string;
  readonly generation: number;
}

export interface DesignSystemIndexSnapshot {
  readonly metadata: DesignSystemMetadata;
  readonly input: PenpotTokenInput;
  readonly diagnostics: readonly Diagnostic[];
}

export interface DesignSystemIndexLoader {
  /** Must only read cheap catalog fields such as set/theme names and counts. */
  readMetadata(): DesignSystemMetadata;
  /** Must yield to the host while it extracts live Penpot proxies. */
  load(context: {
    readonly isCurrent: () => boolean;
    readonly reportProgress: (progress: IndexProgress) => void;
    readonly reportTiming: (phase: string, milliseconds: number) => void;
  }): Promise<DesignSystemIndexSnapshot>;
}

type StateListener = (state: DesignSystemIndexState) => void;

type IndexBuilder<T> = (
  snapshot: DesignSystemIndexSnapshot,
  context: { readonly reportTiming: (phase: string, milliseconds: number) => void },
) => T | Promise<T>;

const emptyReadiness: DesignSystemReadiness = {
  metadata: false,
  selectionDependencies: false,
  fullIndex: false,
};

/**
 * Owns the one session-scoped design-system index job. The loader owns live
 * Penpot access; the builder owns pure normalization from a serializable snapshot.
 */
export class DesignSystemIndexManager<T> {
  private currentGeneration = 0;
  private currentJob: Promise<T | undefined> | undefined;
  private currentIndex: T | undefined;
  private listeners = new Set<StateListener>();
  private currentState: DesignSystemIndexState = {
    status: "idle",
    readiness: emptyReadiness,
    timings: {},
    diagnostics: [],
    generation: 0,
  };

  constructor(
    private readonly loader: DesignSystemIndexLoader,
    private readonly buildIndex: IndexBuilder<T>,
  ) {}

  get state(): DesignSystemIndexState {
    return this.currentState;
  }

  get index(): T | undefined {
    return this.currentIndex;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.currentState);
    return () => this.listeners.delete(listener);
  }

  ensureStarted(): Promise<T | undefined> {
    if (this.currentIndex !== undefined) return Promise.resolve(this.currentIndex);
    if (this.currentJob !== undefined) return this.currentJob;
    return this.start();
  }

  /**
   * A selection without token references can generate immediately. Token-backed
   * selections share the running index instead of starting a duplicate traversal.
   */
  ensureSelectionDependencies(tokenNames: readonly string[]): Promise<T | undefined> {
    if (tokenNames.length === 0 || this.currentState.status === "error") return Promise.resolve(this.currentIndex);
    return this.ensureStarted();
  }

  invalidate(reason: IndexInvalidationReason): void {
    this.currentGeneration++;
    this.currentJob = undefined;
    this.currentIndex = undefined;
    this.emit({
      status: "stale",
      readiness: emptyReadiness,
      metadata: this.currentState.metadata,
      timings: this.currentState.timings,
      diagnostics: this.currentState.diagnostics,
      error: reason,
      generation: this.currentGeneration,
    });
  }

  refresh(reason: IndexInvalidationReason = "manual-refresh"): Promise<T | undefined> {
    this.invalidate(reason);
    return this.start();
  }

  private start(): Promise<T | undefined> {
    const generation = ++this.currentGeneration;
    let metadata: DesignSystemMetadata | undefined;
    try {
      metadata = this.loader.readMetadata();
    } catch {
      // The loader will surface the actionable catalog diagnostic during load.
    }
    this.emit({
      status: metadata === undefined ? "loading-metadata" : "indexing",
      readiness: { ...emptyReadiness, metadata: metadata !== undefined },
      metadata,
      timings: {},
      diagnostics: [],
      generation,
    });
    const job = this.run(generation, metadata);
    this.currentJob = job;
    return job;
  }

  private async run(generation: number, metadata: DesignSystemMetadata | undefined): Promise<T | undefined> {
    try {
      const snapshot = await this.loader.load({
        isCurrent: () => generation === this.currentGeneration,
        reportProgress: (progress) => {
          if (generation !== this.currentGeneration) return;
          this.emit({
            status: "indexing",
            readiness: { ...emptyReadiness, metadata: true },
            metadata: this.currentState.metadata ?? metadata,
            progress,
            timings: this.currentState.timings,
            diagnostics: this.currentState.diagnostics,
            generation,
          });
        },
        reportTiming: (phase, milliseconds) => {
          if (generation !== this.currentGeneration) return;
          this.emit({
            ...this.currentState,
            timings: { ...this.currentState.timings, [phase]: milliseconds },
          });
        },
      });
      if (generation !== this.currentGeneration) return undefined;

      // Let Penpot process pending input before CPU-only normalization begins.
      await yieldToHost();
      if (generation !== this.currentGeneration) return undefined;
      this.emit({
        status: "indexing",
        readiness: { metadata: true, selectionDependencies: false, fullIndex: false },
        metadata: snapshot.metadata,
        progress: { processed: snapshot.metadata.tokens, total: snapshot.metadata.tokens, phase: "aliases" },
        timings: this.currentState.timings,
        diagnostics: snapshot.diagnostics,
        generation,
      });
      const index = await this.buildIndex(snapshot, {
        reportTiming: (phase, milliseconds) => {
          if (generation !== this.currentGeneration) return;
          this.emit({ ...this.currentState, timings: { ...this.currentState.timings, [phase]: milliseconds } });
        },
      });
      if (generation !== this.currentGeneration) return undefined;

      this.currentIndex = index;
      this.emit({
        status: "ready",
        readiness: { metadata: true, selectionDependencies: true, fullIndex: true },
        metadata: snapshot.metadata,
        progress: { processed: snapshot.metadata.tokens, total: snapshot.metadata.tokens, phase: "bindings" },
        timings: this.currentState.timings,
        diagnostics: snapshot.diagnostics,
        generation,
      });
      return index;
    } catch (error) {
      if (generation !== this.currentGeneration) return undefined;
      this.emit({
        status: "error",
        readiness: { ...emptyReadiness, metadata: metadata !== undefined },
        metadata,
        timings: this.currentState.timings,
        diagnostics: [],
        error: error instanceof Error ? error.message : "Unable to index the design system.",
        generation,
      });
      return undefined;
    } finally {
      if (generation === this.currentGeneration) this.currentJob = undefined;
    }
  }

  private emit(state: DesignSystemIndexState): void {
    this.currentState = state;
    for (const listener of this.listeners) listener(state);
  }
}

/** setTimeout is available in the Penpot plugin sandbox and yields to the host. */
export function yieldToHost(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
