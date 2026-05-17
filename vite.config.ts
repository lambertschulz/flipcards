import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import pkg from "./package.json" with { type: "json" };

// ADR-0016: `package.json#version` is the single source of truth for the app
// SemVer. We bake it into the bundle as `import.meta.env.PACKAGE_VERSION` so
// the PWA-manifest, footer, and any diagnostics widget can read it without a
// runtime fetch. Tests get the same value, which is why this lives at config
// scope rather than inside `build`.
export default defineConfig({
  base: "./",
  plugins: [react()],
  define: {
    "import.meta.env.PACKAGE_VERSION": JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    css: false,
  },
});
