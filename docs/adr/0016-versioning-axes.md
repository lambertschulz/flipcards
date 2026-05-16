# Versionierung: App-SemVer, Dexie-Schema, File-Format-Versionen

Vier Versions-Achsen, jede mit klarer Zuständigkeit:

1. **App-Release-Version: SemVer** (`0.x` pre-stable, `1.0.0` first stable). **GitHub Releases sind Source of Truth.** Im PWA-Manifest und im Footer wird der gleiche Wert geführt.
2. **IndexedDB-Schema-Version: Dexie's monoton-steigender Integer** (`db.version(N).stores(...)`). Migrations leben als Dexie-Upgrade-Hooks im DB-Setup. Jede Migration ist mit einer Fixture unit-getestet.
3. **Card-Schema-Version: implizit über die DB-Schema-Version.** Es gibt **kein** `schemaVersion`-Feld auf der Card-Entität in v1. Migrationen von Card-Struktur (z.B. spätere Cloze-Felder, vgl. ADR-0005) laufen in der Dexie-Upgrade-Hook.
4. **File-Format-Versionen: `formatVersion`-Feld pro File-Typ, unabhängig versioniert.** **Backup** und **Shared Deck** / **Shared Deck-Set** haben **eigene** `formatVersion`-Zähler. Beide starten bei `1`. Beim Import branched der Parser auf `formatVersion` und ruft ggf. eine versionierte Migration auf, bevor er Zod-validiert.

## Considered Options

- **CalVer (z.B. `2026.05`)** für App-Version — verworfen: SemVer kommuniziert Breaking-Changes klarer und ist die Default-Erwartung im JS-Ökosystem (npm-Tooling, Dependabot etc.).
- **Plain Sequential (`v1`, `v2`)** — verworfen: keine Information über Breakage.
- **Explizites `Card.schemaVersion`-Feld** auf jeder Card-Entität — verworfen: dupliziert die DB-Schema-Information, bläht jeden Card-Datensatz auf und macht Migrationen *doppelt* (DB-Upgrade-Hook + Per-Card-Schema-Check). ADR-0006 etabliert Dexie als Migrations-Mechanismus; Per-Card-Version würde diese Verantwortung verwässern.
- **Geteiltes `formatVersion` für Backup und Shared Deck** (eine Achse für beide) — verworfen: die beiden File-Formate evolvieren unterschiedlich. Backup wächst mit jeder Schema-Erweiterung (Review-States, Deck-Sets, Settings o.ä.); Shared Deck bleibt minimal (CONTEXT.md: ohne Review-State). Gekoppelte Versionen würden Backup-only Änderungen zu Fake-Bumps für Shared Deck führen — Importer von Shared Deck v3 müsste prüfen, ob „v3" für ihn etwas geändert hat.
- **Kein File-Format-Version-Feld** (Format-Drift per Heuristik erkennen) — verworfen: garantiert spätere Heuristik-Hölle und unklare Fehlermeldungen für den Nutzer.

## Consequences

- **Bei jeder Card-Schema-Änderung** muss die Dexie-DB-Version erhöht und ein Upgrade-Hook geschrieben werden, der die existierenden Cards in-place migriert. Tests müssen die Upgrade-Bahn explizit abdecken.
- **Backup-Import** parst zunächst nur das `formatVersion`-Feld, läuft dann durch eine `migrateBackup(file, fromVersion)`-Pipeline, und validiert das Ergebnis gegen das aktuelle Zod-Schema. Gleiche Pipeline-Form für Shared-Deck-Import.
- **Backup-Export** schreibt immer das aktuelle Format mit dem aktuellen `formatVersion`. Es gibt kein „Export-Version-Auswahl"-UX.
- **Unabhängige Versionen** für Backup vs. Shared Deck heißen: beide haben ihre eigenen Zod-Schemas in `src/domain/backup/` bzw. `src/domain/shared-deck/`, ihre eigenen Migrations-Funktionen, und ihre eigenen Tests. Code-Wiederverwendung passiert, wo Strukturen tatsächlich identisch sind (z.B. Card-Schema), nicht durch erzwungene Schema-Vereinigung.
- **Pre-`1.0.0`** sind Breaking-Changes (App und Files) erlaubt ohne Major-Bump; das ist SemVer-Konvention für `0.x`. Trotzdem soll die `formatVersion`-Disziplin von Tag 1 an gelten — sonst zerlegen wir Bestands-Backups früher Adopter.
