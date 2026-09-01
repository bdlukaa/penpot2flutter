import assert from "node:assert/strict";
import test from "node:test";

import {
  DesignSystemIndexManager,
  type DesignSystemIndexLoader,
  type DesignSystemIndexSnapshot,
} from "../src/core/design-system-index-manager.js";

interface TestIndex {
  readonly tokenNames: readonly string[];
}

function snapshot(tokenNames: readonly string[] = ["color.primary"]): DesignSystemIndexSnapshot {
  return {
    metadata: {
      sets: 1,
      themes: 1,
      tokens: tokenNames.length,
      groups: ["Mode"],
      setNames: ["Global"],
      themeNames: ["Mode / Light"],
    },
    input: {
      tokens: tokenNames.map((name, index) => ({ id: `token-${index}`, name, type: "color", value: "#ffffff", setId: "global" })),
      sets: [{ id: "global", name: "Global", active: true, tokenIds: tokenNames.map((_, index) => `token-${index}`) }],
      themes: [{ id: "light", name: "Light", group: "Mode", active: true, activeSetIds: ["global"] }],
    },
    diagnostics: [],
  };
}

function deferred<T>(): { readonly promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void } {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (error: unknown) => void;
  return {
    promise: new Promise<T>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    }),
    resolve: (value) => resolvePromise(value),
    reject: (error) => rejectPromise(error),
  };
}

test("starts indexing in the background and shares one in-flight full-index job", async () => {
  const loaded = deferred<DesignSystemIndexSnapshot>();
  let starts = 0;
  const loader: DesignSystemIndexLoader = {
    readMetadata: () => snapshot().metadata,
    load: async () => {
      starts++;
      return loaded.promise;
    },
  };
  const manager = new DesignSystemIndexManager<TestIndex>(loader, (value) => ({ tokenNames: value.input.tokens?.map((token) => token.name) ?? [] }));

  const first = manager.ensureStarted();
  const second = manager.ensureStarted();
  assert.strictEqual(first, second);
  assert.equal(manager.state.status, "indexing");
  assert.equal(manager.state.readiness.metadata, true);
  assert.equal(manager.state.readiness.fullIndex, false);
  assert.equal(starts, 1);

  loaded.resolve(snapshot());
  assert.deepEqual(await first, { tokenNames: ["color.primary"] });
  assert.equal(manager.state.status, "ready");
  assert.equal(manager.state.readiness.fullIndex, true);
});

test("selection changes reuse the completed session index without starting another full traversal", async () => {
  let starts = 0;
  const manager = new DesignSystemIndexManager<TestIndex>(
    {
      readMetadata: () => snapshot().metadata,
      load: async () => {
        starts++;
        return snapshot();
      },
    },
    (value) => ({ tokenNames: value.input.tokens?.map((token) => token.name) ?? [] }),
  );

  const indexed = await manager.ensureStarted();
  assert.strictEqual(await manager.ensureSelectionDependencies(["color.primary"]), indexed);
  assert.strictEqual(await manager.ensureSelectionDependencies(["color.secondary"]), indexed);
  assert.equal(starts, 1);
});

test("does not make selection dependency requests wait when no tokens are referenced", async () => {
  const loaded = deferred<DesignSystemIndexSnapshot>();
  const manager = new DesignSystemIndexManager<TestIndex>(
    { readMetadata: () => snapshot().metadata, load: async () => loaded.promise },
    (value) => ({ tokenNames: value.input.tokens?.map((token) => token.name) ?? [] }),
  );

  manager.ensureStarted();
  assert.equal(await manager.ensureSelectionDependencies([]), undefined);
  loaded.resolve(snapshot());
});

test("stale work cannot commit after invalidation and explicit refresh starts a replacement job", async () => {
  const first = deferred<DesignSystemIndexSnapshot>();
  const second = deferred<DesignSystemIndexSnapshot>();
  let call = 0;
  const manager = new DesignSystemIndexManager<TestIndex>(
    {
      readMetadata: () => snapshot().metadata,
      load: async () => (++call === 1 ? first.promise : second.promise),
    },
    (value) => ({ tokenNames: value.input.tokens?.map((token) => token.name) ?? [] }),
  );

  const oldJob = manager.ensureStarted();
  const newJob = manager.refresh("manual-refresh");
  first.resolve(snapshot(["color.old"]));
  second.resolve(snapshot(["color.new"]));

  assert.equal(await oldJob, undefined);
  assert.deepEqual(await newJob, { tokenNames: ["color.new"] });
  assert.deepEqual(manager.index, { tokenNames: ["color.new"] });
  assert.equal(manager.state.status, "ready");
});

test("an index error is non-blocking, does not restart on selection, and a later refresh recovers", async () => {
  let fail = true;
  let loads = 0;
  const manager = new DesignSystemIndexManager<TestIndex>(
    {
      readMetadata: () => snapshot().metadata,
      load: async () => {
        loads++;
        if (fail) throw new Error("unavailable");
        return snapshot();
      },
    },
    (value) => ({ tokenNames: value.input.tokens?.map((token) => token.name) ?? [] }),
  );

  assert.equal(await manager.ensureStarted(), undefined);
  assert.equal(manager.state.status, "error");
  assert.equal(await manager.ensureSelectionDependencies([]), undefined);
  assert.equal(await manager.ensureSelectionDependencies(["color.primary"]), undefined);
  assert.equal(loads, 1);

  fail = false;
  assert.deepEqual(await manager.refresh("manual-refresh"), { tokenNames: ["color.primary"] });
  assert.equal(manager.state.status, "ready");
});
