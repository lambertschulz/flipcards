# Import-Konflikt-Auflösung

Flipcards kennt drei distinkte Import-Pfade — **Shared Deck**, **Shared Deck-Set**, **Backup** — mit unterschiedlicher Konflikt-Semantik. Diese ADR pinnt die Regeln. ADR-0010 hat die Basis-Regel (additiv, lokal gewinnt, per Card-ID) bereits für Curated Decks eingeführt; diese ADR generalisiert sie auf alle Import-Pfade und ergänzt die Spezialfälle.

**Identifier-Annahme (aus ADR-0010).** Jedes **Deck**, jede **Card** und jedes **Deck-Set** trägt eine stabile `nanoid`, einmalig bei Erstellung vergeben und über alle Export-/Import-Flows hinweg erhalten. Match-Kriterium für Konflikte ist *immer* die ID, niemals der Name.

## Shared-Deck-Import

Beim Import eines einzelnen **Shared Decks**:

1. **Deck-ID match.** Existiert lokal bereits ein Deck mit derselben Deck-ID, läuft ein **additiver Merge per Card-ID** (ADR-0010):
   - Cards aus dem Import mit lokal unbekannter ID → werden hinzugefügt.
   - Cards mit übereinstimmender ID → werden übersprungen; lokaler Inhalt und **Review-State** bleiben unverändert.
   - Cards, die nur lokal existieren → bleiben unverändert.
   - Deck-Metadaten (Titel, Beschreibung) des lokalen Decks bleiben unverändert.

2. **Name-Kollision ohne ID-Match.** Existiert lokal kein Deck mit dieser ID, aber ein Deck mit demselben Titel, wird der Import-Deck-Titel **automatisch suffigiert**: „Französisch" → „Französisch (2)" → „Französisch (3)", je nachdem, wie viele Kollisionen bereits existieren. Kein Prompt, kein Block.

3. **Sonst:** Der Import-Deck wird unverändert übernommen.

Kein per-Card-Prompt, kein per-Deck-Prompt. Der Import-Flow läuft ohne modale Unterbrechung durch.

## Shared-Deck-Set-Import

Ein **Shared Deck-Set** bündelt mehrere Decks plus ein Set-Wrapper.

**Enthaltene Decks** werden je einzeln über die Shared-Deck-Regel oben verarbeitet (Merge bei ID-Match, Suffix bei Name-Kollision, sonst Neu-Import). Bulk, keine Per-Deck-Entscheidungen.

**Set-Wrapper:**

- Existiert lokal bereits ein Set mit derselben Set-ID, werden die Member-Deck-IDs additiv vereinigt (Local-Set bleibt erhalten, Import-Member kommen dazu).
- Existiert kein Set mit dieser ID, aber eines mit demselben Namen, wird der Set-Titel suffigiert.
- Sonst wird das Set unverändert übernommen.

**Set-Mitgliedschaft beim Deck-Konflikt.** CONTEXT.md hält fest: ein Deck gehört zu *höchstens einem* Deck-Set. Konflikte sind möglich, wenn ein importiertes Set behauptet, ein lokal existierendes Deck zu enthalten. Auflösungsregel (Hybrid „lokal-gewinnt bei vorhandener Struktur, adoptiere lose"):

- **Deck war lokal lose** (in keinem Set) → wird in das importierte Set adoptiert.
- **Deck war lokal bereits in einem Set** → bleibt in seinem bestehenden Set. Das importierte Set wird ohne dieses Deck in der Mitgliederliste angelegt.
- **Deck wurde durch den Import neu angelegt** → wird gemäß Import-Behauptung in das Set aufgenommen.

Damit ist das uniforme „additiv, lokal gewinnt bei bestehender Struktur"-Modell von Card → Deck → Deck-Set durchgehalten.

## Backup-Restore

Ein **Backup** ist ein vollständiger Snapshot (alle Decks, Deck-Sets, Review-States) — semantisch ein Ziel-Zustand, nicht ein Delta. Der Restore-Pfad ist deshalb anders strukturiert als die Shared-Deck-Pfade:

- **Verhalten: Clean-Slate-Replace.** Die komplette lokale IndexedDB (Decks, Deck-Sets, Review-States) wird durch den Backup-Inhalt ersetzt. Keine Mischung mit lokalem Bestand. Keine Latest-Wins-Heuristik.
- **Pflicht-Bestätigung.** Vor dem Replace erscheint ein expliziter, destruktiver Dialog: „Alle aktuellen Decks, Cards und Lernfortschritte werden durch den Backup-Inhalt ersetzt. Fortfahren?". Ein-Button-Bestätigung. Kein „nur teilweise wiederherstellen".
- **Multi-Device-Sync ist explizit kein Ziel.** Wer Lernfortschritt zwischen zwei aktiven Geräten zusammenführen will, ist außerhalb des Modells aus ADR-0001 (kein Backend, kein Sync). Solche Nutzer müssen entweder ein Gerät als Primär bestimmen oder Decks ohne Review-State als Shared Decks zwischen Geräten hin-und-her-tauschen.

## Cross-Reference

Die Lösch-Semantik (Issue #8, Hard-Delete vs. Trash vs. Cascading) interagiert mit dieser ADR an einer Stelle: wenn ein Import eine Deck-ID enthält, die lokal vorher mal existiert hat, dann aber gelöscht wurde — verhält sich der Import wie ein Neu-Import oder wie eine Wiederbelebung? Diese Frage wird in Issue #8 entschieden. Diese ADR setzt voraus, dass bei Hard-Delete kein lokaler Record mit der ID mehr existiert (Import-Pfad sieht „nichts" → Neu-Import). Bei Soft-Delete-mit-Trash muss Issue #8 die Wiederbelebungs-Regel definieren.

## Considered Options

- **Match per Deck-Name statt Deck-ID** — verworfen: Name-Kollisionen zwischen unabhängigen Decks (zwei Freunde, beide haben ein „Französisch") wären als Merges fehlinterpretiert. ID-Match ist eindeutig; Name-Kollisionen handhabt die Suffix-Regel.
- **Per-Card-Prompts beim Inhalts-Konflikt** („dieser Inhalt wurde geändert, übernehmen?") — verworfen: würde den Import-Flow in einen Dialog-Tunnel verwandeln. „Lokal gewinnt, additiv" (ADR-0010, Q3a) wurde bewusst gewählt und ist konsistent durchgehalten. Eine zukünftige Per-Conflict-UX kann auf den Provenance-Feldern aus ADR-0010 aufbauen, ist aber v1-out-of-scope.
- **Backup-Restore als Merge mit Latest-Wins per Review-State** — verworfen: erfordert pro-Card-Timestamp-Vergleich, semantisch unklare „beide Geräte haben weitergelernt"-Fälle, und widerspricht ADR-0001 (kein Sync-Modell). Snapshot-Replace ist ehrlich und einfach.
- **Backup-Restore mit Per-Deck-Auswahl** („welche Decks willst du wiederherstellen?") — verworfen: Backup ist als Voll-Snapshot definiert (CONTEXT.md); partielle Restores würden den Begriff verwässern. Wer einzelne Decks zwischen Geräten transferieren will, nutzt Shared Decks.
- **Block-on-Name-Collision** mit Rename-Dialog beim Shared-Deck-Import — verworfen: dritter modaler Dialog im Import-Pfad (zusätzlich zu Backup-Restore-Bestätigung und der zukünftigen Per-Conflict-UX). Suffix ist reversibel via Umbenennen, kein User-Eingriff nötig.
- **Set-Mitgliedschaft: Import gewinnt** (re-parenting bestehender Decks ins neue Set) — verworfen: destruktive Änderung lokaler Struktur ohne Nutzer-Konsent. Verstößt gegen die seit ADR-0010 gehaltene Linie „additiv, lokal gewinnt".
- **Set-Mitgliedschaft: nur ID-Match adoptiert** (lose lokale Decks bleiben lose) — verworfen: produziert leere oder fast-leere importierte Sets, wenn der Nutzer „die meisten" Decks schon lokal hat. Der Hybrid (lose adoptieren, parented in Ruhe lassen) trifft die offensichtliche Nutzer-Intention besser.

## Consequences

- **Eine einzige modale Bestätigung im gesamten Import-Surface:** Backup-Restore. Alles andere läuft ohne Prompt durch (Shared-Deck-Import, Deck-Set-Import).
- **Sets können nach Import unvollständige Mitgliederlisten haben**, wenn enthaltene Decks lokal bereits in einem anderen Set existieren. Die UI sollte das tolerieren — ein Set mit drei der ursprünglich fünf Decks ist gültiger Zustand.
- **Name-Suffixe sammeln sich**, wenn der Nutzer wiederholt verschiedene „Französisch"-Decks importiert. Akzeptabel; der Nutzer kann jederzeit manuell umbenennen.
- **Backup-Restore ist destruktiv** und braucht eine Pflicht-Bestätigung. Die Implementierung muss vor dem Wipe einen IndexedDB-Snapshot anlegen (in-memory oder als temporäre Tabelle), falls die Restore-Operation mid-flight scheitert — sonst riskiert ein Crash während des Replace, dass weder der alte noch der neue Zustand vollständig vorhanden ist.
- **Issue #8 (Lösch-Semantik)** muss die Wiederbelebungs-Regel für gelöschte Deck-IDs definieren; diese ADR setzt nur den Hard-Delete-Default voraus (Import sieht keinen lokalen Record → Neu-Import).
- Die konkrete **Import-UI** (Date-Picker, Drag-and-Drop, Validierungs-Feedback, Bestätigungs-Modal-Wording) lebt in einem späteren Implementierungs-Ticket, nicht in dieser ADR.
