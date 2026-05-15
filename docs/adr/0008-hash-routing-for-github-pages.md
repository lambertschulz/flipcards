# Hash-Routing wegen GitHub-Pages-Hosting

URLs nutzen Hash-Routing (`/#/decks/abc123`) statt Browser-History (`/decks/abc123`). Konkret: TanStack Router mit `createHashHistory()` aus `@tanstack/history`.

Grund: GitHub Pages bietet keinen SPA-Fallback (alle unbekannten Pfade auf `index.html` umleiten). Ohne Hash-Routing liefert ein Reload auf `/decks/abc123` eine 404 von GitHub aus.

## Considered Options

- **Browser-History + 404.html-Trick** — verworfen: GitHub serviert `404.html` mit HTTP 404, ein JavaScript-Snippet darin schreibt den Pfad in den Hash und redirected zur Root. Funktioniert, aber: 404-Statuscode bricht Sharing-Karten in Messengern, Suchmaschinen sehen 404s, fragil bei Sub-Path-Hosting unter `/flipcards/`.
- **Cloudflare Pages / Netlify für sauberen SPA-Fallback** — verworfen, siehe Hosting-Entscheidung: alles bei GitHub belassen war wichtiger als schönere URLs.
- **Browser-History akzeptieren, dass Deep-Links nicht funktionieren** — verworfen: ein Nutzer, der ein Lesezeichen auf ein Deck setzt und am nächsten Tag draufklickt, sähe 404. Inakzeptabel.

## Consequences

- URLs sehen weniger schön aus (`#` ist sichtbar).
- Hash-Anker (`#some-section`) auf gerenderten Markdown-Cards funktionieren nicht ohne Trick — der Router-Hash beansprucht das `#`.
- Wechsel zu einem Hoster mit SPA-Fallback (Cloudflare Pages, Netlify, eigener Server) ist später trivial: ein Router-Config-Swap von `createHashHistory()` zu `createBrowserHistory()`.
- Permalinks sind stabil und bleiben funktional über Bookmarks, OG-Karten, geteilte Links.
