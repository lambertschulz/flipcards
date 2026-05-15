# Local-first, kein Backend, kein Account-Zwang

Flipcards ist eine reine statische Web-App. **IndexedDB ist die einzige Quelle der Wahrheit**: alle **Decks**, **Deck-Sets** und **Review-States** leben pro Browser, pro Origin, pro Gerät. Es gibt keinen Server, keine Accounts, keine Auth.

Multi-Device-Transfer und Backup laufen ausschließlich über manuell heruntergeladene/hochgeladene JSON-Dateien (siehe **Backup**, **Shared Deck**, **Shared Deck-Set** in [CONTEXT.md](../../CONTEXT.md)).

## Considered Options

- **Optionaler Account mit Sync** — verworfen: erfordert Backend, Auth, Konfliktauflösung; widerspricht „unkomplizierte Website".
- **Bring-your-own-storage** (WebDAV / Dropbox / Google Drive via OAuth) — verworfen für v1: OAuth-Komplexität, drei Provider zu unterstützen; nachrüstbar wenn echtes Bedürfnis entsteht.
- **File System Access API** mit lokalem Sync-Ordner — verworfen: Chromium-only, schließt Firefox/Safari aus.

## Consequences

- Cache-Löschen oder Browserwechsel ohne vorheriges Backup = Datenverlust. Nutzer müssen verstehen, dass sie selbst für Backups verantwortlich sind.
- Kein automatischer Multi-Device-Sync. Lernen auf Handy + Laptop = manuelles Hin-und-Her-Kopieren der Backup-Datei.
- Hosting ist trivial: jede Static-Site-Plattform (GitHub Pages, Netlify, Cloudflare Pages) reicht.
