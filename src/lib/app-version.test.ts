import { APP_VERSION } from "@/lib/app-version";
import { describe, expect, it } from "vitest";

import pkg from "../../package.json" with { type: "json" };

describe("APP_VERSION", () => {
  it("matches package.json#version (ADR-0016 axis 1)", () => {
    expect(APP_VERSION).toBe(pkg.version);
  });

  it("is a SemVer-shaped string (major.minor.patch with optional pre-release)", () => {
    // We don't enforce stable 1.0+ here — 0.x is allowed and expected pre-1.0
    // per ADR-0016. The shape check just guards against accidentally landing
    // a CalVer or sequential version that would break SemVer-aware tooling.
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/);
  });
});
