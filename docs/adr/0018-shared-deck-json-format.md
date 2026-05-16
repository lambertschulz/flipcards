# Shared-Deck-JSON-Format v1

Konkretes JSON-Format für **Shared Deck** und **Shared Deck-Set** — die Austauschdateien, die per User-Export, Peer-Import und Curated-Deck-Pipeline durch das System reisen. Setzt die in [ADR-0016](0016-versioning-axes.md) (eigene `formatVersion`-Achse pro Datei-Typ), [ADR-0010](0010-curated-decks-pipeline.md) (Curated-Bundle erbt dieses Format), [ADR-0011](0011-import-conflict-resolution.md) (Merge per stabiler ID) und [ADR-0013](0013-image-policy.md) (Bilder inline als Base64) etablierten Regeln um.

## Format

Zwei Top-Level-Formen, durch ein `format`-Diskriminanten-Feld auseinandergehalten. Beide tragen ihren eigenen `formatVersion`-Zähler. Beide werden ausschließlich als UTF-8-JSON serialisiert (Zeilenenden im Markdown-Inhalt sind `\n`).

### Shared Deck

```ts
type SharedDeck = {
  format: "flipcards.shared-deck";
  formatVersion: 1;
  exportedAt: string;          // ISO 8601, informativ — niemals merge-relevant
  deck: SharedDeckMeta;
  cards: SharedCard[];
};

type SharedDeckMeta = {
  id: string;                  // opake stabile ID (Default: nanoid/UUID), siehe „IDs"
  name: string;                // 1..200 Zeichen nach Trim
  description?: string;        // Markdown, beliebige Länge
  // Optional, nur für Curated-Decks gesetzt (ADR-0010). In v1 nicht in der UI sichtbar.
  curatedSourceId?: string;    // stabile Catalog-ID
  contentVersion?: number;     // monoton steigend pro Curated-Submission
};

type SharedCard = {
  id: string;
  front: string;               // Markdown, eingebettete Bilder als data:-URIs (ADR-0013)
  back: string;                // Markdown
  tags: string[];              // flach, dedupliziert, nicht-leer nach Trim
};
```

Minimales Beispiel:

```json
{
  "format": "flipcards.shared-deck",
  "formatVersion": 1,
  "exportedAt": "2026-05-16T10:14:00Z",
  "deck": {
    "id": "4f2c3a1b-7d8e-4a6b-9c2d-1e3f5a7b9c0d",
    "name": "Französisch — Vokabeln A2",
    "description": "Wortschatz aus „Voyage en France", Lektion 4–8."
  },
  "cards": [
    {
      "id": "a1b2c3d4-e5f6-4789-a0b1-c2d3e4f5a6b7",
      "front": "l'ouïe",
      "back": "das Gehör (f.) — der Hörsinn\n\n[lwi]",
      "tags": ["körper", "prüfung"]
    }
  ]
}
```

### Shared Deck-Set

```ts
type SharedDeckSet = {
  format: "flipcards.shared-deck-set";
  formatVersion: 1;
  exportedAt: string;
  deckSet: {
    id: string;
    name: string;               // 1..200 Zeichen nach Trim
    description?: string;
  };
  decks: SharedDeckEntry[];
};

type SharedDeckEntry = SharedDeckMeta & {
  cards: SharedCard[];
};
```

Ein Shared Deck-Set ist *kein* Array von `SharedDeck`-Objekten — die enthaltenen Decks tragen keinen eigenen `format`/`formatVersion`/`exportedAt`-Header, weil sie nur im Kontext des Sets existieren. Das spart Bytes und macht die Top-Level-Diskriminierung eindeutig.

## Validierungsregeln

- **Top-Level `format`** muss exakt einer der zwei Literale sein. Unbekannter Wert → Parse-Fehler vor jeder weiteren Prüfung.
- **`formatVersion === 1`** wird im v1-Parser akzeptiert. Höhere Werte → „Datei stammt aus einer neueren App-Version" (Nutzer-freundliche Fehlermeldung, kein Crash). Niedrigere Werte werden — falls je eine v2+ existiert — durch eine versionierte Migration vor Zod-Validierung geschickt (ADR-0016).
- **IDs** (`deck.id`, `deckSet.id`, `card.id`): nicht-leere Strings, Regex `/^[A-Za-z0-9_-]{8,}$/`. Schema ist bewusst tolerant — UUID v4 (aktuelle Implementierung) *und* nanoid sind beide gültig. Inhaltliche Konsequenz: zwei Cards mit derselben `id` innerhalb desselben Decks → Parse-Fehler. Eindeutigkeit über Decks hinweg ist nicht erforderlich, weil Cards an Decks gebunden sind.
- **`name`** (Deck und Deck-Set): 1..200 Zeichen nach Trim. Längere Namen → Fehler statt Truncation, damit der Nutzer bewusst kürzt.
- **`tags`**: jeweils nicht-leer nach Trim, kein führendes/trailing Whitespace, dedupliziert. Maximale Tag-Länge: 64 Zeichen.
- **`front` / `back`**: dürfen leer sein (Anwendungsfall: einseitige Cloze-artige Notizen wird zwar v2-Material aus ADR-0005 sein, aber das Schema soll nicht „leere Antwort" pauschal verbieten). Eingebettete Bilder müssen `data:`-URIs sein; *externe* `http(s)`-Bild-URLs werden vom Parser **akzeptiert** (kein harter Fehler), aber durch eine Linting-Warnung der Curated-Pipeline (ADR-0010) abgelehnt.
- **Card-Größenlimit**: 5 MB Base64-Bytes pro Card aus ADR-0013 wird *beim Import* erneut geprüft, nicht im JSON-Schema selbst. So bleibt das Schema kompakt und das Limit lebt an einer Stelle.

## Entscheidungen, die nicht offensichtlich sind

- **`format` als String, nicht als nummerischer Tag.** Self-describing: man kann eine fremde JSON-Datei öffnen und sofort sehen, wofür sie gedacht ist. Macht spätere `flipcards.backup` / `flipcards.preset` / etc. einheitlich diskriminierbar.
- **`formatVersion` ist eine Integer-Zahl, kein SemVer-String.** Schema-Migration ist immer in einer Richtung (alt → neu) und braucht keine Patch-Level-Granularität. Integer macht die Migration-Tabelle (`migrations[fromVersion]`) trivial.
- **`exportedAt` ist informativ.** Konflikt-Auflösung (ADR-0011) hängt an Card-IDs, nicht an Timestamps. Das Feld existiert für menschliche Lesbarkeit („Export vom 14. Mai") und für die Curated-Pipeline-Diagnose, sonst nichts. Insbesondere wird beim Merge **nicht** „neueres ‚exportedAt' gewinnt" gemacht.
- **Keine Review-States.** CONTEXT.md ist eindeutig: Review-State bleibt strikt lokal. Wenn jemand fremde Review-States importieren will, ist das **Backup**, nicht **Shared Deck**.
- **Keine Reihenfolge-Felder.** Die Reihenfolge der Cards im JSON-Array *ist* die Reihenfolge. Beim Import wird sie übernommen; spätere lokale Umsortierung lebt nur lokal.
- **Keine `language`/`locale`-Felder auf Card-Ebene.** Sprache ist eine Deck-Eigenschaft, nicht Card-Eigenschaft. In v1 nicht im Schema; die Curated-`index.json` (ADR-0010) trägt sie separat als Discovery-Metadatum, ohne den Deck-Inhalt aufzublähen.
- **Curated-Felder direkt am Deck statt im Wrapper.** `curatedSourceId` und `contentVersion` reisen am Deck, weil das Deck die Update-Einheit ist (siehe ADR-0010). Ein Curated **Deck-Set** ist v1-out-of-scope; falls es kommt, kann es sein eigenes Catalog-ID-Feld bekommen, ohne dieses Schema zu brechen.
- **`description` ist Markdown auf Deck und Card, Plain-Text auf Deck-Set.** Pragmatisch: Deck-Set-Beschreibungen erscheinen in kompakten Listen, Markdown wäre overkill. Wenn das jemals geändert wird, ist Plain-Text → Markdown eine non-breaking Aufwertung.

## Considered Options

- **Schema-Wrapper-Variante**: ein einziges Top-Level-Format `flipcards.export` mit einem inneren `kind: "deck" | "deck-set" | "backup"` — verworfen, weil ADR-0016 explizit getrennte `formatVersion`-Achsen pro Datei-Typ vorgibt. Ein gemeinsamer Wrapper würde Versionierung über Datei-Typen wieder koppeln.
- **Cards außerhalb des Decks (Top-Level `cards`-Array mit `deckId`-Referenz)**, wie bei einer relationalen Export-Variante — verworfen: macht das Schema komplexer ohne Gewinn. Cards gehören zu *genau einem* Deck (ADR-0003), die Einbettung ist die natürliche Repräsentation.
- **Bilder als separate Asset-Files** (Multi-File-ZIP statt Single-JSON) — verworfen für v1: bricht den „eine Datei rein-importieren"-Flow, erfordert Browser-ZIP-Lib im Bundle, und die 5 MB-Card-Grenze macht reine JSON sowieso tragbar. Nachrüstbar als `format: "flipcards.shared-deck-bundle"` falls je nötig.
- **Inhaltliche Eindeutigkeitschecks beim Schema** (z.B. „keine zwei Cards mit identischer Front") — verworfen: ADR-0005 schließt Duplikate nicht aus (es kann legitime Gründe geben). Schema bleibt strukturell, semantische Checks leben in der Import-Pipeline.
- **`exportedBy`-Feld mit App-Version** — verworfen für v1: diagnostisch nice-to-have, aber niemand braucht es zum Importieren. Nachrüstbar.

## Consequences

- **Implementierung lebt in `src/domain/shared-deck/`** (Pfad bereits von ADR-0016 vorgegeben). Drei Module: `schema.ts` (Zod-Schemas, exportiert die TS-Types), `migrate.ts` (versionierte Migrations, in v1 leer/identity), `validate.ts` (höhere Checks, z.B. Card-Größe gemäß ADR-0013).
- **Zod-Schema ist die Quelle der Wahrheit**, sowohl für Laufzeit-Import als auch für die Curated-CI-Validierung (ADR-0010). Die TypeScript-Types in dieser ADR sind das Was, die Zod-Schemas sind das *Wie*; bei Drift gewinnt Zod.
- **Card-Domain (`src/domain/card/`) muss vor der Schema-Implementierung definiert werden** — das Shared-Deck-Schema referenziert die Card-Struktur. Aktuell ist `src/domain/card/index.ts` noch ein Stub.
- **Importer/Exporter-Tickets** (#21 Backup, #22 Shared Deck, #23 Shared Deck-Set, #24 Curated-UI) implementieren konkrete I/O-Pfade gegen dieses Schema. Sie ziehen kein zweites Schema ein.
- **Schema-Evolution** läuft strikt über `formatVersion`-Bumps. Ein v2 wird ein neues Schema-Modul, eine v1→v2-Migration und eine Test-Fixture für „v1-Datei vor und nach Migration" mitbringen. Die ADR hier wird *nicht* nachträglich umgeschrieben — eine ADR-0019 (oder so) dokumentiert dann die v2-Schema-Erweiterung.
- **JSON-Beispiele in dieser ADR sind normativ** für v1: jede Pipeline (Test-Fixtures, Curated-CI, Docs) sollte sich an diesen Beispielen orientieren, damit Drift sofort sichtbar wird.
