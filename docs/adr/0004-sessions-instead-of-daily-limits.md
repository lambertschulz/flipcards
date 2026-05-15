# Review-Sessions statt Anki-Tageslimits

Pacing läuft über **Review Sessions**, nicht über erzwungene Tageslimits. Eine Session hat zwei Modi:

- **Open-ended**: läuft bis Nutzer „Genug für heute" drückt oder keine **Due Cards** mehr da sind.
- **Bounded**: Nutzer wählt vorab eine Card-Anzahl (z.B. „20 Karten"), Session endet bei Erreichen.

Es gibt **keinen separaten „neue Karte"-Begriff** und **keine konfigurierbaren Tageslimits** wie in Anki. Frisch importierte Cards sind sofort **Due** und laufen durch den normalen Session-Flow.

## Considered Options

- **Anki-Style Tageslimits** („max 20 neue + 100 Reviews/Tag", Reset zur lokalen Mitternacht, separater „neue Karten"-Queue) — verworfen: konzeptuell Anki's schwierigster Teil, viele Nutzer verstehen es nie. Widerspricht „unkomplizierte Website".
- **Nur Open-ended Sessions** — verworfen: Nutzer wollen sich oft auf eine fixe Anzahl committen („ich mach jetzt 20"), das ist mit Bounded sauber abgedeckt.

## Consequences

- Beim Import großer **Shared Decks** (z.B. 500 Cards) sind alle 500 sofort due. Verantwortung für „nicht erschlagen werden" liegt beim Nutzer (= Bounded-Session mit kleiner Zahl wählen).
- Tageslimits später nachrüstbar als optionale Komfortfunktion, ohne das Datenmodell zu ändern.
