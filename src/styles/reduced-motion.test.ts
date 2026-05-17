import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Issue #12 — accessibility target (ADR-0015).
//
// Regression guard for the `prefers-reduced-motion` rule. The Review-Flow
// has no bespoke 3D card-flip animation today — the "flip" is a state
// swap, not a transform — so the protection lives globally in
// `globals.css`: any transition/animation in the app collapses to ~0 ms
// when the OS reports `prefers-reduced-motion: reduce`.
//
// This test pins the global rule so a future stylesheet refactor cannot
// silently drop it. If the rule moves elsewhere or gets componentised,
// update this test to match the new location.

const here = dirname(fileURLToPath(import.meta.url));
const globalsPath = join(here, "globals.css");

describe("globals.css — reduced-motion guard", () => {
  it("collapses transition + animation durations under prefers-reduced-motion: reduce", () => {
    const css = readFileSync(globalsPath, "utf-8");

    // The media query is present.
    expect(css).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)/);

    // Inside that block, transitions and animations are forced to ~0 ms.
    // We do not require a specific selector — just that the rule exists.
    expect(css).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(css).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
  });
});
