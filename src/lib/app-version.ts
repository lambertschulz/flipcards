// Single named accessor for the app's SemVer (ADR-0016 axis #1).
// Reads the value Vite baked into the bundle from `package.json#version` via
// the `define` hook in `vite.config.ts`. Consumers (Backup-Export, future
// PWA-manifest builder, footer) import from here rather than touching
// `import.meta.env` directly — that keeps the source-of-truth wiring in one
// place.
//
// `__PACKAGE_VERSION__` is a plain `define` replacement (not env-prefixed)
// so it doesn't pollute the `import.meta.env` interface. Defaults to "0.0.0"
// under unit tests if the define ever fails to fire — guards against a
// silent `"undefined"` string ending up in a real backup file.
declare const __PACKAGE_VERSION__: string;

export const APP_VERSION: string =
  typeof __PACKAGE_VERSION__ === "string" && __PACKAGE_VERSION__.length > 0
    ? __PACKAGE_VERSION__
    : "0.0.0";
