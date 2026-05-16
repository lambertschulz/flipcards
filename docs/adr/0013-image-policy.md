# Bild-Policy: Kompression, Größenlimits, Speicher-Warnungen

Cards halten Bilder als Base64-Data-URLs direkt im Markdown (ADR-0005). Diese ADR pinnt die Policy, die beim Einbetten greift, sowie die Grenzen, die das Datenmodell schützen.

**Diese Entscheidungen sind ADR-würdig, weil sie nicht-rückholbar sind:** sobald Cards mit unkomprimierten Bildern in IndexedDB liegen, ist retroaktive Kompression nur durch User-Aktion möglich. Frühe Festlegung kostet wenig, späte Korrektur kostet viel.

## Kompression bei Einbettung

Sobald ein Bild in den Card-Editor gelangt (Paste, Drag-and-Drop, File-Picker), wird es vor Base64-Encoding **clientseitig komprimiert**:

- **Längste Kante:** auf maximal **1600 px** skaliert (Aspect Ratio bleibt). Kleiner bleibt kleiner — kein Upscaling.
- **Format:** **JPEG mit Quality 0.8** für photographischen Content. **PNG bleibt PNG** (Strichzeichnungen, Screenshots, Transparenz) — aber: wenn die JPEG-q0.8-Re-Encodierung *kleiner* ist als das Original-PNG, gewinnt JPEG. Heuristik: PNG > 200 KB → JPEG-Versuch; wenn dieser < 70 % des PNGs ist, wird JPEG genommen.
- **Animierte GIFs:** unverändert übernommen. Recompression würde die Animation zerstören; das Per-Card-Limit greift.
- **WebP/AVIF:** in v1 nicht generiert. Marginal kleiner als JPEG-q0.8 bei diesen Größen, Decodier-Kompatibilität ist über IndexedDB-Sharing-Wege wertvoller als die 5–15 % Größengewinn.

**Stille Operation.** Kein Bestätigungs-Dialog. Im Editor-Footer wird die Größen-Differenz angezeigt: „Bild komprimiert: 2.1 MB → 187 KB". Damit ist sichtbar, dass etwas passiert ist — ohne Workflow zu unterbrechen.

**Erwartete Bandbreite** (1600 px, JPEG-q0.8, Base64-overhead ~37 %):

| Content | Base64 in IndexedDB |
|---|---|
| Screenshot, UI, Strichzeichnung | ~70–200 KB |
| Durchschnittliches Foto | ~270–550 KB |
| Detailreiches Foto | ~550 KB – 1.1 MB |
| Worst-Case (volle Textur, Rauschen) | bis ~1.6 MB |

## Per-Card-Limit

**Hartes Limit pro Card: 5 MB Base64-Gesamtpayload** (Front + Back + alle eingebetteten Bilder).

Beim Speichern wird die Größe gemessen; bei Überschreitung wird die Speicher-Aktion blockiert mit einer klaren Fehlermeldung:

> Diese Card überschreitet das Limit von 5 MB. Reduziere die Anzahl/Größe der Bilder oder splitte den Inhalt auf mehrere Cards.

Begründung: 5 MB lassen ~10 typische komprimierte Bilder pro Card zu — für legitime Lerninhalte praktisch nie erreicht. Der Wert ist konsistent mit dem 5-MB-Cap für Curated-Deck-JSONs aus ADR-0010 und schützt vor pathologischen Pasten (z.B. 12 MP Foto unkomprimiert).

## Globale Speicher-Warnungen

IndexedDB hat browser-abhängige Quotas (typisch ~60 % des freien Disk-Speichers in Chromium). Statt proaktiv zu pruning oder hart abzubrechen, **macht die App den Status sichtbar**:

- **Bei ≥ 80 % von `navigator.storage.estimate().quota`** → gelbes Banner in der Deck-Liste: „Speicher fast voll — Backup erstellen und Bilder reduzieren empfohlen."
- **Bei ≥ 95 %** → rotes Banner: „Speicher kritisch — neue Cards können fehlschlagen. Jetzt Backup machen und aufräumen."

Keine automatische Lösch- oder Komprimier-Aktion. Die Verantwortung liegt beim Nutzer (konsistent mit ADR-0001).

## Considered Options

- **Kein hartes Per-Card-Limit** — verworfen: ein Nutzer, der 50 unkomprimierte Bilder in eine Card pastet, kippt sich selbst die IndexedDB. Das 5-MB-Limit ist eine billige Fail-Safe.
- **1024 px statt 1600 px Max-Kante** — verworfen: ~50 % kleiner, aber auf Retina-Tablets/Desktops sichtbar weicher. Lerninhalte mit Bildmaterial (Anatomie, Diagramme) verlieren Information. 1600 px ist der Punkt, an dem typische Foto-Inhalte „nicht mehr verlustig" wirken.
- **2048 px Max-Kante** — verworfen: kaum sichtbarer Quality-Vorteil gegenüber 1600 px, aber ~50 % größere Files. Nicht wert.
- **WebP/AVIF als Default-Format** — verworfen: Decode-Kompatibilität in älteren Browser-Versionen unkonsistent (besonders AVIF). Marginal kleiner. Nachrüstbar.
- **Bestätigungs-Dialog vor Kompression** („Bild wird verkleinert, fortfahren?") — verworfen: nervt bei jedem Paste. Footer-Anzeige macht das Verhalten sichtbar, ohne zu unterbrechen.
- **Proaktive Quota-Aufräum-UX** („Lösche die 5 größten Cards?") — verworfen für v1: zu viel UI für einen Edge-Case, der durch Backup-then-Cleanup ohnehin sauberer lösbar ist. Sichtbarkeit + User-Agency reicht.
- **Bilder als separate IndexedDB-Blobs** (statt Base64 im Markdown) — verworfen: ADR-0005 hat das bereits begründet (portable Single-JSON-Cards, einfache Export/Import).

## Consequences

- Der Card-Editor (Issue #5) muss eine Kompression-Pipeline aufrufen, bevor der Bild-Inhalt als Base64 in die Card geschrieben wird. Diese Pipeline lebt in `src/lib/` (browser-API, kein Domain-State) und ist von Tests aus mit `fake-image-data` ansprechbar.
- Die `Card.maxPayloadSize`-Validierung sollte in der Domain-Schicht (`src/domain/card/`) liegen, damit sie sowohl beim Editor-Save als auch beim **Shared Deck**-Import (Validierung importierter Cards) wiederverwendet wird.
- **Shared-Deck-Import** muss das 5-MB-Limit pro Card ebenfalls validieren — sonst wäre der Import ein Hintertürchen für überlange Cards. Der Limit-Check ist Teil des Zod-Schemas oder läuft direkt danach.
- Die `navigator.storage.estimate()`-API ist in allen modernen Browsern verfügbar, in Safari/Firefox aber mit gröberer Granularität als in Chrome. Banner-Schwellen sollten 5–10 % Toleranz mitnehmen.
- Compression-Library: clientseitig via `<canvas>` + `toBlob('image/jpeg', 0.8)` reicht — keine externe Dependency nötig. PNG-Pass-through ist nur „kein Re-Encode". Animierte GIFs werden direkt durchgereicht (kein `<canvas>`-Trip, der Animation zerstören würde).
