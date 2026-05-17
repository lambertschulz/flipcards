import path from "node:path";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";
import pkg from "./package.json" with { type: "json" };

// ADR-0016 axis #1: `package.json#version` is the single source of truth for
// the app SemVer. Vite bakes it into the bundle as the global identifier
// `__PACKAGE_VERSION__` (see `src/lib/app-version.ts`). Backup-Export stamps
// it into each backup file so the user — and future migration logic — can
// tell which app version produced the file.
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    // ADR-0006 names vite-plugin-pwa as a day-one default; this is the
    // wiring for issue #25. We *generate* the manifest from this config
    // (no separate manifest.webmanifest in /public) so name/version/colour
    // stay in sync with package.json and the theme. Card images live in
    // IndexedDB so the precache covers only the app shell — see
    // `workbox.globPatterns`. The worker is registered manually from
    // `src/lib/pwa/register.ts` so we can render the update toast
    // ("neue Version verfügbar — Reload?") required by issue #25.
    // ADR-0009 forbids a custom install banner — we deliberately do not
    // touch `beforeinstallprompt` here.
    VitePWA({
      registerType: "prompt",
      injectRegister: null,
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "Flipcards",
        short_name: "Flipcards",
        description:
          "Browserbasierte Spaced-Repetition-Lernanwendung. Alle Daten lokal, kein Account.",
        lang: "de",
        // Hash-Routing (ADR-0008): GitHub-Pages serves us under a sub-path
        // and the app expects to live at the index of whatever origin/path
        // it's deployed to. `"./"` keeps the manifest portable across
        // deploy URLs without baking the GH-Pages prefix into the file.
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#0f172a",
        theme_color: "#0f172a",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Precache the built app shell. Card content (incl. embedded images)
        // lives in IndexedDB, so there's nothing else to cache — the SW
        // just needs the shell available offline (ADR-0001 + ADR-0006).
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"],
        // Hash-Routing again: the document URL is the index, anything else
        // is just an anchor change. Navigation requests should always
        // resolve to the cached index.html (offline fallback).
        navigateFallback: "index.html",
      },
      devOptions: {
        // Keep dev runs free of the worker so HMR isn't shadowed by a
        // stale precache. Manual offline checks happen against
        // `pnpm build && pnpm preview`.
        enabled: false,
      },
    }),
  ],
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
