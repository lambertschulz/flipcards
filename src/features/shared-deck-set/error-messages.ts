// User-facing German error labels for Shared-Deck-Set `ImportError`. The
// shared-deck-set-import page renders these so it stays presentational.
//
// Mirrors `features/shared-deck/error-messages.ts` but adjusts the
// UnknownFormat / IncompatibleVersion phrasing to mention "Shared-Deck-Set"
// so users who pick a single-deck or backup file by mistake get a useful
// nudge. CardSizeError surfaces the FULL violation list (capped at 10 lines)
// since the ticket AC says the per-card 5-MB check must list each offender.

import type { ImportError } from "@/domain/shared-deck";

const MAX_VIOLATION_LINES = 10;

export function describeSharedDeckSetError(error: ImportError): string {
  switch (error.kind) {
    case "JsonSyntaxError":
      return `Die Datei ist kein gültiges JSON: ${error.message}`;
    case "UnknownFormat":
      if (error.actual === undefined) {
        return `Das Feld 'format' fehlt. Erwartet: '${error.expected}' — vermutlich keine Shared-Deck-Set-Datei.`;
      }
      return `Unbekanntes Format '${String(error.actual)}'. Erwartet: '${error.expected}'.`;
    case "IncompatibleVersion":
      if (error.actual === undefined) {
        return "Das Feld 'formatVersion' fehlt. Shared-Deck-Set-Dateien müssen ein 'formatVersion'-Feld auf oberster Ebene haben.";
      }
      if (error.direction === "newer") {
        return `Diese Shared-Deck-Set-Datei (Version ${String(error.actual)}) ist neuer als diese App-Version (unterstützt: ${error.expected}). Bitte App aktualisieren.`;
      }
      return `Shared-Deck-Set-Format-Version ${String(error.actual)} wird nicht (mehr) unterstützt. Erwartet: ${error.expected}.`;
    case "SchemaError": {
      const sample = error.issues
        .slice(0, 3)
        .map((i) => `• ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      const more = error.issues.length > 3 ? `\n(+${error.issues.length - 3} weitere)` : "";
      return `Die Datei verletzt das Shared-Deck-Set-Schema:\n${sample}${more}`;
    }
    case "CardSizeError": {
      const lines = error.violations.slice(0, MAX_VIOLATION_LINES).map((v) => {
        const mb = (v.actualBytes / (1024 * 1024)).toFixed(1);
        return `• Deck ${v.deckId} / Card ${v.cardId}: ${mb} MB`;
      });
      const more =
        error.violations.length > MAX_VIOLATION_LINES
          ? `\n(+${error.violations.length - MAX_VIOLATION_LINES} weitere)`
          : "";
      return `${error.violations.length} Card(s) überschreiten das 5-MB-Limit pro Card und werden abgelehnt:\n${lines.join("\n")}${more}`;
    }
  }
}
