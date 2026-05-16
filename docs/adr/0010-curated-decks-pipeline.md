# Curated-Decks-Pipeline

Ein **Curated Deck** ist ein **Shared Deck** (bzw. **Shared Deck-Set**), dessen JSON unter `public/curated/` im App-Bundle mitausgeliefert wird. Die App entdeckt verfügbare Curated Decks über eine `public/curated/index.json`-Manifest-Datei und lädt einzelne Deck-JSONs erst beim Öffnen nach. Einmal importiert, ist ein Curated Deck technisch ein normales **Deck** — gleicher Code-Pfad, gleiche Konfliktbehandlung wie ein peer-geteiltes Shared Deck.

**Identifier-Stabilität.** Jedes **Deck** und jede **Card** trägt eine stabile `nanoid`, einmalig zum Erstellzeitpunkt vergeben. IDs bleiben über alle Export-/Import-Flows (**Shared Deck**, **Shared Deck-Set**, **Backup**) erhalten und werden niemals neu generiert. Ein Contributor, der ein Curated Deck einreicht, baut es in seiner normalen Flipcards-App, exportiert es als Shared Deck und reicht das resultierende JSON ein — die IDs sind die `nanoid`s vom Erstellzeitpunkt.

**Re-Import-Semantik (additiv per Card-ID).** Beim Import eines **Shared Decks**, dessen Deck-ID einer lokalen Deck-ID entspricht, ist das Verhalten **additiv**:

- Cards im Import, deren ID lokal nicht existiert, werden hinzugefügt.
- Cards, deren ID in beiden vorhanden ist, werden übersprungen — lokaler Inhalt und **Review-State** bleiben unverändert.
- Cards, die nur lokal existieren, bleiben unverändert.
- Deck-Metadaten (Titel, Beschreibung) des lokalen Decks bleiben unverändert.

Diese Regel gilt einheitlich für *alle* Shared Decks — Curated oder peer-geteilt. Sie ist die Grundlage, auf der Issue #3 (Import-Konflikte) aufbaut.

**Provenance-Felder.** Importierte Curated Decks bekommen in IndexedDB persistent:

- `curatedSourceId` — stabil über alle Versionen eines Curated Decks
- `version` — monoton aufsteigende Integer, vom Maintainer pro Release-Schritt erhöht

v1 zeigt diese Felder nicht in der UI. Sie liegen für die zukünftige „Update verfügbar"-UX bereit, ohne Schema-Migration.

**Update-Pfad (v1).** Ein erneuter Import des neueren Curated-Deck-JSONs *ist* der Update-Mechanismus. Die additive Merge-Regel sorgt dafür, dass Review-State erhalten bleibt und neue Karten aus v2+ hinzukommen. Eine eigene Update-Detection-UX (Badge, Merge-Dialog mit Konfliktauflösung) ist explizit v1-out-of-scope und wird in einem späteren Ticket aufgesetzt, das auf der allgemeinen Konflikt-Auflösung aus Issue #3 aufbaut.

**Submission-Pipeline.** Curated-Deck-Beiträge laufen als Pull-Request gegen dieses Repo:

- Neue Datei `public/curated/<slug>.json` mit dem exportierten Shared Deck.
- Ergänzung von `public/curated/index.json` um einen Eintrag mit Titel, Beschreibung, Sprache, Card-Count, `curatedSourceId`, `version`.
- PR-Beschreibung enthält eine Attestierung, dass der Contributor den Inhalt unter der Repo-Lizenz relicensieren darf (siehe Lizenz, unten).

CI validiert blockierend:

- Das Deck-JSON parsed und entspricht dem `SharedDeck`-Zod-Schema (dasselbe Schema, das auch zur Laufzeit Imports validiert — eine Quelle der Wahrheit).
- Alle Card-IDs innerhalb des Decks sind eindeutig.
- `curatedSourceId` ist eindeutig über alle Einträge in `index.json`.
- Bei Update eines bestehenden `curatedSourceId` ist `version` strikt größer als der bisher gemergte Wert (Diff gegen `main`).
- Deck-JSON ist ≤ 5 MB.

Maintainer reviewt Schema-Compliance, Größe, Lizenz-Attestierung und offensichtliche Bad-Faith-Inhalte. Inhaltliche Korrektheit (z.B. „ist das Französisch grammatikalisch richtig?") ist explizit Contributor-Verantwortung — der Maintainer ist kein Lektor.

**Lizenz.** Curated Decks erben die Repo-Lizenz (festgelegt in Issue #11). Ein optionales Per-Deck-`license`-Feld im Shared-Deck-JSON ist v1-out-of-scope: ein Inhalts-Kurations-Problem als Schema-Problem getarnt. Decks, deren Inhalt nicht unter die Repo-Lizenz relicensiert werden kann, werden nicht gemergt. Nachrüsten eines optionalen Feldes ist nicht-breaking.

## Considered Options

- **Build-time JSON-Imports in den JS-Bundle** (Variante A: `import deck from './curated/foo.json'`) — verworfen: bläht den First-Paint-JS-Bundle auf und zwingt zu einem Full-Rebuild für Content-only-Beiträge. Discovery via tiny Manifest + On-Demand-Fetch ist günstiger.
- **Runtime-Fetch von einem dritten Origin** (GitHub raw, externer CDN, Sibling-Repo) — verworfen: zweite Quelle der Wahrheit (Katalog-Version vs. App-Version), CORS- und Rate-Limit-Friktion, durchbricht die „reine statische Web-App"-Linie aus ADR-0001 für unklaren Gewinn. Gleicher Origin via GitHub Pages reicht.
- **Volle Content-Update-Detection in v1** (Badge „Update verfügbar", Merge-UI mit Per-Conflict-Resolution) — verworfen: dieselbe Konflikt-Auflösung wird Issue #3 für generische Shared-Deck-Imports liefern. Eine zweite, spezialisierte Curated-Update-Pipeline würde dieselbe Logik in zwei Flows pflegen.
- **Overwrite-on-Reimport bei matchender Card-ID** — verworfen: würde User-Edits stillschweigend rückgängig machen und die Review-State-Erhaltung verkomplizieren. Die additive Regel ist in einem Satz erklärbar und liefert die richtige Failure-Mode (Stale-Typo > verlorene Edits).
- **Per-Deck-`license`-Feld im Shared-Deck-JSON** — verworfen für v1: das Shared-Deck-Schema gilt für alle Exporte, nicht nur Curated. Ein Feld, das nur in einem Sub-Set sinnvoll ist, verschmutzt das Daten-Modell. Nachrüstbar als optionales Feld.
- **CI-vergebene oder content-gehashte IDs** — verworfen: `nanoid` zum Card-Erstellzeitpunkt erfüllt die Merge-Regel bereits. Content-Hashing würde ID an Inhalt koppeln und „Card editieren ohne Review-State zu verlieren" brechen.
- **Trusted-Contributor-Tier** (Push-Rechte für wiederholte Contributors statt PR-Review) — verworfen für v1: keine Skala, die das rechtfertigen würde. Nachrüstbar.

## Consequences

- Das **Shared-Deck-JSON-Schema** muss stabile `id`-Felder auf Deck *und* jeder Card enthalten. Issue #3 baut auf derselben Merge-by-ID-Regel für peer-geteilte Shared Decks auf.
- `public/curated/index.json` ist die einzige Datei, die der Curated-Screen zum Rendern des Katalogs braucht. Sie bleibt klein (Titel, Beschreibung, Sprache, Card-Count, `curatedSourceId`, `version`); Card-Inhalte leben in den Per-Deck-JSONs und werden erst beim Öffnen nachgeladen.
- Der Service Worker (ADR-0006, `vite-plugin-pwa`) sollte `index.json` network-first cachen und Per-Deck-JSONs cache-first — natürliches Offline-Verhalten nach dem ersten Besuch.
- Zukünftige „Update verfügbar"-UX braucht keine Schema-Migration: `curatedSourceId` und `version` werden bereits ab v1 persistiert.
- Die *Discovery-UX* (Curated-Screen-Layout, Filter, Suche), die ersten Sample-Curated-Decks, der konkrete CI-Workflow (YAML) und ein CONTRIBUTING-Abschnitt für Submissions sind explizit **nicht** in dieser ADR — sie werden als separate Tickets eröffnet, die auf diese ADR referenzieren.
- Maintainer-Workload pro Submission ist bewusst klein gehalten (Schema/Größe/Lizenz, kein inhaltliches Review). Wenn Submissions trotzdem überfordern, ist der nächste Schritt eine `trusted-contributors`-Liste, nicht ein anderes Bundling-Modell.
