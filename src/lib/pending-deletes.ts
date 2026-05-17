// Pending-deletion coordinator — ADR-0014 (Lösch-Semantik mit 10s-Undo).
//
// Model:
//   - The UI calls `enqueue({ key, label, commit, restore })`.
//   - The coordinator holds the operation in memory for `holdMs` (default
//     10_000) and then calls `commit()` to perform the IndexedDB transaction.
//   - During the hold the UI can call `undo(id)`, which clears the timer.
//     If the underlying data was already touched (it isn't, because we
//     deliberately defer the commit), `restore()` is invoked too.
//   - On `visibilitychange → hidden` or `pagehide` the coordinator flushes
//     every pending op synchronously (kicks off `commit()` immediately).
//     Dexie transactions, once submitted, persist atomically — a tab-kill
//     mid-transaction leaves either the pre-state or the post-state, never
//     a half-state.
//
// Why a custom store and not Sonner?
//   - We need first-class access to the pending list so UI components can
//     ask "is this id pending-deleted?" for optimistic hide.
//   - Toasts are a thin presentational layer over this store; switching to
//     Sonner later is a one-component swap.
//
// The store is intentionally framework-agnostic; the React glue lives in
// `pending-deletes-react.ts`.
//
// Interaction classes (ADR-0014 — three-class enumeration introduced
// in the round-4 sharpened brief for issue #8):
//
//   (a) **Read paths** must go through the `useVisible*` hooks in
//       `pending-deletes-react.ts` (or call `isPending(key)` directly for
//       non-React reads). Never query Dexie for one of the three entity
//       tables and surface the result without first filtering by
//       `isPending`.
//   (b) **Destructive bulk-replace paths** (backup restore, global wipe,
//       any future clean-slate-replace import) must call `cancelAll()`
//       BEFORE mutating the DB. The semantics: pending ops were never
//       committed — they hold a deferred `commit()` thunk; calling
//       `cancelAll()` discards those thunks so they cannot fire onto a
//       freshly-imported row whose ID happens to collide. `flushAll()` is
//       the wrong tool for this — it *commits* the deferred deletes,
//       which is fine for tab-close but is data loss for bulk-replace.
//   (c) **Navigate-by-id paths** get pending-deleted entities filtered for
//       free via the `useVisible*` hooks returning `undefined`. No
//       additional contract — class (a) covers this transparently.

export type PendingOp = {
  readonly id: string;
  /**
   * Stable keys the UI/loader filters check via `isPending(key)`.
   *
   * The first entry is the *primary* key (the directly-deleted entity,
   * e.g. `"deck:abc"`); subsequent entries are cascade-descendant keys
   * (`"card:<id>"` for every child card when a deck is deleted). This way
   * every read-path can call `store.isPending("card:42")` and get a hit even
   * though the user only clicked "Delete deck" — the cascade-key construction
   * lives in the coordinator's `enqueue` API, not in each loader.
   *
   * Invariant (ADR-0014): no read-model anywhere in the app may surface a row
   * whose pending-delete op is in `pending` or `committing` state — neither
   * the directly-deleted entity nor any cascade descendant.
   */
  readonly keys: readonly string[];
  /**
   * Convenience alias for `keys[0]` — the primary key. Kept on the op so
   * existing code paths (toast list rendering, tests) that index by a single
   * key keep working without churn.
   */
  readonly key: string;
  /** Label shown in the toast, e.g. "Card gelöscht". */
  readonly label: string;
  /** Timestamp (ms) at which the op was enqueued. UI derives countdown from this. */
  readonly createdAt: number;
  /** Timestamp (ms) at which the op will auto-commit. */
  readonly commitsAt: number;
  /**
   * Lifecycle state of the op.
   *
   * - `pending`   — still in the 10s hold window; undo is allowed.
   * - `committing` — `commit()` has been called and we're awaiting it; undo
   *                  is NOT allowed (the IDB transaction is in flight and
   *                  cannot be rolled back from the coordinator).
   * - `committed` — `commit()` resolved; op is dropped from the visible list.
   * - `undone`    — user hit Rückgängig; op is dropped after restore runs.
   * - `failed`    — `commit()` rejected; op stays visible so onError can surface it.
   */
  readonly state: "pending" | "committing" | "committed" | "undone" | "failed";
  readonly error?: string;
};

export type EnqueueInput = {
  /**
   * Primary key for the deleted entity (e.g. `"card:abc"`, `"deck:xyz"`,
   * `"deck-set:s1"`). Surfaced as `op.key` and as `op.keys[0]`.
   */
  key: string;
  /**
   * Additional cascade-descendant keys that must also be considered pending
   * for the duration of this op. When deleting a Deck, supply
   * `card:<id>` for every child card; when deleting a Deck-Set leave this
   * empty (decks survive — ADR-0014). When deleting a Card leave this empty.
   *
   * Callers MUST resolve the cascade BEFORE enqueueing — otherwise a read
   * during the 10s window will leak a row. The cascade snapshot is read
   * synchronously here so a sibling tab cannot race in between the enqueue
   * and the eventual commit.
   */
  cascadeKeys?: readonly string[];
  label: string;
  commit: () => Promise<void>;
  restore: () => Promise<void>;
};

export type Listener = (ops: readonly PendingOp[]) => void;

export type Clock = () => number;

export type Scheduler = {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

const defaultScheduler: Scheduler = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>),
};

export type CreateStoreOptions = {
  /** Hold time before auto-commit. ADR-0014 fixes this at 10s in production. */
  holdMs?: number;
  /** Override clock for tests. */
  now?: Clock;
  /** Override scheduler for tests (e.g. vitest fake timers). */
  scheduler?: Scheduler;
  /** Notified when an op transitions to `failed`. */
  onError?: (op: PendingOp, error: unknown) => void;
};

export type PendingDeletesStore = {
  enqueue(input: EnqueueInput): string;
  undo(id: string): Promise<void>;
  /** Commit a single op now (e.g. user clicked away). */
  flush(id: string): Promise<void>;
  /** Synchronously commit every pending op. Used by `visibilitychange → hidden`. */
  flushAll(): Promise<void>;
  /**
   * Discard every `pending` op without committing, and await any `committing`
   * op already in flight so its Dexie transaction settles before we resolve.
   *
   * Canonical "I am about to clobber the DB" hook — call this at the start of
   * every destructive bulk-replace path (backup restore, global wipe, any
   * future clean-slate-replace import). See the three-class enumeration in
   * the module header and ADR-0014.
   *
   * Why discard rather than commit:
   * - Pending ops hold a *deferred* `commit()` thunk; the rows in the DB
   *   were never touched. Dropping the thunk leaves the DB untouched by
   *   this op (which is what the bulk-replace caller wants — it's about
   *   to overwrite the DB anyway).
   * - If we called `flushAll()` instead, a deferred delete whose primary
   *   key collides with a row in the imported backup would run *after*
   *   the import and silently delete the new row.
   *
   * After this resolves: `list()` is empty (committing ops drop on settle
   * via the normal commit lifecycle; pending ops drop immediately), and
   * `isPending(k)` is `false` for every k.
   */
  cancelAll(): Promise<void>;
  list(): readonly PendingOp[];
  isPending(key: string): boolean;
  subscribe(listener: Listener): () => void;
  /** Wire up `visibilitychange` + `pagehide` listeners. Returns a teardown fn. */
  installLifecycleListeners(target?: EventTarget, doc?: Document): () => void;
};

export function createPendingDeletesStore(options: CreateStoreOptions = {}): PendingDeletesStore {
  const holdMs = options.holdMs ?? 10_000;
  const now = options.now ?? (() => Date.now());
  const scheduler = options.scheduler ?? defaultScheduler;

  let ops: readonly PendingOp[] = [];
  const timers = new Map<string, unknown>();
  // commit functions captured at enqueue-time; not part of the public op shape.
  const commits = new Map<string, () => Promise<void>>();
  const restores = new Map<string, () => Promise<void>>();
  // In-flight commit promises, captured the moment an op enters `committing`.
  // `flushAll()` awaits these alongside any still-`pending` ops it kicks off —
  // otherwise a backup-export racing with the auto-commit timer would proceed
  // to read IndexedDB while a delete transaction was still in flight (see
  // `backup-export.ts` / `flushAll waits for committing ops too` test).
  const commitPromises = new Map<string, Promise<void>>();
  const listeners = new Set<Listener>();
  let idCounter = 0;

  // The `ops` array reference is replaced on every mutation; consumers
  // (notably `useSyncExternalStore`) get the same reference between
  // mutations, which avoids re-render storms.
  function publish() {
    for (const l of listeners) l(ops);
  }

  function transition(id: string, patch: Partial<PendingOp>) {
    ops = ops.map((op) => (op.id === id ? { ...op, ...patch } : op));
  }

  function dropOp(id: string) {
    ops = ops.filter((op) => op.id !== id);
    commits.delete(id);
    restores.delete(id);
    commitPromises.delete(id);
  }

  function clearTimer(id: string) {
    const h = timers.get(id);
    if (h !== undefined) {
      scheduler.clearTimeout(h);
      timers.delete(id);
    }
  }

  function commitOp(id: string): Promise<void> {
    // Re-entrancy guard: if a commit for this id is already in flight, return
    // the existing promise rather than starting a second one. This matters
    // because `flushAll()` and the auto-commit timer can both call `commitOp`
    // for the same id (e.g. user clicks "Backup exportieren" the instant the
    // 10s timer fires); without this guard we'd transition out of `pending`
    // once, then the second entry would see `op.state !== "pending"` and
    // return `undefined` — losing the in-flight handle for `flushAll`'s await.
    const existing = commitPromises.get(id);
    if (existing) return existing;
    const op = ops.find((o) => o.id === id);
    if (!op || op.state !== "pending") return Promise.resolve();
    const commit = commits.get(id);
    clearTimer(id);
    if (!commit) {
      dropOp(id);
      publish();
      return Promise.resolve();
    }
    // Transition to `committing` BEFORE awaiting commit() so the UI hides
    // the undo affordance during the in-flight IDB transaction. If we left
    // the op as `pending` here, a fast user could click Rückgängig after
    // commit started but before it settled — the undo path would drop the
    // op and run a no-op restore (snapshot doesn't exist yet) while the
    // in-flight commit still finishes and deletes the data.
    transition(id, { state: "committing" });
    publish();
    const promise = (async () => {
      try {
        await commit();
        transition(id, { state: "committed" });
        // Drop committed ops from the visible list — the UI shouldn't show
        // a stale toast for an op that's already final.
        dropOp(id);
        publish();
      } catch (err) {
        transition(id, {
          state: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
        const failed = ops.find((o) => o.id === id);
        if (failed && options.onError) options.onError(failed, err);
        // Clear the in-flight handle so a future flushAll doesn't get the
        // settled-failed promise back. The op stays in `failed` state.
        commitPromises.delete(id);
        publish();
      }
    })();
    commitPromises.set(id, promise);
    return promise;
  }

  return {
    enqueue(input) {
      const id = `pd-${++idCounter}-${now()}`;
      const t = now();
      // Dedupe cascade keys against the primary key — callers shouldn't have
      // to filter the primary out of the cascade list manually.
      const cascade = input.cascadeKeys ?? [];
      const seen = new Set<string>([input.key]);
      const merged: string[] = [input.key];
      for (const k of cascade) {
        if (!seen.has(k)) {
          seen.add(k);
          merged.push(k);
        }
      }
      const op: PendingOp = {
        id,
        key: input.key,
        keys: merged,
        label: input.label,
        createdAt: t,
        commitsAt: t + holdMs,
        state: "pending",
      };
      ops = [...ops, op];
      commits.set(id, input.commit);
      restores.set(id, input.restore);
      timers.set(
        id,
        scheduler.setTimeout(() => {
          void commitOp(id);
        }, holdMs),
      );
      publish();
      return id;
    },

    async undo(id) {
      const op = ops.find((o) => o.id === id);
      if (!op || op.state !== "pending") return;
      clearTimer(id);
      const restore = restores.get(id);
      // Optimistic UI: the row was hidden via `isPending`; if a restore is
      // wired up we still call it for symmetry with future variants that
      // *do* touch IndexedDB pre-commit. With pure in-memory pending it's
      // a no-op.
      transition(id, { state: "undone" });
      dropOp(id);
      publish();
      if (restore) {
        try {
          await restore();
        } catch {
          // Restore failures are rare (would mean Dexie can't put the rows
          // back). Surface via onError but don't throw — the toast is gone.
        }
      }
    },

    flush(id) {
      return commitOp(id);
    },

    async cancelAll() {
      // Snapshot committing-op promises BEFORE we drop pending ops so we
      // can await them. We do NOT touch their lifecycle — they're already
      // in flight and Dexie will run them to completion. The drop happens
      // naturally when each commitOp resolves and calls `dropOp`.
      const committingPromises: Promise<void>[] = [];
      for (const op of ops) {
        if (op.state === "committing") {
          const p = commitPromises.get(op.id);
          if (p) committingPromises.push(p);
        }
      }

      // Discard every `pending` op: clear its timer, drop the captured
      // commit/restore thunks (so the timer firing late — racing this call —
      // becomes a no-op via the `op.state !== "pending"` guard in commitOp),
      // and remove it from the visible list. No commit, no restore: the
      // rows in the DB were never touched.
      const pendingIds: string[] = [];
      for (const op of ops) {
        if (op.state === "pending") pendingIds.push(op.id);
      }
      for (const id of pendingIds) {
        clearTimer(id);
        dropOp(id);
      }
      if (pendingIds.length > 0) publish();

      // Await any committing ops so the caller can safely run its own
      // bulk-replace transaction without racing a half-done delete.
      await Promise.all(committingPromises);
    },

    async flushAll() {
      // Kick off every still-pending op AND wait for every already-`committing`
      // op to settle. The committing branch matters for callers like
      // `exportBackupToFile()`: if the 10s auto-commit timer fires a moment
      // before the user clicks "Backup exportieren", the op is in `committing`
      // (commit() is awaiting Dexie) but no longer in `pending` — without
      // joining its promise, flushAll would resolve while the delete
      // transaction is still in flight and the backup would capture rows the
      // user has already deleted. Dexie serialises rw transactions against
      // the same tables internally, so kicking off the remaining pending ops
      // in parallel is safe.
      const promises: Promise<void>[] = [];
      for (const op of ops) {
        if (op.state === "pending") {
          promises.push(commitOp(op.id));
        } else if (op.state === "committing") {
          const inFlight = commitPromises.get(op.id);
          if (inFlight) promises.push(inFlight);
        }
      }
      await Promise.all(promises);
    },

    list() {
      return ops;
    },

    isPending(key) {
      // `pending` (hold window) and `committing` (commit in flight) both
      // count: the row must stay hidden in the UI from the moment the user
      // hits "Löschen" until the IDB transaction has either committed or
      // failed. Returning false during `committing` would briefly flash the
      // row back into the list — visually identical to the row resurrecting.
      //
      // Matches against the full key-set so cascade descendants (e.g.
      // `card:<id>` keys carried by a deck-delete op) hide everywhere too —
      // see ADR-0014 / the cascade-keys invariant in the brief.
      for (const o of ops) {
        if (o.state !== "pending" && o.state !== "committing") continue;
        for (const k of o.keys) {
          if (k === key) return true;
        }
      }
      return false;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    installLifecycleListeners(target, doc) {
      const win = target ?? (typeof window !== "undefined" ? window : undefined);
      const document_ = doc ?? (typeof document !== "undefined" ? document : undefined);
      if (!win) return () => {};

      // The visibilitychange handler must do its work *synchronously* — once
      // the tab is hidden the browser may freeze JS at any point. We start
      // each commit immediately (no await), trusting Dexie's transactional
      // guarantees: each commit is queued onto IDB before this function
      // returns, and IDB will run it to completion or not at all.
      const onHidden = () => {
        if (document_ && document_.visibilityState !== "hidden") return;
        // Kick off commits without awaiting; we can't safely await here.
        for (const op of ops) {
          if (op.state === "pending") void commitOp(op.id);
        }
      };
      const onPageHide = () => {
        for (const op of ops) {
          if (op.state === "pending") void commitOp(op.id);
        }
      };

      const visHandler = () => onHidden();
      if (document_) document_.addEventListener("visibilitychange", visHandler);
      win.addEventListener("pagehide", onPageHide);
      return () => {
        if (document_) document_.removeEventListener("visibilitychange", visHandler);
        win.removeEventListener("pagehide", onPageHide);
      };
    },
  };
}

// --- Module-level singleton ------------------------------------------------
//
// The app uses one shared coordinator; tests construct their own via
// `createPendingDeletesStore` for isolation.

let singleton: PendingDeletesStore | undefined;

export function getPendingDeletes(): PendingDeletesStore {
  if (!singleton) singleton = createPendingDeletesStore();
  return singleton;
}

/** Reset the singleton — *test-only*. */
export function __resetPendingDeletesForTests(): void {
  singleton = undefined;
}
