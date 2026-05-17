// Orchestrator for "Backup jetzt erstellen". Collects DB → stringifies →
// downloads as `flipcards-backup-YYYY-MM-DD.json`. Single entry point that
// the UI buttons call.

import { stringifyBackup } from "@/domain/backup";

import { collectBackup } from "./collect";
import { triggerDownload } from "./download";
import { backupFilename } from "./filename";

export type ExportDeps = {
  /** Override the clock for tests. Defaults to `Date.now()`. */
  now?: () => Date;
  /** Override the file save sink for tests. Defaults to a real `<a>.click()`. */
  saveAs?: (blob: Blob, filename: string) => void;
};

export async function exportBackupToFile(deps: ExportDeps = {}): Promise<void> {
  const now = (deps.now ?? (() => new Date()))();
  const file = await collectBackup({ now: () => now });
  const json = stringifyBackup(file);
  const blob = new Blob([json], { type: "application/json" });
  const filename = backupFilename(now);
  (deps.saveAs ?? triggerDownload)(blob, filename);
}
