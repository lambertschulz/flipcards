# Flipcards

Eine browserbasierte Spaced-Repetition-Lernanwendung. Open Source, ohne Account-Zwang, alle Daten lokal in IndexedDB. Inspiriert von Anki, aber als reine Web-App.

## Language

**Card**:
Eine einzelne Karteikarte mit genau zwei Feldern: **Front** und **Back**, beide Markdown mit eingebetteten Bildern (Base64). Keine Note/Card-Trennung wie in Anki — eine Card ist ein eigenständiges Inhaltsobjekt.
_Avoid_: Flashcard, Karteikarte (Code-intern), Item, Note

**Deck**:
Eine thematische Sammlung von **Cards** (z.B. „Französisch-Vokabeln"). Die Einheit, die ein Nutzer typischerweise lernt und teilt.
_Avoid_: Stapel, Set, Sammlung

**Deck-Set**:
Eine optionale Gruppierung von **Decks**, die zusammen ein größeres Lernfeld abdecken (z.B. „Medizin 1. Semester"). Genau zwei Hierarchie-Ebenen — keine Verschachtelung von Sets in Sets.
_Avoid_: Pack, Bundle, Course, Library, Subdeck

**Review-State**:
Pro **Card** und pro Nutzer gespeicherte SRS-Daten (Intervall, Ease-Factor, nächste Fälligkeit). Lebt ausschließlich lokal in IndexedDB. Wird nie geteilt.
_Avoid_: Progress, History, Stats

**Tag**:
Eine frei vergebene String-Markierung an einer **Card**. Flach (keine Hierarchie), beliebig viele pro Card. Reist als Inhalts-Metadatum mit beim Export als **Shared Deck** / **Shared Deck-Set**.
_Avoid_: Label, Category, Marker

**Due Card**:
Eine **Card**, deren nächste Fälligkeit (aus dem **Review-State**) heute oder in der Vergangenheit liegt. Frisch importierte Cards sind sofort due.
_Avoid_: Pending card, ready card, scheduled card

**Review Session**:
Eine zusammenhängende Lerneinheit, in der der Nutzer durch eine Menge **Due Cards** geht. Der Nutzer kann die Session vorab begrenzen („X Cards") oder unbegrenzt starten und jederzeit per „Genug für heute" beenden. Es gibt keine erzwungenen Tageslimits.

Quellen für die Card-Menge:
- **Deck-Session**: Due Cards eines **Decks**
- **Tag-Session**: Due Cards mit einem bestimmten **Tag**, deck-übergreifend

Dauer-Modi:
- **Open-ended**: läuft bis Nutzer abbricht oder keine Due Cards mehr da sind
- **Bounded**: Nutzer wählt vorab eine Card-Anzahl, Session endet bei Erreichen oder wenn keine Due Cards mehr da sind
_Avoid_: Study session, learning round

**Backup**:
Vollständiger Snapshot aller **Decks**, **Deck-Sets** und **Review-States** als JSON-Datei. Dient dem Nutzer für Wiederherstellung und Multi-Device-Transfer. *Nicht* zum Teilen mit anderen.
_Avoid_: Export (zu generisch — siehe Disambiguierung unten)

**Shared Deck**:
Ein **Deck** als JSON-Datei exportiert, ohne **Review-State**. Dient dem Teilen mit anderen Nutzern.
_Avoid_: Public deck, deck export

**Shared Deck-Set**:
Ein **Deck-Set** plus alle enthaltenen **Decks** als JSON-Datei exportiert, ohne **Review-States**. Bundle-Variante zum Teilen größerer Lernfelder (z.B. „Medizin 1. Semester").
_Avoid_: Pack export, course export

**Curated Deck**:
Ein **Shared Deck** (oder **Shared Deck-Set**), dessen JSON im App-Bundle mitgeliefert wird, kuratiert vom Maintainer. Beim Importieren wird daraus ein normales **Deck** — danach gibt es technisch keinen Unterschied mehr.
_Avoid_: Built-in deck, default deck, sample deck

## Relationships

- A **Deck** contains zero or more **Cards**
- A **Card** belongs to exactly one **Deck**
- A **Card** has exactly one **Review-State** per local user (lebt in IndexedDB, nicht in der Card)
- A **Deck** belongs to *at most* one **Deck-Set** — Mehrfach-Zugehörigkeit ist nicht erlaubt
- A **Deck** kann „lose" existieren (ohne **Deck-Set**)
- **Deck-Sets** sind nicht verschachtelbar (genau 2 Ebenen)
- A **Backup** enthält alle **Decks**, **Deck-Sets** und **Review-States** des lokalen Nutzers
- A **Card** has zero or more **Tags** (free strings, flat, no hierarchy)
- A **Shared Deck** enthält genau ein **Deck** (inkl. **Tags** der Cards) ohne **Review-State**
- A **Shared Deck-Set** enthält ein **Deck-Set** + alle enthaltenen **Decks** (inkl. **Tags**), ohne **Review-States**

## Example dialogue

> **Dev:** Wenn jemand ein **Shared Deck-Set** importiert, sind dann alle **Cards** sofort **Due**?
> **Maintainer:** Ja — frisch importierte Cards sind per Definition fällig (kein Review-State → erstes Sehen). Bei 500 Cards drückt der Nutzer halt irgendwann „Genug für heute" und macht morgen weiter. Wir setzen kein Tageslimit.
>
> **Dev:** Was ist mit den **Tags**, die im Shared Deck-Set drin sind — landen die im Review-State?
> **Maintainer:** Nein — Tags sind reine Inhalts-Metadaten der Card, sie reisen mit dem Shared Deck mit. Der Review-State (Intervall, Ease, nächste Fälligkeit) entsteht *erst* beim ersten Beantworten und bleibt strikt lokal.
>
> **Dev:** Wenn ich eine **Tag-Session** mit `prüfung` starte, ziehe ich dann auch Cards aus **Curated Decks**?
> **Maintainer:** Sobald ein Curated Deck importiert wurde, ist es ein normales Deck. Ja, alle Due Cards mit `prüfung` aus *allen* Decks fließen in die Tag-Session — egal ob ursprünglich Curated, Shared, oder selbst gebaut.

## Flagged ambiguities

- „Export" wurde überladen verwendet: meint mal **Backup** (alles, privat), mal **Shared Deck** (ein Deck, teilbar). Diese sind explizit unterschiedliche Operationen mit unterschiedlichen Dateiformaten.
- „Datenset" (Nutzer-Term) wurde aufgelöst zu **Deck** bzw. **Deck-Set** je nach Kontext.
