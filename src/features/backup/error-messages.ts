// User-facing German error labels for `BackupError`. The ticket asks for
// 'klare Fehlermeldung: was war ungültig, Hinweis auf formatVersion-Feld
// bei Fehlen.' We render that here so the import page stays presentational.

import type { BackupError } from "@/domain/backup";

export function describeBackupError(error: BackupError): string {
  switch (error.kind) {
    case "JsonSyntaxError":
      return `Die Datei ist kein gültiges JSON: ${error.message}`;
    case "UnknownFormat":
      if (error.actual === undefined) {
        return `Das Feld 'format' fehlt. Erwartet: '${error.expected}' — vermutlich keine Flipcards-Backup-Datei.`;
      }
      return `Unbekanntes Format '${String(error.actual)}'. Erwartet: '${error.expected}'.`;
    case "IncompatibleVersion":
      if (error.actual === undefined) {
        // Ticket AC: explicit hint about the missing `formatVersion` field.
        return "Das Feld 'formatVersion' fehlt. Backups müssen ein 'formatVersion'-Feld auf oberster Ebene haben.";
      }
      if (error.direction === "newer") {
        return `Diese Backup-Datei (Version ${String(error.actual)}) ist neuer als diese App-Version (unterstützt: ${error.expected}). Bitte App aktualisieren.`;
      }
      return `Backup-Format-Version ${String(error.actual)} wird nicht (mehr) unterstützt. Erwartet: ${error.expected}.`;
    case "SchemaError": {
      // Surface the first 3 issues — more would overwhelm the toast. The
      // path is informative enough to point at the field; the full issue
      // list is still on the error object for diagnostics.
      const sample = error.issues
        .slice(0, 3)
        .map((i) => `• ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      const more = error.issues.length > 3 ? `\n(+${error.issues.length - 3} weitere)` : "";
      return `Die Datei verletzt das Backup-Schema:\n${sample}${more}`;
    }
    case "CardSizeError": {
      const first = error.violations[0];
      const mb = (first.actualBytes / (1024 * 1024)).toFixed(1);
      const rest =
        error.violations.length > 1 ? ` (+${error.violations.length - 1} weitere Cards)` : "";
      return `Eine Card überschreitet das 5-MB-Limit (Card ${first.cardId}, ${mb} MB)${rest}.`;
    }
  }
}
