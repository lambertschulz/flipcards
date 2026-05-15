# Domain-Layer-Trennung: SRS-Logik isoliert von UI und Persistenz

Die Spaced-Repetition-Logik (SM-2-Berechnung, Card-Due-Filter, Session-Auswahl) lebt in `src/domain/` als **pure TypeScript ohne Imports von React, Dexie oder Jotai**. Die Modul-Struktur ist:

```
src/
  domain/        ← pure: SM-2-Algorithmus, Card-/Deck-/Session-Types, Due-Filter
  db/            ← Dexie-Schema, Repositories — übersetzt zwischen DB-Shape und Domain-Types
  state/         ← Jotai-Atome (laufende Session, UI-Prefs)
  features/      ← UI-Feature-Folders (decks/, sessions/, import-export/)
  components/ui/ ← shadcn-Primitives
  routes/        ← TanStack-Router-Routes, dünn — delegieren an features/
  lib/           ← echte Hilfsfunktionen (debounce, formatDate)
```

Die Regel: `domain/` darf **keine** Imports aus den anderen Layern haben. `db/`, `state/` und `features/` dürfen `domain/` importieren, aber niemals umgekehrt.

## Considered Options

- **Feature-Slicing pur** (`src/features/decks/` mit allem drin) — verworfen: SRS-Logik wäre in einem UI-Feature versteckt, der spätere SM-2→FSRS-Wechsel (siehe ADR-0002) würde Komponenten anfassen müssen.
- **Layer-Slicing klassisch** (`components/`, `hooks/`, `db/`) — verworfen: kein Platz für reine Domain-Logik; landet typischerweise in `lib/` oder `utils/` und vermischt sich dort mit Hilfsfunktionen.
- **Flach starten, später umziehen** — verworfen: ein Domain-Layer nachträglich aus verstreutem Code zu extrahieren ist 10× teurer, als ihn von Anfang an zu trennen.

## Consequences

- SM-2-Tests sind reine Funktionstests in Millisekunden — keine Render-Mocks, keine fake-indexeddb. Das ist die wertvollste Test-Schicht und sollte den Großteil der Coverage tragen.
- SM-2→FSRS-Wechsel (oder ein Wechsel auf irgendeinen anderen SRS-Algorithmus) wird zu einem Eingriff in `src/domain/srs/` mit Schema-Migration in `src/db/`. UI-Komponenten und State bleiben unangetastet.
- Card-Schema-v2 (Cloze, Note-Types, siehe ADR-0005) wird im `domain/`-Layer modelliert, Dexie-Migration übersetzt alte Datensätze.
- Disziplin nötig: es ist verlockend, in `domain/` mal eben `useState` zu importieren. Eine ESLint/Biome-Regel (`no-restricted-imports`) sollte das aktiv verhindern.
- Repositories in `db/` sind die einzige Stelle, die Dexie-Queries kennt. UI-Code arbeitet ausschließlich mit Domain-Types — falls Dexie irgendwann ersetzt wird (z.B. durch OPFS oder einen Sync-Layer), ist die Blast-Radius auf `db/` beschränkt.
