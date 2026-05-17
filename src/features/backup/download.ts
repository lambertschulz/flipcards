// Browser-only: write a Blob to the user's filesystem via a synthetic <a>.
// Pulled out as its own tiny module so the orchestration (`backup-export.ts`)
// stays JSDOM-friendly and the download trigger can be stubbed in tests.

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    // The anchor doesn't need to be in the DOM to dispatch a click, but
    // Safari has historically been picky about anchors that aren't connected.
    // Cheap insurance: add, click, remove in one tick.
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Always free the object URL — leaked URLs hold their Blob in memory.
    URL.revokeObjectURL(url);
  }
}
