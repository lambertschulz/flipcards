# Card-Datenmodell v1: Markdown + eingebettete Bilder

Eine **Card** in v1 hat **genau zwei Felder**: `front` und `back`, beide **Markdown**. Bilder werden als **Base64-eingebettete Data-URLs** im Markdown gehalten — keine separate Blob-Verwaltung, keine externen Referenzen. Damit sind Cards selbstcontained und Export/Import funktioniert ohne Asset-Bundling.

**Explizit nicht in v1** (nicht abgelehnt — bewusst aufgeschoben):

- **Cloze-Deletion** (`{{c1::Paris}} ist die Hauptstadt`) — Anki-Power-Feature, das Datenmodell deutlich verkompliziert (eine Quelle generiert mehrere Cards).
- **Note/Card-Trennung** (Anki-Modell, wo eine Note automatisch Vorder↔Rück generiert) — Quelle für Anki's Komplexität.
- **LaTeX/KaTeX**, **Audio**, **Video**, **Code-Highlighting** mit speziellem Renderer.

Datenmodell soll diese Erweiterungen *zukünftig ohne Migration* aufnehmen können (offen erweiterbare Card-Struktur, z.B. ein optionales `extensions`-Feld oder versionierte Card-Schemas).

## Considered Options

- **Plain Text** — verworfen: anämisch, selbst Vokabeln wollen Akzente, Listen, Beispielsätze.
- **Volles Anki-Modell mit Note Types + Cloze sofort** — verworfen für v1: Wochen Aufwand, schwere UX, Power-User-Feature. Erst wenn ein konkreter Bedarf besteht.
- **Bilder als separate Blobs in IndexedDB statt Base64** — verworfen für v1: zwingt zu Asset-Management bei Export/Import. Base64 macht Cards portable; Performance-Hit ist akzeptabel solange Decks im Hunderter-Bereich bleiben.

## Consequences

- Cards sind portable Single-JSON-Objekte ohne Asset-Sidecar.
- Bei sehr großen Decks mit vielen großen Bildern wird IndexedDB-Speicher schnell aufgebläht. Falls das real wird, ist der Wechsel auf separate Blobs eine spätere Optimierung.
- Wenn Cloze/Note-Types nachgerüstet werden, muss das Card-Schema dafür Platz vorgesehen haben — diese Verantwortung liegt beim Datenmodell-Design (offene Erweiterbarkeit).
