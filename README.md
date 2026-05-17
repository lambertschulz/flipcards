# Flipcards

Eine browserbasierte Spaced-Repetition-Lernanwendung. Open Source, ohne Account-Zwang, alle Daten lokal in IndexedDB.

- **Domain & Sprache:** siehe [`CONTEXT.md`](./CONTEXT.md)
- **Architektur-Entscheidungen:** siehe [`docs/adr/`](./docs/adr/)

## Stand

Bootstrap-Skelett. Die Architektur (Vite + React + TS, Tailwind, shadcn/ui, Dexie, TanStack Router mit Hash-History) steht; Features (Card-Editor, Review-Session, Backup, Shared Decks) wachsen darauf in eigenen Tickets.

## Commands

| Script | Beschreibung |
|---|---|
| `pnpm dev` | Vite-Dev-Server |
| `pnpm build` | Production-Build nach `dist/` |
| `pnpm preview` | Production-Build lokal servieren |
| `pnpm test` | Vitest-Suite einmalig ausführen |
| `pnpm test:watch` | Vitest im Watch-Modus |
| `pnpm typecheck` | TypeScript-Check (strict, `--noEmit`) |
| `pnpm lint` | Biome (Lint + Format-Check) |
| `pnpm lint:fix` | Biome mit `--write` |
| `pnpm size` | Bundle-Size-Report via `size-limit` |

## Tooling-Entscheidungen

- **Linter/Formatter:** Biome (siehe [ADR-0006](./docs/adr/0006-tech-stack-v1.md)) — eine Konfiguration statt ESLint + Prettier.
- **Router:** TanStack Router mit `createHashHistory()` (siehe [ADR-0008](./docs/adr/0008-hash-routing-for-github-pages.md)) — GitHub Pages hat keinen SPA-Fallback.
- **Persistenz:** Dexie über IndexedDB, Schema in `src/db/database.ts`. Versionierung gemäß [ADR-0016](./docs/adr/0016-versioning-axes.md) — kein `schemaVersion`-Feld auf Card.
- **Domain-Layer:** `src/domain/` ist pure TypeScript ohne React-, Dexie- oder Jotai-Imports (siehe [ADR-0007](./docs/adr/0007-domain-layer-separation.md)). Biome erzwingt das via `noRestrictedImports`.

## Browser-Support

`browserslist` in `package.json`: `["last 2 versions", "not dead", ">0.5%"]`.

Getestet auf aktuellen Versionen von Chrome, Firefox, Safari (Desktop und iOS) und Edge. Edge wird wie Chrome behandelt. Ältere Browser können funktionieren, sind aber nicht Ziel.

Vorausgesetzte Browser-APIs (alle im obigen Floor verfügbar):

- **IndexedDB v2** (mit Promises via Dexie) — Persistenz.
- **Service Worker** — PWA-Shell.
- **`navigator.storage.estimate()`** — Speicher-Warnungen ([ADR-0013](./docs/adr/0013-image-policy.md)).
- **`prefers-color-scheme`** und **`prefers-reduced-motion`** ([ADR-0015](./docs/adr/0015-accessibility-target.md)).
- **`visibilitychange`/`pagehide`** — commit-on-hide ([ADR-0014](./docs/adr/0014-deletion-semantics.md)).

Keine Polyfills: moderner Target → kleineres Bundle. Wenn ein konkreter Polyfill nötig wird, ist das ein separater Trigger.

## Performance-Budget

Initial-Bundle ≤ 250 KB gzipped (siehe [ADR-0017](./docs/adr/0017-performance-budget.md)). Wird in CI als non-blocking Report gemessen.

## Accessibility

WCAG-AA informell, Keyboard-Coverage hart, `prefers-reduced-motion` respektiert (siehe [ADR-0015](./docs/adr/0015-accessibility-target.md)). Manueller VoiceOver-Smoke-Test vor jedem Release: [`docs/release-checklist.md`](./docs/release-checklist.md).

## GitHub Pages

Der Workflow `.github/workflows/deploy.yml` published `dist/` auf Pushes nach `main`. **Einmalig nötig:** in den Repo-Settings → Pages → Source auf „GitHub Actions" umstellen.

## Lizenz

MIT — siehe [`LICENSE`](./LICENSE).
