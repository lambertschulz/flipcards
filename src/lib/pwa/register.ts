/**
 * PWA registration + update event-bus.
 *
 * `vite-plugin-pwa` provides a virtual module (`virtual:pwa-register`) that
 * registers the generated Workbox service worker. We use `registerType:
 * "prompt"` in `vite.config.ts` — meaning: when a new SW is detected, the
 * old one keeps running until we *ask* the new one to take over. That's
 * what lets us show a "Neue Version verfügbar — Reload?" toast instead of
 * the page silently swapping under the user's feet (issue #25 + ADR-0009:
 * no surprise UI; #16: explicit reload affordance).
 *
 * This module is intentionally framework-agnostic — a tiny pub/sub the
 * React component subscribes to. Keeps the SSR-unfriendly `navigator`
 * access out of component render paths and makes the update mechanism
 * easy to unit-test without spinning up a service worker.
 */

type UpdateListener = () => void;

let listeners: UpdateListener[] = [];
let updateReady = false;
let triggerSwUpdate: (() => Promise<void>) | null = null;

function emit() {
  for (const fn of listeners.slice()) fn();
}

/** Subscribe to "update available" notifications. Returns an unsubscribe fn. */
export function onUpdateReady(fn: UpdateListener): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

/** True once a new SW has finished installing and is waiting to activate. */
export function isUpdateReady(): boolean {
  return updateReady;
}

/**
 * Apply the pending update: instruct the waiting SW to take over, which
 * triggers a `controllerchange` event that reloads the page. Safe to call
 * multiple times — the underlying `updateSW(true)` is idempotent. If no
 * update is pending this is a no-op.
 */
export async function applyUpdate(): Promise<void> {
  if (!triggerSwUpdate) return;
  await triggerSwUpdate();
}

/**
 * Register the Workbox-generated service worker.
 *
 * Called once from `main.tsx`. Skips registration when `navigator.serviceWorker`
 * is missing (e.g. older browsers, file:// URLs) so non-PWA-capable browsers
 * still get the app — they just don't get offline support.
 *
 * Errors during registration are swallowed (logged in dev only) — a broken
 * SW must never block app startup.
 */
export async function registerPwa(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  try {
    // Dynamic import so the virtual module is only pulled into the bundle
    // in builds that include the plugin. Tests stub this whole module.
    const { registerSW } = await import("virtual:pwa-register");
    const updateSW = registerSW({
      onNeedRefresh() {
        updateReady = true;
        emit();
      },
      onOfflineReady() {
        // First-install signal — app is now usable offline. We don't show
        // a toast for this (ADR-0009: avoid celebratory chrome). The
        // browser's own "installed" affordances are sufficient.
      },
    });
    triggerSwUpdate = async () => {
      await updateSW(true);
    };
  } catch (err) {
    // A broken SW must never break app startup — swallow silently.
    // Re-export the error for tests/diagnostics if we ever need it.
    void err;
  }
}

/**
 * Test-only seam: simulate a SW update being ready. Used by the update-toast
 * test to drive the component without spinning up Workbox.
 */
export function __testEmitUpdateReady(trigger?: () => Promise<void>): void {
  updateReady = true;
  triggerSwUpdate = trigger ?? (async () => {});
  emit();
}

/** Test-only seam: reset module state between tests. */
export function __testReset(): void {
  listeners = [];
  updateReady = false;
  triggerSwUpdate = null;
}
