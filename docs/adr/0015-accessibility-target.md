# Accessibility-Ziel: WCAG-AA informell, Keyboard-Coverage hart

**WCAG-AA ist das informelle Ziel** — kein formales Audit, keine Compliance-Zertifizierung. Konkret hart eingehalten werden:

- **Keyboard-Coverage** für alle Aktionen. Der **Review-Flow** ist mit Tastatur vollständig bedienbar (Space = Flip, 1–4 = SM-2-Antworten). Bei jeder neuen Feature-Implementierung gilt: erreichbar ohne Maus = Akzeptanzkriterium.
- **shadcn-/Radix-Primitives nicht „de-styled".** Focus-Rings, ARIA-Attribute, Live-Regions bleiben sichtbar bzw. funktional. Tailwind-`outline-none` ohne Ersatz-Indikator ist verboten.
- **`prefers-reduced-motion`** wird respektiert (insbesondere die Card-Flip-Animation).
- **Color-Contrast WCAG-AA** für Theme-Farben in **Light** und **Dark**. Tailwind-Defaults sind die Baseline; jede Custom-Farbpaarung ist gegen den AA-Schwellwert (4.5:1 für normalen Text) zu prüfen.

**Manueller VoiceOver-Smoke-Test vor jedem Release.** Keine Screen-Reader-Automatisierung in CI.

## Considered Options

- **Formales WCAG-AA-Audit** — verworfen: Audit-Kosten und -Aufwand stehen für ein Hobby-OSS-Projekt nicht im Verhältnis. Informelle Disziplin liefert in der Praxis >90 % des Werts.
- **WCAG-AAA als Ziel** — verworfen: Kontrast-Anforderungen (7:1) zwingen zu engerer Farbpalette; Bewegungs-, Timing- und Audio-Vorgaben sind für eine Lernkarten-App overkill.
- **Keine explizite a11y-Politik** — verworfen: Lernen-unter-Zeitdruck (Pendelei) profitiert massiv von Tastatur-Bedienbarkeit; ohne festgeschriebenes Ziel würde der Review-Flow stillschweigend touch-only.
- **Screen-Reader-Tests in CI** (axe-core, Playwright + VoiceOver/NVDA-Bridges) — verworfen für v1: Setup-Aufwand hoch, False-Positive-Raten lästig, manueller Smoke-Test fängt die relevanten Klassen ab. Nachrüstbar.
- **Reduced-Motion ignorieren** — verworfen: kostet ~3 Zeilen CSS, der Effekt für vestibulär empfindliche Nutzer ist real.

## Consequences

- Jede neue Feature-PR muss den Keyboard-Pfad explizit benennen (im PR-Description oder als Test). Der Review-Flow hat dafür dedizierte E2E-Tests.
- Custom-Komponenten, die Radix-/shadcn-Primitives nicht wiederverwenden, brauchen explizit dokumentierte ARIA-Rollen und Focus-Management.
- Theme-Erweiterungen (zusätzliche Modes, Custom-Accents) müssen den Contrast-Check vor Merge bestehen — Tooling ist die Verantwortung des PR-Autors (z.B. via Browser-DevTools-Audit oder einer der gängigen Contrast-Calculators).
- Der manuelle VoiceOver-Smoke-Test ist Teil der Release-Checkliste (separates Artefakt, nicht in dieser ADR).
- ADR-0009 (Mobile-first) bleibt führend für Touch-Design; diese ADR ergänzt für Tastatur und Screen-Reader, ohne das Touch-Primat zu kippen.
