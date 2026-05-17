// Pure filename helper. Lives in its own module so the date-formatting logic
// is unit-testable without touching the DOM (Blob / URL.createObjectURL).
// Ticket asks for `flipcards-backup-YYYY-MM-DD.json`.

export function backupFilename(date: Date): string {
  const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = date.getUTCDate().toString().padStart(2, "0");
  return `flipcards-backup-${yyyy}-${mm}-${dd}.json`;
}
