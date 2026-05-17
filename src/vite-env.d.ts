/// <reference types="vite/client" />

declare module "*.css" {
  const css: string;
  export default css;
}

// ADR-0016: app SemVer is propagated from `package.json#version` via Vite's
// `define` hook in `vite.config.ts`. Declared here so consumers (footer,
// manifest, diagnostics) have a typed accessor and can never read a stale
// hard-coded copy.
interface ImportMetaEnv {
  readonly PACKAGE_VERSION: string;
}

// biome-ignore lint/correctness/noUnusedVariables: ambient module augmentation
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
