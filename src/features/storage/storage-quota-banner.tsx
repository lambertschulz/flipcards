import { type StorageQuota, classifyQuota } from "@/features/storage/quota";
import { useEffect, useState } from "react";

/**
 * Banner showing IndexedDB quota usage when ≥ 80 % (warning) or ≥ 95 % (critical).
 * Source: `navigator.storage.estimate()` (ADR-0013). Silently renders nothing if
 * the browser doesn't expose the Storage API or if quota is below threshold.
 *
 * Refresh strategy: polls every 30 s while mounted. A more elegant signal would
 * be hooking into Dexie writes, but quota changes are slow enough that polling
 * keeps the implementation small.
 */
export function StorageQuotaBanner() {
  const quota = useStorageQuota();
  if (!quota || quota.level === "ok") return null;

  const pct = Math.round(quota.ratio * 100);

  if (quota.level === "warning") {
    return (
      <output className="block rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
        Speicher fast voll ({pct} %) — Backup erstellen und Bilder reduzieren empfohlen.
      </output>
    );
  }

  return (
    <div
      role="alert"
      className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100"
    >
      Speicher kritisch ({pct} %) — neue Cards können fehlschlagen. Jetzt Backup machen und
      aufräumen.
    </div>
  );
}

function useStorageQuota(): StorageQuota | null {
  const [quota, setQuota] = useState<StorageQuota | null>(null);

  useEffect(() => {
    const supported =
      typeof navigator !== "undefined" &&
      navigator.storage &&
      typeof navigator.storage.estimate === "function";
    if (!supported) return;

    let cancelled = false;
    const refresh = async () => {
      const est = await navigator.storage.estimate();
      if (cancelled) return;
      setQuota(classifyQuota(est.usage ?? 0, est.quota ?? 0));
    };
    void refresh();
    const interval = setInterval(refresh, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return quota;
}
