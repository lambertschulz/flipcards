# SRS-Algorithmus: SM-2

Wir verwenden **SM-2** (SuperMemo 2, der Algorithmus, den Anki bis 2023 standardmäßig nutzte) für die Spaced-Repetition-Planung. Pro **Card** im **Review-State**: `repetitions`, `easeFactor`, `intervalDays`, `nextDue`. Antwort-Eingabe in 4 Stufen (Again / Hard / Good / Easy), gemappt auf SM-2-Quality-Werte.

## Considered Options

- **FSRS** (modernes Anki, ML-basiert, 17 Parameter) — verworfen: braucht hunderte Reviews pro Nutzer zum Trainieren der Vergessenskurve. Da jeder Nutzer eigene **Decks** hat (oft mit kleiner Card-Zahl), ist das nicht feasibel.
- **Leitner-Box-System** (5 Boxen, binär richtig/falsch) — verworfen: zu grobes Feedback-Granulat, kein „schwierig aber gewusst" — verschenkt Information bei jedem Review.
- **Kein SRS** — verworfen: ohne Spaced Repetition ist die App nur ein digitales Karteikästchen ohne Anki-Mehrwert.

## Consequences

- Datenmodell ist auf SM-2-Felder zugeschnitten. Wechsel zu FSRS später möglich, aber bedeutet Schema-Migration und Verlust von Vergleichbarkeit historischer Reviews.
- 4-Stufen-Antwort-UI ist Pflichtkonzept im UX (nicht nur „weiß/weiß nicht").
