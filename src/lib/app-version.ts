// Single named accessor for the app's SemVer (ADR-0016 axis #1).
// Reads the value Vite baked into the bundle from `package.json#version` via
// the `define` hook in `vite.config.ts`. Consumers (PWA-manifest builder,
// footer, diagnostics) import from here rather than touching `import.meta.env`
// directly — that keeps the source-of-truth wiring in one place and makes it
// easy to swap if we ever move to a build-stamped manifest instead.

export const APP_VERSION: string = import.meta.env.PACKAGE_VERSION;
