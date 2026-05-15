# Strikt 2-Ebenen-Hierarchie für Decks

Die Organisation ist **Card → Deck → optionales Deck-Set**, nicht mehr. Eine **Card** gehört zu *genau einem* **Deck**. Ein **Deck** gehört zu *höchstens einem* **Deck-Set**. **Deck-Sets können nicht verschachtelt** werden. **Decks dürfen lose** existieren (ohne Set).

Cross-cutting Organisation passiert über **Tags** (siehe [CONTEXT.md](../../CONTEXT.md)), nicht über Hierarchie.

## Considered Options

- **Anki-Style arbiträres Nesting** (`Languages::German::Vocab::Beginner`) — verworfen: in Anki-UX die Hauptquelle für Verwirrung, viele Nutzer verstehen nie, wie Sub-Deck-Reviews vererbt werden. YAGNI für v1.
- **Mehrfach-Zugehörigkeit** (ein Deck in mehreren Sets) — verworfen: führt zu Identitätsfragen („wessen Anatomie ist das?") und doppelten Listen-Anzeigen. Tags lösen den Anwendungsfall „Deck in mehreren Listen sehen" sauberer.
- **Nur Decks, kein Set-Konzept** — verworfen: für „Mein Studium" mit 12 Themen-Decks fehlt sonst die Bündelungseinheit, sowohl in der Liste als auch beim Teilen (siehe **Shared Deck-Set**).

## Consequences

- Eine Card lässt sich nicht zwischen Decks „verschieben" ohne Identitätswechsel — sie wird neu zugeordnet, **Review-State** kann mitwandern (per Card-ID), aber Card gehört nun zum neuen Deck.
- Datenmodell hat zwei Entitäten (Deck, Deck-Set) statt einer rekursiven Tree-Struktur — Validierung und UI deutlich simpler.
