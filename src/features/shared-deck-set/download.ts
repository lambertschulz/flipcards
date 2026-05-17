// Browser-only: write a Blob to the user's filesystem via a synthetic <a>.
// Same logic as `features/backup/download.ts` and
// `features/shared-deck/download.ts` — kept separate so each feature owns
// its tiny I/O sink and tests can stub one without the other.

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
