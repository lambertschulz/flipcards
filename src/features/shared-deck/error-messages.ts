// User-facing German error labels for Shared-Deck `ImportError`. The
// shared-deck-import page renders these so it stays presentational.
//
// The Shared-Deck variant differs from the backup variant in two places:
//   • UnknownFormat / IncompatibleVersion phrasing names the expected
//     'flipcards.shared-deck' format so users who pick a backup file by
//     mistake get a helpful nudge.
//   • CardSizeError surfaces the full violation list — the ticket AC asks
//     for an error report that lists each offending card, not just the
//     first one (backup is `clean-slate-replace`, so one example was
//     enough there; Shared Deck has per-card semantics).

import type { ImportError } from "@/domain/shared-deck";

const MAX_VIOLATION_LINES = 10;

export function describeSharedDeckError(error: ImportError): string {
  switch (error.kind) {
    case "JsonSyntaxError":
      return `Die Datei ist kein gültiges JSON: ${error.message}`;
    case "UnknownFormat":
      if (error.actual === undefined) {
        return `Das Feld 'format' fehlt. Erwartet: '${error.expected}' — vermutlich keine Shared-Deck-Datei.`;
      }
      return `Unbekanntes Format '${String(error.actual)}'. Erwartet: '${error.expected}'.`;
    case "IncompatibleVersion":
      if (error.actual === undefined) {
        return "Das Feld 'formatVersion' fehlt. Shared-Deck-Dateien müssen ein 'formatVersion'-Feld auf oberster Ebene haben.";
      }
      if (error.direction === "newer") {
        return `Diese Shared-Deck-Datei (Version ${String(error.actual)}) ist neuer als diese App-Version (unterstützt: ${error.expected}). Bitte App aktualisieren.`;
      }
      return `Shared-Deck-Format-Version ${String(error.actual)} wird nicht (mehr) unterstützt. Erwartet: ${error.expected}.`;
    case "SchemaError": {
      const sample = error.issues
        .slice(0, 3)
        .map((i) => `• ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      const more = error.issues.length > 3 ? `\n(+${error.issues.length - 3} weitere)` : "";
      return `Die Datei verletzt das Shared-Deck-Schema:\n${sample}${more}`;
    }
    case "CardSizeError": {
      const lines = error.violations.slice(0, MAX_VIOLATION_LINES).map((v) => {
        const mb = (v.actualBytes / (1024 * 1024)).toFixed(1);
        return `• Card ${v.cardId}: ${mb} MB`;
      });
      const more =
        error.violations.length > MAX_VIOLATION_LINES
          ? `\n(+${error.violations.length - MAX_VIOLATION_LINES} weitere)`
          : "";
      return `${error.violations.length} Card(s) überschreiten das 5-MB-Limit pro Card und werden abgelehnt:\n${lines.join("\n")}${more}`;
    }
  }
}
