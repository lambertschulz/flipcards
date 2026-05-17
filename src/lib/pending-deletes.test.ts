import { type Scheduler, createPendingDeletesStore } from "@/lib/pending-deletes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Build a controllable scheduler that records pending callbacks and lets the
// test fire them on demand. We deliberately avoid `vi.useFakeTimers()` here
// because the coordinator's lifecycle handlers run synchronously and we want
// fine-grained control over which timers exist when.
function makeManualScheduler(): Scheduler & {
  pending(): number;
  fireAll(): void;
  fire(handle: unknown): void;
} {
  type Entry = { handle: unknown; fn: () => void };
  const entries: Entry[] = [];
  let nextHandle = 1;
  return {
    setTimeout(fn) {
      const handle = nextHandle++;
      entries.push({ handle, fn });
      return handle;
    },
    clearTimeout(handle) {
      const i = entries.findIndex((e) => e.handle === handle);
      if (i >= 0) entries.splice(i, 1);
    },
    pending() {
      return entries.length;
    },
    fireAll() {
      const snapshot = entries.splice(0, entries.length);
      for (const e of snapshot) e.fn();
    },
    fire(handle) {
      const i = entries.findIndex((e) => e.handle === handle);
      if (i < 0) return;
      const [entry] = entries.splice(i, 1);
      entry.fn();
    },
  };
}

describe("createPendingDeletesStore — basic enqueue/commit", () => {
  it("auto-commits after the hold timeout", async () => {
    const scheduler = makeManualScheduler();
    const commit = vi.fn().mockResolvedValue(undefined);
    const restore = vi.fn().mockResolvedValue(undefined);

    const store = createPendingDeletesStore({ holdMs: 10_000, scheduler });
    store.enqueue({ key: "card:1", label: "Card gelöscht", commit, restore });

    expect(store.list()).toHaveLength(1);
    expect(scheduler.pending()).toBe(1);

    scheduler.fireAll();
    await vi.waitFor(() => expect(commit).toHaveBeenCalledTimes(1));

    expect(store.list()).toHaveLength(0); // dropped from visible list after commit
    expect(store.isPending("card:1")).toBe(false);
  });

  it("undo cancels the timer and skips commit", async () => {
    const scheduler = makeManualScheduler();
    const commit = vi.fn();
    const restore = vi.fn().mockResolvedValue(undefined);

    const store = createPendingDeletesStore({ scheduler });
    const id = store.enqueue({ key: "card:1", label: "x", commit, restore });
    expect(store.isPending("card:1")).toBe(true);

    await store.undo(id);

    expect(commit).not.toHaveBeenCalled();
    expect(restore).toHaveBeenCalledTimes(1);
    expect(store.isPending("card:1")).toBe(false);
    expect(scheduler.pending()).toBe(0);
  });

  it("undo of one op does not affect a sibling op (stacking)", async () => {
    const scheduler = makeManualScheduler();
    const commitA = vi.fn().mockResolvedValue(undefined);
    const commitB = vi.fn().mockResolvedValue(undefined);

    const store = createPendingDeletesStore({ scheduler });
    const idA = store.enqueue({
      key: "card:A",
      label: "A",
      commit: commitA,
      restore: async () => {},
    });
    store.enqueue({
      key: "card:B",
      label: "B",
      commit: commitB,
      restore: async () => {},
    });

    expect(store.list()).toHaveLength(2);
    expect(scheduler.pending()).toBe(2);

    await store.undo(idA);
    expect(store.isPending("card:A")).toBe(false);
    expect(store.isPending("card:B")).toBe(true);
    expect(scheduler.pending()).toBe(1);

    scheduler.fireAll();
    await vi.waitFor(() => expect(commitB).toHaveBeenCalledTimes(1));
    expect(commitA).not.toHaveBeenCalled();
  });

  it("notifies subscribers on enqueue / undo / commit", async () => {
    const scheduler = makeManualScheduler();
    const store = createPendingDeletesStore({ scheduler });
    const listener = vi.fn();
    store.subscribe(listener);

    const id = store.enqueue({
      key: "k",
      label: "x",
      commit: async () => {},
      restore: async () => {},
    });
    expect(listener).toHaveBeenCalled();
    const callsAfterEnqueue = listener.mock.calls.length;

    await store.undo(id);
    expect(listener.mock.calls.length).toBeGreaterThan(callsAfterEnqueue);
  });

  it("subscribe returns an unsubscribe", () => {
    const store = createPendingDeletesStore({ scheduler: makeManualScheduler() });
    const listener = vi.fn();
    const off = store.subscribe(listener);
    off();
    store.enqueue({
      key: "k",
      label: "x",
      commit: async () => {},
      restore: async () => {},
    });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("createPendingDeletesStore — undo while commit in flight", () => {
  it("rejects undo during an in-flight commit and lets the commit finish", async () => {
    const scheduler = makeManualScheduler();

    // A deferred promise lets us hold commit() open until we manually resolve it.
    let resolveCommit!: () => void;
    const commitGate = new Promise<void>((res) => {
      resolveCommit = res;
    });
    const commit = vi.fn(async () => {
      await commitGate;
    });
    const restore = vi.fn().mockResolvedValue(undefined);

    const store = createPendingDeletesStore({ scheduler });
    const id = store.enqueue({ key: "card:1", label: "x", commit, restore });

    // Advance the timer so commitOp starts, but commit() hasn't resolved yet.
    scheduler.fireAll();
    await vi.waitFor(() => expect(commit).toHaveBeenCalledTimes(1));

    // While commit is in flight the op must be visible as `committing`, NOT
    // `pending` — that's what lets the UI hide the Rückgängig affordance.
    const inFlight = store.list().find((o) => o.id === id);
    expect(inFlight?.state).toBe("committing");

    // Attempting undo during the in-flight window must be a no-op:
    // restore must NOT run.
    await store.undo(id);
    expect(restore).not.toHaveBeenCalled();

    // The commit was already in-flight — let it finish; data is still deleted.
    resolveCommit();
    await vi.waitFor(() => expect(store.list()).toHaveLength(0));
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("keeps `isPending(key)` true while the commit is in flight", async () => {
    const scheduler = makeManualScheduler();
    let resolveCommit!: () => void;
    const commit = vi.fn(
      () =>
        new Promise<void>((res) => {
          resolveCommit = res;
        }),
    );

    const store = createPendingDeletesStore({ scheduler });
    store.enqueue({ key: "card:1", label: "x", commit, restore: async () => {} });

    scheduler.fireAll();
    await vi.waitFor(() => expect(commit).toHaveBeenCalledTimes(1));

    // Row should still be hidden from the UI while the IDB transaction runs.
    expect(store.isPending("card:1")).toBe(true);

    resolveCommit();
    await vi.waitFor(() => expect(store.isPending("card:1")).toBe(false));
  });
});

describe("createPendingDeletesStore — error paths", () => {
  it("transitions to `failed` and notifies onError when commit rejects", async () => {
    const scheduler = makeManualScheduler();
    const onError = vi.fn();
    const store = createPendingDeletesStore({ scheduler, onError });

    store.enqueue({
      key: "k",
      label: "x",
      commit: async () => {
        throw new Error("idb dead");
      },
      restore: async () => {},
    });

    scheduler.fireAll();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(store.list()[0]?.state).toBe("failed");
    expect(store.list()[0]?.error).toContain("idb dead");
  });
});

describe("createPendingDeletesStore — lifecycle (visibilitychange + pagehide)", () => {
  let originalVis: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalVis = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState");
  });
  afterEach(() => {
    if (originalVis) Object.defineProperty(Document.prototype, "visibilityState", originalVis);
  });

  function setVisibilityState(value: "hidden" | "visible") {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => value,
    });
  }

  it("flushes pending ops synchronously when `visibilityState` becomes hidden", async () => {
    const scheduler = makeManualScheduler();
    const commit = vi.fn().mockResolvedValue(undefined);

    const store = createPendingDeletesStore({ scheduler });
    const off = store.installLifecycleListeners(window, document);

    store.enqueue({
      key: "k",
      label: "x",
      commit,
      restore: async () => {},
    });

    setVisibilityState("hidden");
    document.dispatchEvent(new Event("visibilitychange"));

    await vi.waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
    off();
  });

  it("does NOT flush when visibility becomes visible again", async () => {
    const scheduler = makeManualScheduler();
    const commit = vi.fn().mockResolvedValue(undefined);

    const store = createPendingDeletesStore({ scheduler });
    const off = store.installLifecycleListeners(window, document);

    store.enqueue({
      key: "k",
      label: "x",
      commit,
      restore: async () => {},
    });

    setVisibilityState("visible");
    document.dispatchEvent(new Event("visibilitychange"));

    // Give microtasks a chance to flush; nothing should have fired.
    await Promise.resolve();
    expect(commit).not.toHaveBeenCalled();
    off();
  });

  it("flushes pending ops on `pagehide`", async () => {
    const scheduler = makeManualScheduler();
    const commit = vi.fn().mockResolvedValue(undefined);

    const store = createPendingDeletesStore({ scheduler });
    const off = store.installLifecycleListeners(window, document);

    store.enqueue({
      key: "k",
      label: "x",
      commit,
      restore: async () => {},
    });

    window.dispatchEvent(new Event("pagehide"));
    await vi.waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
    off();
  });

  it("flushAll commits every pending op without affecting committed ones", async () => {
    const scheduler = makeManualScheduler();
    const commitA = vi.fn().mockResolvedValue(undefined);
    const commitB = vi.fn().mockResolvedValue(undefined);

    const store = createPendingDeletesStore({ scheduler });
    store.enqueue({
      key: "a",
      label: "A",
      commit: commitA,
      restore: async () => {},
    });
    store.enqueue({
      key: "b",
      label: "B",
      commit: commitB,
      restore: async () => {},
    });

    await store.flushAll();
    expect(commitA).toHaveBeenCalledTimes(1);
    expect(commitB).toHaveBeenCalledTimes(1);
    expect(store.list()).toHaveLength(0);
  });
});
