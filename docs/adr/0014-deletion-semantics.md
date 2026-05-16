# Lösch-Semantik: Hard-Delete mit kurzem Undo

**Card / Deck / Deck-Set werden hart gelöscht**, ohne Trash-Folder und ohne Soft-Delete-Spalte in IndexedDB. Sicherheitsnetz ist ein **10-Sekunden-Undo-Toast**, der die Lösch-Transaktion bis dahin in-memory hält und erst dann committet. Beim Verlassen des Tabs (`visibilitychange → hidden` / `pagehide`) wird die pending-Transaktion sofort committet — **commit-on-hide**.

**Cascading:**
- **Deck** löschen → enthaltene **Cards** + ihre **Review-States** mit weg.
- **Deck-Set** löschen → enthaltene **Decks** „fallen heraus" und bleiben als **lose Decks** bestehen (ADR-0003 legitimiert lose Decks explizit).
- **Empty Deck-Sets** bleiben bestehen (symmetrisch zu leeren Decks — keine stille Auto-Löschung).

**Confirmation-UX:**
- Einzelne **Card** → kein Modal, nur Undo-Toast.
- **Deck** → Modal mit Card-Anzahl („Deck 'X' und seine 247 Cards löschen?").
- **Deck-Set** → Modal, das den „decks fall out"-Effekt klar macht („Deck-Set 'Y' entfernen? Die 8 enthaltenen Decks bleiben als eigenständige Decks erhalten.").
- **Keine Typing-Confirmation** in v1.

## Considered Options

- **Soft-Delete mit 30-Tage-Trash** — verworfen: zusätzliches Papierkorb-Konzept widerspricht ADR-0009 (friction-light), Base64-Bilder blähen den Trash unverhältnismäßig auf, UI-Overhead für seltenen Fall.
- **Persisted-pending-write** (`pendingDelete`-Flag + `deleteAt`-Timestamp in IndexedDB, Startup-Sweep finalisiert) — verworfen: schmuggelt Soft-Delete-Schema durch die Hintertür ein, komplizierterer Mental-Model als nötig.
- **Rollback-on-hide** (Backgrounding cancelt den Delete) — verworfen: surprising — der Nutzer hat „Löschen" gedrückt und plötzlich ist's wieder da. Mobile-Kontext-Switches sind Alltag, nicht Notfall.
- **Deck-Set-Delete kaskadiert auf Decks** — verworfen: ADR-0003 erlaubt lose Decks explizit; Set ist Gruppierungs-Convenience, nicht Ownership.
- **Auto-evaporating Empty Deck-Sets** — verworfen: surprising silent deletion; nicht symmetrisch zu Decks, die leer existieren dürfen.
- **Typing-Confirmation für große Deletes** („Tippe DECKNAME") — verworfen: Friction. Der Undo-Toast ist das Sicherheitsnetz.

## Consequences

- Die Cascade-Regeln leben in der Domain-Schicht (`src/domain/`), nicht verteilt über UI-Komponenten — `deleteDeck()`, `deleteDeckSet()` etc. sind die kanonischen Eintrittspunkte.
- Toast-Infrastruktur (Sonner o.ä.) wird load-bearing für Datensicherheit — Toast-Suppression (z.B. von einem Modal verdeckt) darf den Undo nicht unmöglich machen.
- Der `visibilitychange`-Listener muss pending-Deletes **synchron** in eine IndexedDB-Transaktion stoßen. IndexedDB-Atomicity garantiert: ein Tab-Kill mid-Transaktion hinterlässt keinen Teil-Zustand — schlimmstenfalls bleibt der Datensatz da (sicherer Failure-Modus).
- Multi-Tab-Edge-Case (zweiter Tab sieht Daten, die im ersten Tab pending-gelöscht sind) ist in v1 akzeptiert — Single-Tab ist Mobile-Default.
