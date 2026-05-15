# Tech-Stack v1

Flipcards wird als **React + Vite + TypeScript**-SPA gebaut, mit **Dexie.js** als IndexedDB-Wrapper, **Jotai** für ephemeralen State, **TanStack Router** (Hash-History), **Tailwind CSS** mit `@tailwindcss/typography`, **shadcn/ui** für UI-Primitives, **react-markdown** (+ `remark-gfm`, `rehype-sanitize`) für Card-Rendering, **Zod** für Schema-Validierung importierter JSON, **react-i18next** (Deutsch + Englisch) für Übersetzungen, **vite-plugin-pwa** für Service Worker und Installierbarkeit, und **Vitest + React Testing Library + fake-indexeddb** als Test-Stack. Tooling: **pnpm**, **Biome**, **nanoid**, **@phosphor-icons/react**.

Dieses ADR hält den Stack als Snapshot fest. Jede einzelne Wahl wird unten kurz begründet, damit ein späteres „warum X und nicht Y?" beantwortet ist, ohne ein eigenes ADR pro Library zu brauchen.

## Considered Options

- **React vs. SvelteKit vs. SolidJS vs. Vanilla** — React gewählt wegen größter Contributor-Basis (Open Source ohne Account-Zwang lebt von leichter Beteiligung). Bundle-Größe und Eleganz von Svelte verloren bewusst gegen Verbreitung.
- **Dexie.js vs. idb vs. RxDB vs. native IndexedDB** — Dexie gewählt wegen typisierter Tabellen und eingebautem Migrations-System. Schema-Migrationen sind garantiert nötig (siehe ADR-0002 für SM-2→FSRS-Pfad und ADR-0005 für offene Card-Erweiterbarkeit).
- **Jotai vs. Zustand vs. Redux** — Jotai wegen Maintainer-Vertrautheit; für eine App dieser Größe ist der architektonische Unterschied marginal. `atomWithStorage` für UI-Prefs ist zusätzlich praktisch.
- **TanStack Router vs. React Router** — TanStack wegen type-safety auf Route-Params (Deck-IDs, Tag-Namen). Hash-History wegen GitHub-Pages-Hosting (siehe ADR-0008).
- **Tailwind + shadcn/ui vs. CSS Modules vs. Mantine** — Tailwind wegen `@tailwindcss/typography` (`prose`-Klasse rendert Markdown-Cards mit sinnvollen Defaults). shadcn/ui copy-paste-Komponenten geben Radix-basierte Accessibility ohne Versions-Lock.
- **react-markdown vs. markdown-it vs. MDX** — react-markdown wegen Plugin-Pipeline (späteres KaTeX/Highlighting trivial). MDX verworfen: bei user-generiertem Content wäre eingebettetes JSX gefährlich.
- **rehype-sanitize ist nicht optional** — **Shared Decks** kommen von Fremden. Ohne Sanitization ist `<script>` im Markdown ein XSS-Vektor in der ganzen App.
- **Zod vs. Valibot vs. ArkType** — Zod wegen Reife und discriminated-union-Support für versionierte Card-Schemas (`SharedDeckV1`, `SharedDeckV2`).
- **vite-plugin-pwa von Tag 1** — verworfen, das später nachzurüsten. Local-first ohne Offline-Fähigkeit der App selbst wäre konzeptuell inkonsistent.
- **Vitest + fake-indexeddb statt Playwright von Tag 1** — Domain-Logik (SM-2) und Dexie-Operationen sind ohne echten Browser testbar. Playwright nachrüsten, wenn UI-Regressionen real werden.
- **i18next mit De+En** — verworfen, nur Deutsch hardcoded zu lassen; Englisch erweitert den Contributor-Kreis und ist mit i18next ein Einzeiler pro String.
- **pnpm / Biome / nanoid / Phosphor** — Bikeshed-Defaults, in keinem Fall lock-in-relevant. Biome statt ESLint+Prettier bewusst, weil Greenfield-Repo und ~10× schneller.

## Consequences

- Bundle wird größer als bei einer Svelte-Lösung; akzeptabel für eine App, die nach Installation als PWA offline läuft (erstmaliger Download zählt nur einmal).
- Schema-Migrationen müssen sowohl in Dexie (DB-Shape) als auch in Zod (Import-Validierung) gepflegt werden. Bei Card-v2 sind beides Touchpoints.
- Tailwind's Utility-First-Ansatz erfordert Disziplin bei Komponenten-Wiederverwendung — gegengewichtet durch shadcn-Komponenten als wiederverwendbare Bausteine.
- Service Worker bringt Update-UX-Anforderung: Nutzer brauchen einen klaren „neue Version verfügbar"-Prompt.
