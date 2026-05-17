import { buildPwaManifest } from "@/lib/pwa/manifest";
import { describe, expect, it } from "vitest";
import pkg from "../../../package.json" with { type: "json" };

// ADR-0016 axis #1: "Im PWA-Manifest und im Footer wird der gleiche Wert
// geführt." Footer/`__PACKAGE_VERSION__` is sourced from `package.json#version`
// via `vite.config.ts`'s `define`. The manifest must follow the same path.
// This test pins that contract so a future edit cannot silently drift the
// manifest version away from the package version.

describe("pwa/manifest", () => {
  it("stamps the manifest with the SemVer passed in", () => {
    const manifest = buildPwaManifest("1.2.3");
    expect(manifest.version).toBe("1.2.3");
  });

  it("uses package.json#version when fed pkg.version (ADR-0016 axis #1)", () => {
    const manifest = buildPwaManifest(pkg.version);
    expect(manifest.version).toBe(pkg.version);
  });

  it("ships the GitHub-Pages-safe relative start_url and scope (ADR-0008)", () => {
    const manifest = buildPwaManifest(pkg.version);
    expect(manifest.start_url).toBe("./");
    expect(manifest.scope).toBe("./");
  });

  it("includes a maskable icon for Android adaptive launchers", () => {
    const manifest = buildPwaManifest(pkg.version);
    const maskable = manifest.icons.find((i) => i.purpose === "maskable");
    expect(maskable).toBeDefined();
    expect(maskable?.sizes).toBe("512x512");
  });
});
