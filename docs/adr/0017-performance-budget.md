# Performance-Budget und Scale-Targets

Konkrete Zahlen für die in [ADR-0005](0005-card-model-v1-scope.md) und [ADR-0006](0006-tech-stack-v1.md) implizit getroffenen Skalierungs-Annahmen. **Enforcement-Posture: soft CI-Checks** — Bundle-Size und Lighthouse-Scores werden in CI sichtbar gemacht, ohne PRs zu blocken.

## Scale-Targets

| Achse | „Comfortable" | „Still works" |
|---|---|---|
| Cards pro Deck | 1.000 | 10.000 |
| Decks total pro Nutzer | 100 | — |
| Bild-Größe pro Card | 200 KB (Soft-Warning im Editor-Footer) | 5 MB Hard-Stop (ADR-0013) |

„Comfortable" = wir designen primär dafür. „Still works" = wir kippen nicht um, aber Performance-Verschlechterungen sind akzeptabel.

## Performance-Budgets

| Metrik | Budget |
|---|---|
| Initial Bundle (gzipped) | 250 KB |
| Time-to-Interactive auf mid-tier Mobile | < 3 s |
| Card-Flip-Latenz | < 100 ms (gefühlt instant) |
| Deck-Liste-Render bei 50 Decks | < 16 ms (1 Frame) |
| Lighthouse Performance / Best Practices / a11y | ≥ 90 |

## Enforcement

- **CI sichtbar machen, nicht blocken:**
  - Bundle-Size-Reporter (z.B. `compressed-size-action`, `size-limit` oder Äquivalent) postet die aktuelle Gzipped-Bundle-Größe als PR-Comment, mit Delta gegenüber dem Base-Branch.
  - Lighthouse-CI (oder Vergleichbares) läuft als non-blocking Check auf jedem PR.
- **Nicht** als Quality-Gate, das PRs blockt. Begründung: Hobby-OSS-Projekt; legitimer Bundle-Wachs (neue Library für ein neues Feature) soll keine zweite PR zum Limit-Heben erzwingen.
- Wenn ein Budget *konsistent* gerissen wird, wird der Wert in dieser ADR neu verhandelt (separate Diskussion, kein Drive-by-Bump).

## Considered Options

- **Keine konkreten Zahlen** („wir testen halt") — verworfen: Architektur-Entscheidungen (Base64-Bilder, alles in IndexedDB, kein Lazy-Loading) sind nur tragfähig in einem bestimmten Skalierungs-Korridor. Ohne Zahlen kein Grund zur Reaktion.
- **Hart enforcte CI-Gates** (Bundle > 250 KB → PR rot, Lighthouse < 90 → PR rot) — verworfen: erzeugt Noise auf legitimen Änderungen und zwingt zu Limit-Bump-PRs. Für ein One-Person-OSS-Projekt überdiszipliniert.
- **Dokumentierte Targets ohne CI** — verworfen: Werte driften unbemerkt; die Soft-CI ist billig und liefert das Awareness-Signal.
- **2048 px / höhere Bild-Limits** — vgl. ADR-0013, bereits dort verworfen.
- **Lazy-Loading von Decks bei Bootstrapping als v1-Anforderung** — verworfen: bei den deklarierten Scale-Targets (max ~10.000 Cards * 100 Decks = ~1 Mio Cards weltweit-aller-Nutzer; pro-Nutzer realistisch < 100k) reicht das Eager-Loading. Lazy ist eine spätere Optimierung.

## Consequences

- Der Card-Editor zeigt bei Bildern > 200 KB Base64 eine **Soft-Warning** im Editor-Footer (kein Block, nur Hinweis). Hart-Stop bei 5 MB pro Card-Total (ADR-0013).
- CI-Workflow (`.github/workflows/`) braucht zwei Jobs: Bundle-Size-Report und Lighthouse-CI. Beide non-blocking.
- Wenn das Initial-Bundle das Budget reißt, ist Code-Splitting/Lazy-Loading der erste Reflex (statt Budget-Bump). Der Card-Editor ist ein guter Split-Punkt — er ist nicht für die erste-Sicht nötig.
- Bei Listen-Render-Regression (Deck-Liste) ist Virtualisierung (z.B. `react-virtual`) das Werkzeug, nicht das Budget hochsetzen.
- Bei react-markdown-Latenz im Editor (genannt in #15) ist Debouncing des Live-Preview die erste Reaktion, nicht der Wechsel des Markdown-Renderers.
