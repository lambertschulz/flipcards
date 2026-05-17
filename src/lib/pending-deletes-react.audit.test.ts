// ADR-0014 — pending-delete grep audit.
//
// Round-3 sharpened brief: the recurring failure mode of issue #8 was new
// callsites bypassing the pending-delete filter. Every page that introduces
// a raw `useLiveQuery(() => db.(decks|deckSets|cards). …)` becomes a fresh
// chance to re-leak a deleted row.
//
// Round-3 fix-attempt-2 added a second leak vector: feature code that wraps
// one of the `listAll…` / `listDue…` / `listCardsInDeck` / `listDecksInSet` /
// `listLoseDecks` helpers (from `src/db/*.ts`) inside `useLiveQuery`. Those
// helpers read raw rows from Dexie too — wrapping them in `useLiveQuery`
// achieves the same anti-pattern as `useLiveQuery(() => db.cards. …)` and
// must be banned by the same audit. (Documented example before the fix:
// `src/features/card/use-global-tags.ts`, which wrapped `listAllCards`.)
//
// This test pins the invariant *architecturally*: the only place in the
// source tree allowed to call `useLiveQuery` directly against the three
// entity tables (or their list-helper wrappers) is
// `src/lib/pending-deletes-react.ts` (the visibility-filtered hooks
// themselves). Every feature must go through `useVisibleDeck` /
// `useVisibleDecks` / `useVisibleDeckSet` / `useVisibleDeckSets` /
// `useVisibleCard` / `useVisibleCards`.
//
// If you're seeing this test fail in CI:
//   1. You added a `useLiveQuery(() => db.decks. …)` (or `db.deckSets.` /
//      `db.cards.`), OR wrapped one of the listed list-helpers in
//      `useLiveQuery`, outside the sanctioned file.
//   2. Replace it with the corresponding `useVisible…` hook (route the
//      Dexie query through the hook so pending-deleted rows are filtered).
//   3. Re-run the test.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../..");
const ALLOWED_FILE = "src/lib/pending-deletes-react.ts";

// Direct `useLiveQuery(() => db.{decks|deckSets|cards}. …)`.
const TABLE_PATTERN = String.raw`useLiveQuery\(\s*\(?\)?\s*=>\s*db\.(decks|deckSets|cards)\.`;

// `useLiveQuery(... listAllCards()/listAllDecks()/listAllDeckSets()/
// listCardsInDeck(...)/listDecksInSet(...)/listLoseDecks()/
// listDueCardsInDeck(...)/listAllDueCards(...) ...)`.
//
// We match the helper name appearing anywhere inside the `useLiveQuery(...)`
// argument list. `[\s\S]*?` is non-greedy so we don't run past the closing
// paren of the call. The helper list is the canonical "reads cards/decks/
// deckSets from Dexie" surface defined in `src/db/cards.ts`,
// `src/db/decks.ts`, `src/db/deck-sets.ts`, and `src/db/review-states.ts`
// (the last two for cross-deck due-card reads, which were the round-1 / -2
// leak surfaces).
const HELPER_NAMES = [
  "listAllCards",
  "listCardsInDeck",
  "listDecks",
  "listDeckSets",
  "listDecksInSet",
  "listLoseDecks",
  "listAllDueCards",
  "listDueCardsInDeck",
] as const;
const HELPER_PATTERN = String.raw`useLiveQuery\([\s\S]*?\b(${HELPER_NAMES.join("|")})\(`;

function gitGrep(pattern: string): string[] {
  try {
    // `-P` (Perl regex) is required because we use `[\s\S]*?` for the
    // helper-name pattern, which isn't a POSIX ERE construct. The simpler
    // table-level pattern would also work with `-E`, but we keep one flag
    // family across both audits for consistency.
    const out = execFileSync("git", ["grep", "-nP", "--no-color", pattern, "--", "src/"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    return out.split("\n").filter((line) => line.length > 0);
  } catch (err) {
    // `git grep` exits 1 when there are no matches — that's the happy path.
    const e = err as { status?: number; stdout?: string };
    if (e.status === 1) return [];
    throw err;
  }
}

function filterLeaks(matches: string[]): string[] {
  return matches.filter((line) => {
    // Lines look like `path/to/file.ts:42:…match…`. Test files are
    // permitted to call `useLiveQuery` directly — they don't ship in
    // the bundle and the invariant is about runtime read-models.
    const file = line.split(":")[0] ?? "";
    if (file === ALLOWED_FILE) return false;
    if (/\.test\.[tj]sx?$/.test(file)) return false;
    return true;
  });
}

// Round-4 sharpened brief added a third audit: every destructive
// bulk-replace site (`db.{table}.{clear,bulkPut,bulkAdd,bulkDelete}`) must
// either be inside the deletion-coordinator's own transactions
// (`src/db/deletion.ts`, the canonical sink for committing pending deletes)
// or in a file that also calls `cancelAll()` (the canonical "drain the
// coordinator before clobbering the DB" hook). Catching new bulk-replace
// callsites that forget to drain is the architectural enforcement of
// ADR-0014 class (b).
//
// The pattern: `db.<table>.{clear|bulkPut|bulkAdd|bulkDelete}(`. We list
// the destructive verbs explicitly; non-destructive verbs (`put`, `add`,
// `update`, `delete` for single rows) are not bulk-replace and don't
// trigger the contract.
const BULK_REPLACE_PATTERN = String.raw`db\.(decks|deckSets|cards|reviewStates|reviews)\.(clear|bulkPut|bulkAdd|bulkDelete)\(`;

// Files where bulk-replace ops are sanctioned without a `cancelAll()` call,
// because they are themselves the implementation of the coordinator's
// commit/restore thunks (`src/db/deletion.ts`) or they're test fixtures
// (filtered separately by extension).
const SANCTIONED_BULK_FILES = new Set(["src/db/deletion.ts"]);

function fileHasCancelAll(file: string): boolean {
  // Files that opt into the contract must mention `cancelAll(` somewhere.
  // We're not parsing the call graph — the grep is the audit, and a
  // mention is sufficient evidence that the maintainer thought about it.
  try {
    const out = execFileSync(
      "git",
      ["grep", "-l", "cancelAll(", "--", path.resolve(REPO_ROOT, file)],
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

describe("pending-delete grep audit (ADR-0014)", () => {
  it("every useLiveQuery against db.{decks,deckSets,cards} goes through pending-deletes-react.ts", () => {
    const leaks = filterLeaks(gitGrep(TABLE_PATTERN));
    expect(leaks, leaks.join("\n")).toEqual([]);
  });

  it("no useLiveQuery wraps a list-helper that reads cards/decks/deckSets", () => {
    // The round-3-fix-attempt-2 leak: `useLiveQuery(async () =>
    // extractTagsFromCards(await listAllCards()))` in
    // `src/features/card/use-global-tags.ts` bypassed the table-level grep
    // entirely because the Dexie read happened inside a helper. This audit
    // catches the same anti-pattern at the helper level so a future
    // contributor cannot re-introduce it by routing through any of the
    // canonical list helpers.
    const leaks = filterLeaks(gitGrep(HELPER_PATTERN));
    expect(leaks, leaks.join("\n")).toEqual([]);
  });

  it("every destructive bulk-replace site drains the pending-delete coordinator", () => {
    // Round-4 invariant (ADR-0014 class (b)): any file that calls
    // `db.<table>.{clear|bulkPut|bulkAdd|bulkDelete}` must also call
    // `cancelAll()` (the canonical drain hook), OR be the deletion
    // coordinator itself (which IS the sink for pending-delete commits).
    //
    // Why this matters: a deferred delete whose primary key collides with
    // a row that a backup-import is about to write would otherwise fire
    // (after its 10s timer) onto the freshly-imported data and silently
    // delete it. `cancelAll()` discards the pending op without committing.
    const matches = gitGrep(BULK_REPLACE_PATTERN);
    const offenders: string[] = [];
    const filesSeen = new Set<string>();
    for (const line of matches) {
      const file = line.split(":")[0] ?? "";
      if (/\.test\.[tj]sx?$/.test(file)) continue;
      if (SANCTIONED_BULK_FILES.has(file)) continue;
      if (filesSeen.has(file)) continue;
      filesSeen.add(file);
      if (!fileHasCancelAll(file)) offenders.push(`${file} — missing cancelAll() drain call`);
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
