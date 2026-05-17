// ADR-0014 — pending-delete grep audit.
//
// Round-3 sharpened brief: the recurring failure mode of issue #8 was new
// callsites bypassing the pending-delete filter. Every page that introduces
// a raw `useLiveQuery(() => db.(decks|deckSets|cards). …)` becomes a fresh
// chance to re-leak a deleted row.
//
// This test pins the invariant *architecturally*: the only place in the
// source tree allowed to call `useLiveQuery` directly against the three
// entity tables is `src/lib/pending-deletes-react.ts` (the visibility-
// filtered hooks themselves). Every feature must go through
// `useVisibleDeck` / `useVisibleDecks` / `useVisibleDeckSet` /
// `useVisibleDeckSets` / `useVisibleCard` / `useVisibleCards`.
//
// If you're seeing this test fail in CI:
//   1. You added a `useLiveQuery(() => db.decks. …)` (or `db.deckSets.` /
//      `db.cards.`) outside the sanctioned file.
//   2. Replace it with the corresponding `useVisible…` hook.
//   3. Re-run the test.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../..");
const AUDIT_PATTERN = String.raw`useLiveQuery\(\s*\(?\)?\s*=>\s*db\.(decks|deckSets|cards)\.`;
const ALLOWED_FILE = "src/lib/pending-deletes-react.ts";

function gitGrep(pattern: string): string[] {
  try {
    const out = execFileSync("git", ["grep", "-nE", "--no-color", pattern, "--", "src/"], {
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

describe("pending-delete grep audit (ADR-0014)", () => {
  it("every useLiveQuery against db.{decks,deckSets,cards} goes through pending-deletes-react.ts", () => {
    const matches = gitGrep(AUDIT_PATTERN);
    const leaks = matches.filter((line) => {
      // Lines look like `path/to/file.ts:42:…match…`. Test files are
      // permitted to call `useLiveQuery` directly — they don't ship in
      // the bundle and the invariant is about runtime read-models.
      const file = line.split(":")[0] ?? "";
      if (file === ALLOWED_FILE) return false;
      if (/\.test\.[tj]sx?$/.test(file)) return false;
      return true;
    });
    // Render a friendly message: list every offending file:line so the
    // failure tells the author exactly where to look.
    expect(leaks, leaks.join("\n")).toEqual([]);
  });
});
