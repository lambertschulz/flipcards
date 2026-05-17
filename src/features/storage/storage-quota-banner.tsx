import { type StorageQuota, classifyQuota } from "@/features/storage/quota";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

/**
 * Banner showing IndexedDB quota usage when ≥ 80 % (warning) or ≥ 95 % (critical).
 * Source: `navigator.storage.estimate()` (ADR-0013). Silently renders nothing if
 * the browser doesn't expose the Storage API or if quota is below threshold.
 *
 * Dismissible per session: state lives in component memory (no localStorage),
 * so it returns after a reload or fresh mount until the quota actually
 * recovers. Issue #27 brief: "dismissible per Session (nicht persistent)".
 *
 * The "In Einstellungen öffnen" link deep-links into the Speicher-Section of
 * the Settings page (`/settings#storage`, see `settings-page.tsx`).
 *
 * Refresh strategy: estimate runs **once on mount only**. Issue #27 explicitly
 * lists "Realtime-Update des Banners während der Nutzung (nur beim Mount neu
 * prüfen)" as out of scope. Users see a fresh estimate on every navigation
 * back to the home screen — that's enough granularity for a slow-moving
 * quota signal.
 */
export function StorageQuotaBanner() {
  const quota = useStorageQuota();
  const [dismissed, setDismissed] = useState(false);

  if (!quota || quota.level === "ok") return null;
  if (dismissed) return null;

  const pct = Math.round(quota.ratio * 100);
  const isCritical = quota.level === "critical";

  const wrapperClass = isCritical
    ? "rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100"
    : "rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100";

  const dismissClass = isCritical
    ? "inline-flex h-8 min-w-[44px] items-center justify-center rounded-md px-2 text-sm hover:bg-red-100 dark:hover:bg-red-900"
    : "inline-flex h-8 min-w-[44px] items-center justify-center rounded-md px-2 text-sm hover:bg-amber-100 dark:hover:bg-amber-900";

  const message = isCritical
    ? `Speicher kritisch (${pct} %) — neue Cards können fehlschlagen. Jetzt Backup machen und aufräumen.`
    : `Speicher fast voll (${pct} %) — Backup erstellen und Bilder reduzieren empfohlen.`;

  return (
    <div
      role={isCritical ? "alert" : "status"}
      className={`flex flex-wrap items-center justify-between gap-2 ${wrapperClass}`}
    >
      <p className="min-w-0 flex-1">{message}</p>
      <div className="flex items-center gap-1">
        <Link
          to="/settings"
          hash="storage"
          className="underline underline-offset-2 hover:opacity-80"
        >
          In Einstellungen öffnen
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Banner schließen"
          className={dismissClass}
        >
          ×
        </button>
      </div>
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
    void navigator.storage.estimate().then((est) => {
      if (cancelled) return;
      setQuota(classifyQuota(est.usage ?? 0, est.quota ?? 0));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return quota;
}
