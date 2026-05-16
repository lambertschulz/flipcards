# UX-Flows v1

Konkretes Layout- und Interaktionsverhalten der Haupt-User-Journeys. Foundation-Entscheidungen (mobile-first, kein Tutorial, kein Install-Banner) leben in [ADR-0009](../adr/0009-mobile-first-friction-light-ux.md). Domänen-Sprache (Card, Deck, Review Session, Due Card, …) in [CONTEXT.md](../../CONTEXT.md).

Dieses Dokument ist die *Spezifikation der einzelnen Screens*. Es ist die Vorlage, aus der die Implementierungs-Tickets pro Screen entstehen.

## Empty State (Home-Screen ohne Decks)

Der Screen, den der Nutzer sieht, wenn keine **Decks** existieren — sowohl beim allerersten Start als auch nachdem er sein letztes Deck gelöscht hat. **Identisch in beiden Fällen** — kein gesonderter First-Run-Modus.

**Layout:**
- Headline: „Willkommen — leg los:" (auch im Post-Deletion-Fall — neutral genug)
- Darunter drei vertikal gestackte **Karten** (nicht Buttons) mit gleicher visueller Gewichtung:

  1. **Eigenes Deck erstellen** — öffnet den Deck-Editor mit leerem Deck
  2. **Curated Deck wählen** — öffnet eine Liste der im App-Bundle ausgelieferten **Curated Decks**
  3. **Deck importieren** — File-Picker für `Shared Deck` / `Shared Deck-Set` / `Backup` JSON

**Wichtig:** Der Import-Pfad muss alle drei JSON-Formate erkennen (Sniff + Routing). Die [CONTEXT.md](../../CONTEXT.md)-Disambiguierung von „Export" gilt — `Backup` und `Shared Deck` sind explizit unterschiedliche Datei-Formate.

**Keine** Tour, **kein** Overlay, **kein** „erstes Mal hier?"-Modal (siehe ADR-0009).

## Deck-Detail-Screen (Launch-Pad für Sessions)

Eintrittspunkt zu einer **Review Session** für einen einzelnen **Deck**.

**Layout (Mobile):**
- Deck-Name + Card-Count + **Due-Badge** („23 due")
- Optionale Liste/Übersicht der Cards (Editierpfad)
- **Primärer CTA**: großer Button „Lernen" am unteren Bildschirmrand → öffnet Session-Start-Sheet (siehe unten)

Der **Tag-Screen** (deck-übergreifender Einstieg in eine **Tag-Session**) ist strukturell identisch: Titel = Tag-Name, Due-Count = Due Cards mit diesem Tag deck-übergreifend, „Lernen"-Button → gleiches Session-Start-Sheet.

## Session-Start-Sheet

Bottom-Sheet, das nach Tap auf „Lernen" hochfährt. Wählt **Open-ended vs Bounded** (siehe [ADR-0004](../adr/0004-sessions-instead-of-daily-limits.md)).

**Inhalt:**
- Segmented-Control mit zwei Optionen:
  - **Bis ich aufhöre** (Open-ended)
  - **Feste Anzahl** (Bounded)
- Wenn „Feste Anzahl" gewählt: Chip-Row mit Presets `10 / 20 / 50 / Alle` + optionales Custom-Input
  - **Alle** = aktuelle Due-Pool-Größe (gehört bewusst in Bounded, nicht als eigener Modus — ADR-0004 lässt Verantwortung für „nicht erschlagen werden" beim Nutzer)
- Großer **„Start"**-Button am Sheet-Boden

**Memory:** Letzte Wahl (Modus + Anzahl) wird **pro Deck** persistiert. Reopen = zwei Taps („Lernen" → „Start"). Pro Deck, nicht global — Intuition für Session-Länge unterscheidet sich pro Inhalt.

**UI-Sprache:** Wir verwenden „Bis ich aufhöre" / „Feste Anzahl" in der UI, nicht die technischen Begriffe „Open-ended" / „Bounded" aus CONTEXT.md. Code/Doku spricht die technischen Begriffe.

## Answer-Screen (Herzstück der Review Session)

Der Screen, auf dem der Nutzer eine einzelne **Due Card** beantwortet.

**Layout (Mobile, vertikal):**

```
┌─────────────────────────────────┐
│ progress ──────────              ✕ │  ← Header-Row
│                                  │
│                                  │
│           Front (Markdown)       │  ← Card-Slot (tap anywhere here)
│                                  │
│                                  │
│                                  │
├──────┬──────┬──────┬─────────────┤
│Again │ Hard │ Good │   Easy      │  ← Grading-Row (fixed bottom)
└──────┴──────┴──────┴─────────────┘
```

### Reveal-Modell

- **Tap irgendwo im Card-Slot** → Front wird durch Back ersetzt. Same visual slot, **instant swap**, keine Animation. Tap-Zone ist der gesamte Card-Bereich, nicht ein expliziter „Show Answer"-Button.
- Eine geplante zukünftige Erweiterung (Cloze-Deletion, ADR-0005) würde dieses Modell brechen — wenn das nachgerüstet wird, muss der Reveal-Mechanismus überdacht werden. In v1 unbedenklich (Card-Modell hat keine interaktiven Front-Elemente).

### Grading-Row

- **Vier Buttons in einer Zeile**, fixed am unteren Viewport-Rand (Thumb-Zone)
- **Reihenfolge** links→rechts: Again / Hard / Good / Easy — als Skala lesbar, nicht als Kategorien
- **Vor dem Reveal**: Buttons sichtbar aber **disabled/gedimmt** (kein Layout-Shift; lehrt die Affordance)
- **Nach dem Reveal**: aktiv. Optional kurzer (~100 ms) Opacity-Fade als Causality-Signal — die einzige erlaubte Animation.
- **Beschriftung**: nur Label („Again" / „Hard" / „Good" / „Easy"), **keine** Intervall-Vorschau („4d") in v1 — wäre kognitiver Overhead und koppelt UI an SM-2; nachrüstbar.
- **Farbcodierung**: Again = destructive, Hard = amber, Good = primary, Easy = muted/blue. Farbe ergänzt das Label, ersetzt es nie (Accessibility).
- **Mapping auf SM-2-Quality**: siehe [ADR-0002](../adr/0002-srs-algorithm-sm2.md) — das ist Domänenlogik, nicht UX.

### Header-Row

- **Bounded-Modus**: dünner Progress-Strip am oberen Viewport-Rand + kleine Text-Angabe „3 / 20"
- **Open-ended-Modus**: nur „3 reviewed" — kein Strip, **keine** Due-Pool-Restanzeige (würde frisch importierte 500-Card-Decks als Druck-Aufbau anzeigen — genau das, was ADR-0004 vermeidet)
- Rechts oben: **✕-Icon** → Confirmation-Sheet „Genug für heute?" (zwei Buttons: „Weiter lernen" / „Beenden")
  - Identisches Verhalten in beiden Modi — Pause und Stop sind ein Konzept
  - Confirm-Step schützt gegen Fehl-Tap und macht das „ich höre auf" zu einer bewussten Geste (Geist von ADR-0004)

## Session-Summary-Screen

Was der Nutzer sieht, wenn eine Session endet — egal ob durch natürliches Ende (Bounded-Limit erreicht / Due-Pool leer) oder durch manuelles Beenden.

**Inhalt:**
- Anzahl beantworteter Cards in dieser Session
- Verteilung der Bewertungen (z.B. „12 Good · 3 Hard · 2 Again · 3 Easy")
- CTA zurück zur Deck-Liste (oder zum aktuellen Deck/Tag-Screen, je nach Einstieg)

Macht aus „ich höre auf" → „ich habe etwas geschafft". Werte-Entscheidung, kein Streak-Grinding.

## Tastatur-Shortcuts (Desktop)

Ergänzung des Touch-Modells, nicht Ersatz (siehe ADR-0009):

| Taste            | Wirkung                                  |
| ---------------- | ---------------------------------------- |
| `Space` / `Enter`| Front → Back (Reveal)                    |
| `1`              | Grade „Again" (nur nach Reveal aktiv)    |
| `2`              | Grade „Hard"                             |
| `3`              | Grade „Good"                             |
| `4`              | Grade „Easy"                             |
| `Esc`            | öffnet das „Genug für heute?"-Sheet      |
| `?`              | öffnet kurze Shortcut-Übersicht (Discoverability) |

Touch-Pfad muss ohne Tastatur vollständig funktionieren.

## Sprach- und Theme-Defaults

- **Sprache**: Auto-Detect aus `navigator.language`; Fallback Englisch wenn nicht `de-*`. Keine First-Run-Frage. Switcher in den Settings (Issue #9).
- **Theme**: System-Default (Light/Dark per `prefers-color-scheme`). Switcher ebenfalls in den Settings.
- **Reduced Motion**: `prefers-reduced-motion: reduce` deaktiviert die einzige Animation (Grading-Button-Fade) — da der Baseline ohnehin animationsarm ist, ist die A11y-Kosten klein.

## Was hier *nicht* drin steht

- **Card-Editor**-Layout (Markdown-Editor, Bild-Paste-UX) → Issue #5
- **Edit-during-Review** (Card mitten in Session korrigieren) → Issue #6
- **Statistik-Sichtbarkeit** (welche Anki-Style-Metrics zeigen wir) → Issue #4
- **Settings-Umfang** (was ist konfigurierbar) → Issue #9
- **Suche** (Volltext, Filter, Scope) → Issue #10

Diese Themen haben eigene offene Tickets und kreuzen das UX-Layout nur an benannten Punkten (z.B. Settings-Eintrag für Sprache).
