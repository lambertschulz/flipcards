// Builder for the PWA Web App Manifest. Extracted from vite.config.ts so the
// `version` field stays mechanically in lock-step with `package.json#version`
// — ADR-0016 axis #1 ("Im PWA-Manifest und im Footer wird der gleiche Wert
// geführt"). Having it in a plain TS module also lets the unit test below
// pin the contract without needing to evaluate the full Vite config.
//
// `version` is not part of the W3C Web App Manifest spec, but the spec
// allows unknown members and the field is preserved verbatim in the emitted
// `manifest.webmanifest`. That is exactly what we want: a human-readable
// stamp matching the footer/`__PACKAGE_VERSION__` build-time constant.

export type PwaManifest = {
  name: string;
  short_name: string;
  description: string;
  lang: string;
  start_url: string;
  scope: string;
  display: "standalone";
  background_color: string;
  theme_color: string;
  version: string;
  icons: Array<{
    src: string;
    sizes: string;
    type: string;
    purpose?: "maskable";
  }>;
};

export function buildPwaManifest(version: string): PwaManifest {
  return {
    name: "Flipcards",
    short_name: "Flipcards",
    description: "Browserbasierte Spaced-Repetition-Lernanwendung. Alle Daten lokal, kein Account.",
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
    // ADR-0016 axis #1: same SemVer the footer renders.
    version,
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
  };
}
