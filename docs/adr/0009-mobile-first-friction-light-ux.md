# Mobile-first, reibungsarmes UX

Flipcards wird **mobile-first** entworfen: Layouts, Touch-Targets und der Review-Flow optimieren sich zuerst für ein Smartphone (One-Thumb, Viewport ab ~320 px) und skalieren von dort responsive nach oben. Desktop bekommt keine separate Design-Spur — Tastatur-Shortcuts sind eine Ergänzung des Touch-Modells, nicht dessen Ersatz.

Daraus folgen zwei reibungssparende Stellungnahmen, die im selben Geist getroffen sind:

- **Kein First-Run-Tutorial, keine Onboarding-Overlays, keine Coach-Marks.** Der Empty State *ist* der Willkommens-Screen. Konsistenz mit ADR-0004 (keine Tageslimits) und ADR-0005 (Card-Modell v1) — die App soll radikal einfach wirken; ein Tour-Overlay würde diese Wahrnehmung am ersten Tag wegerklären.
- **Keine eigene PWA-Install-Aufforderung.** Wir nutzen den nativen Install-Pfad des Browsers (Chrome `beforeinstallprompt`, Safari „Zum Home-Bildschirm hinzufügen"). Kein eigener „App installieren"-Banner.

## Considered Options

- **Desktop-first**, mobile als Squeeze-Down — verworfen: der primäre Anwendungsfall ist die Review-Session, und die findet auf dem Handy statt (Bus, Pause, Bett). Das genau ist auch der Use-Case, in dem PWA-Installierbarkeit (ADR-0006) sich auszahlt. Desktop-first liefert in der Praxis fast immer schlechtes Mobile-UX; der umgekehrte Weg ist mit Tailwind/shadcn günstig.
- **Authoring (Card-Editor) desktop-first, Reviewing mobile-first** — verworfen: zwei Design-Spuren verdoppeln den Aufwand, und der Card-Editor lässt sich responsive mobile-first ausreichend gut bauen (Markdown-Textarea + Bild-Paste funktionieren auf Mobile). Sollte sich später zeigen, dass Authoring auf Mobile zu unzumutbar ist, lässt sich der Editor isoliert nachschärfen, ohne diese ADR zu kippen.
- **Geführte First-Run-Tour** (mehrere Screens oder Spotlight-Overlays) — verworfen: alle drei Empty-State-Optionen (Create / Curated / Import) sind in einer Zeile beschreibbar; eine Tour wäre Overhead ohne Lerngewinn. Nutzerverwirrung später adressieren wir mit Inline-Hilfe (kontextuelle `?`-Affordances), nicht mit globalen Overlays.
- **Eigener PWA-Install-Banner** („Installiere Flipcards!" am oberen Bildschirmrand) — verworfen: gehört zu den meistgehassten Mobile-Web-Patterns. Ein dezenter „App installieren"-Eintrag in den Settings ist nachrüstbar, ohne diese ADR zu berühren.

## Consequences

- Jede UI-Komponente muss auf Smartphone-Viewport (320–414 px Breite) primär funktionieren. Desktop-Layouts entstehen über Breakpoints, nicht über ein separates Design.
- Touch-Targets folgen mobile Mindestgrößen (≈44 px Höhe). Keine Hover-only-Affordances — alles muss per Tap erreichbar sein.
- Tastatur-Shortcuts auf Desktop sind eine Pflichterweiterung, aber dürfen nicht load-bearing werden. Wenn eine Funktion nur per Tastatur erreichbar wäre, ist der Touch-Pfad kaputt.
- Verzicht auf das Tutorial verlagert die Verantwortung in die Selbst-Erklärbarkeit der einzelnen Screens (Card-Editor-Beschriftungen, Empty-State-Karten, sichtbare Affordances). Spätere Nutzerfeedback-Schleifen können das punktuell mit Inline-Hilfe nachschärfen.
- Verzicht auf den Install-Banner heißt: Discoverability der PWA-Installierbarkeit hängt vom Browser ab. Akzeptabel — wer es sucht, findet es; wer es nicht sucht, hätte den Banner sowieso weggetappt.
