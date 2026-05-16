# Statistik-Sichtbarkeit

Flipcards zeigt Lern-Statistiken bewusst breiter als „radikal weniger als Anki", aber ohne deren Power-User-Komplexität. Leitprinzip: weil alle Daten ohnehin lokal liegen (ADR-0001), ist das **Datensammeln** der einzige nicht-rückholbare Schritt — die UI-Surfaces sind günstig und können später wachsen. Konsequenz: **Daten umfassend ab v1 erfassen, Surfaces deliberat ausspielen.**

## Daten-Schema: `Review`-Log

Zusätzlich zum **Review-State** pro Card (SM-2-Felder, ADR-0002) führt v1 eine separate `Review`-Tabelle in IndexedDB. Eine Zeile pro Card-Antwort:

```
Review {
  id           // nanoid
  cardId       // FK auf Card
  timestamp    // ISO-Zeitpunkt der Antwort
  rating       // again | hard | good | easy
  intervalAfter
  easeAfter
}
```

Damit sind alle aktuellen und absehbar zukünftigen Stat-Surfaces aus reinen Read-Projektionen ableitbar:

- **Heatmap** → Gruppierung von Reviews nach Tag des `timestamp`
- **Streak** → konsekutive Tage mit ≥ 1 Review-Zeile
- **„Heute gelernt: X"** → Count der Reviews seit lokaler Mitternacht
- **Per-Card-History** → Filter nach `cardId`, sortiert nach `timestamp`
- **Forecast** → kommt direkt aus `Review-State.nextDue`, braucht den Log nicht

Speicher-Schätzung: ~80 Byte pro Zeile × ~2 000 Reviews/aktivem Jahr/Nutzer ≈ 160 KB/Jahr. Pruning ist in v1 nicht nötig und nicht implementiert. Wenn IndexedDB-Quota real wird, wäre Aggregation (täglich rollierende Counts) eine spätere Optimierung — *ohne* die Per-Card-History zu verlieren, falls die nur in Recent-Form ausreicht.

**Diese Schema-Entscheidung ist die einzige nicht-rückholbare Komponente dieser ADR.** Alle UI-Surfaces können später hinzukommen, entfallen oder verschoben werden, ohne dass historische Daten verloren gehen.

## v1 UI-Surfaces

| Surface | Ort | Daten-Quelle |
|---|---|---|
| **Per-Deck Due-Counter** | Badge auf jeder Deck-Zeile in der Deck-Liste | `Review-State.nextDue ≤ heute`, gruppiert per Deck |
| **„Morgen: Y due" Forecast** | Subtext unter dem Due-Counter (gleiche Deck-Zeile) | `Review-State.nextDue == morgen` |
| **„Heute gelernt: X"** | Eine Zeile auf dem Home-Screen + große Geschafft-Zeile am Session-Ende | Count `Review` seit lokaler Mitternacht |
| **Streak-Counter** (Lernserie) | Chip auf Home-Screen | Konsekutive Tage mit ≥ 1 Review |
| **Global Heatmap** | Eigener „Statistik"-Tab in der Haupt-Navigation | Tagesweise Aggregation aller `Review`-Zeilen |
| **Per-Card-History** | In-Review-Affordance an der Card selbst (z.B. ✓✓✗✓-Verlauf neben dem Back, oder hinter einem „Verlauf"-Tap) | Letzte N `Review`s, gefiltert nach `cardId` |

**Streak ist opt-out.** Settings-Eintrag „Lernserie anzeigen" — Default = an. Adressiert die im ursprünglichen Issue (#4) geflaggte „Stress-induzierend"-Sorge, ohne Streak global zu opfern.

**Navigation:** Die vier Haupt-Tabs auf Mobile (ADR-0009) sind dadurch **Decks / Review / Statistik / Settings**. Vor v1 war Statistik noch kein eigener Tab; dieser Schritt ist eine bewusste Identitäts-Aussage: Statistik ist kein Power-User-Aufsatz, sondern eine erste-Klasse-Surface.

## Bewusst v1-out-of-scope

- **Retention-Curve** (Vergessenskurve, gefittete Funktion) — Anki-FSRS-Feature, semantisch unscharf für nicht-statistik-affine Nutzer.
- **Time-Spent-Metrik** („Du hast 47 h gelernt") — bräuchte Session-Dauer-Erfassung, semantisch wackelig (Tab im Hintergrund?).
- **Multi-Device-Aggregation** — explizit aus ADR-0001 ausgeschlossen. Statistik ist pro IndexedDB-Origin lokal.
- **Pruning der `Review`-Tabelle.** Wird gebaut, wenn Storage-Druck real wird.

## Considered Options

- **Minimum-viable v1** (nur Due-Counter + „Heute gelernt", alles andere später) — verworfen: würde die `Review`-Tabelle erst spät einführen, was bedeutet, dass v1-Nutzer keine Historie für später-nachgerüstete Heatmap/Streak/Per-Card-History haben. Schema-Capture muss *früh* sein, auch wenn die Surfaces phased ausgespielt werden — und wenn das Datenerheben eh läuft, sind die kleinen Surfaces trivial mitzunehmen.
- **Voll-Anki-Stats inkl. FSRS-Retention-Curve und Time-Spent** — verworfen: Retention-Curve braucht statistik-affines Lesepublikum; Time-Spent ist semantisch unsauber (Background-Tabs); beide Surfaces erkaufen sich Komplexität mit zweifelhaftem Mehrwert für die Ziel-Nutzergruppe.
- **Streak ohne Off-Switch** — verworfen: das Issue selbst flaggt „Stress-induzierend". Eine Settings-Toggle ist 5 Zeilen und respektiert beide Nutzungs-Modi.
- **Per-Card-History als Top-Level-Stats-Surface** — verworfen: per-Card-Daten sind *im Moment des Lernens* wertvoll („hab ich das letztes Mal gewusst?"), nicht beim retrospektiven Scrollen. Platzierung an der Card während der Review ist die richtige Anchor.
- **Stats als Drawer/Modal statt eigenem Tab** — verworfen: spart einen Nav-Slot, aber versteckt das, was wir laut Identitäts-Aussage *prominent* haben wollen. Wenn wir Stats erstklassig meinen, gehört es ins Hauptmenü.
- **Aggregierte Tages-Counts statt vollem Review-Log** — verworfen für v1: macht Per-Card-History strukturell unmöglich. Aggregation als spätere Optimierung über den Log ist möglich (Materialized-View-Stil); umgekehrt nicht.

## Consequences

- **`Review`-Tabelle ist Pflicht-Schema ab v1.** Dexie-Schema (ADR-0006) erhält eine neue Tabelle; jede Review-Aktion in der Review-Session schreibt eine Zeile. Migration vom hypothetischen „kein Review-Log"-Zustand entfällt, weil v1 sie von Anfang an hat.
- **„Tages-Grenze" für „Heute gelernt" und Streak nutzt lokale Mitternacht** (im Geräte-Timezone). Reisen über Zeitzonen oder DST-Wechsel können einen Tag verlängern/verkürzen — akzeptabel, Anki verhält sich genauso.
- **Nav hat vier Tabs (Decks / Review / Statistik / Settings).** Mobile-Slot-Budget aus ADR-0009 wird damit ausgereizt; weitere Top-Level-Tabs sind nicht trivial nachrüstbar.
- **Stats-Tab-Implementierung** (Heatmap-Komponente, Forecast-Aggregate, Streak-Detail) ist ein separates `ready-for-agent`-Ticket. Diese ADR pinnt nur Schema + Surface-Liste + Locations.
- **Backup-/Shared-Deck-Format:** der `Review`-Log gehört zum **Backup** (Voll-Snapshot, ADR-0001), aber **nicht** zu **Shared Deck** oder **Shared Deck-Set** (Review-State reist nie mit, per CONTEXT.md). Konsistent mit der existierenden Trennung.
- **Streak-Toggle in Settings.** Wenn off, verschwindet der Chip aus der UI — die zugrundeliegende Streak-Berechnung läuft weiter (oder läuft gar nicht, je nach Implementation; spielt nutzerseitig keine Rolle).
