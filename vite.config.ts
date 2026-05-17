import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import pkg from "./package.json" with { type: "json" };

// ADR-0016 axis #1: `package.json#version` is the single source of truth for
// the app SemVer. Vite bakes it into the bundle as the global identifier
// `__PACKAGE_VERSION__` (see `src/lib/app-version.ts`). Backup-Export stamps
// it into each backup file so the user — and future migration logic — can
// tell which app version produced the file.
export default defineConfig({
  base: "./",
  plugins: [react()],
  define: {
    __PACKAGE_VERSION__: JSON.stringify(pkg.version),
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
