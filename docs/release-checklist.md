# Release-Checkliste

Manuelle Schritte vor jedem Release. Automatisierte Gates (Typecheck, Tests, Lint, Size-Budget) laufen ohnehin in CI — hier stehen nur die Dinge, die ein Mensch verifizieren muss.

## a11y-Smoke-Test (ADR-0015)

Pflicht vor jedem Release. Erwartete Dauer: ≤ 10 Minuten.

### Keyboard-Coverage

- [ ] Auf der Deck-Liste mit `Tab` durch alle interaktiven Elemente navigierbar. Focus-Ring ist überall sichtbar.
- [ ] Eine Review-Session starten **ohne Maus**:
  - [ ] `Tab` zum Deck, `Enter` öffnet die Detail-Ansicht.
  - [ ] `Tab` zu "Lernen", `Enter` startet die Session.
  - [ ] `Tab` zu "Open-ended", `Enter` öffnet den Review-Flow.
- [ ] Im Review-Flow:
  - [ ] `Space` dreht die Card um.
  - [ ] `1`–`4` bewertet (1 = Again, 2 = Hard, 3 = Good, 4 = Easy).
  - [ ] Komplette Session bis zur Summary durchspielbar, nur Tastatur.

### Reduced-Motion

- [ ] macOS: System Settings → Accessibility → Display → "Reduce Motion" aktivieren. Card-Flip + UI-Übergänge sind merklich verkürzt.
- [ ] Browser DevTools (Chrome/Firefox): Rendering-Panel → "Emulate CSS media feature prefers-reduced-motion: reduce". Gleiche Erwartung.

### VoiceOver-Smoke-Test (macOS)

VoiceOver mit `Cmd+F5` starten. Screen-Reader-Tests sind manuell (kein CI-Setup, siehe ADR-0015).

- [ ] Deck-Liste: Decks werden mit Namen und Card-Anzahl angesagt.
- [ ] Review-Flow: Card-Front wird vorgelesen. Nach `Space` (oder VoiceOver-Click) wird die Back vorgelesen.
- [ ] Rating-Buttons (1 Again … 4 Easy): jeder Button wird mit Position und Beschriftung angesagt.
- [ ] Session-Summary: Anzahl Cards + Verteilung wird angesagt.
- [ ] Settings-Seite: Theme-Auswahl ist als Radio-Group / Combobox erkennbar.

Befund-Schema für gefundene Probleme: GitHub-Issue mit Label `area:a11y`, im Body kurz Schritte zur Reproduktion und VoiceOver-Ausgabe.

### Theme-Contrast

Stichprobe (nicht erschöpfend) — Light und Dark gegen die WCAG-AA-Schwellen (4.5:1 für Body-Text, 3:1 für Large-Text):

- [ ] Body-Text auf Deck-Liste (Light + Dark).
- [ ] Card-Front + -Back im Review-Flow (Light + Dark).
- [ ] Rating-Buttons (Default + Hover) (Light + Dark).

Tooling-Vorschlag: Chrome DevTools → Inspect → Accessibility-Panel → Contrast-Ratio, oder eine der gängigen Browser-Erweiterungen ("Stark", "WCAG Color Contrast Checker").

## Build- und Größen-Check

- [ ] `pnpm typecheck` grün.
- [ ] `pnpm test` grün.
- [ ] `pnpm lint` grün.
- [ ] `pnpm build` grün; Bundle-Größe innerhalb des Size-Budgets (`pnpm size`).

## Release-Notes

- [ ] CHANGELOG (oder PR-Titel des Release-PRs) listet die nutzersichtbaren Änderungen seit dem letzten Tag.
- [ ] Bekannte a11y-Befunde aus diesem Release-Cycle sind als offene Issues nachverfolgbar oder behoben.
