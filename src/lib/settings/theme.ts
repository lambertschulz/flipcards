// Theme application: maps the `theme` setting onto the `dark` class on
// <html>, which is what Tailwind's `dark:` variants key off (config sets
// `darkMode: "class"`).
//
// When `theme === "system"`, we honour `prefers-color-scheme` and keep
// listening so a runtime OS-level theme switch flips the app without a
// reload. When `theme` is `light` or `dark`, the user choice wins and the
// media query is ignored.
//
// Designed to be called both at boot (synchronously, before React mounts —
// no flash of wrong theme) and on every settings change.

import { type Settings, type Theme, readSettings } from "@/lib/settings/settings";

const MQ_DARK = "(prefers-color-scheme: dark)";

function setDarkClass(on: boolean): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (on) root.classList.add("dark");
  else root.classList.remove("dark");
}

function resolveDark(theme: Theme): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  if (typeof window === "undefined") return false;
  return window.matchMedia(MQ_DARK).matches;
}

export function applyTheme(theme: Theme): void {
  setDarkClass(resolveDark(theme));
}

/**
 * Wire up theme application for the lifetime of the app. Returns a cleanup
 * function (handy for tests; not strictly needed in production since the
 * subscriptions live until page unload).
 *
 * Behaviour:
 *   - Applies the current persisted theme immediately.
 *   - Listens for `flipcards:settings-changed` (intra-tab) and `storage`
 *     (cross-tab) to re-apply when the user changes the theme.
 *   - When the current theme is `system`, also listens for OS theme changes.
 */
export function initTheme(): () => void {
  let current = readSettings().theme;
  applyTheme(current);

  const mq = typeof window !== "undefined" ? window.matchMedia(MQ_DARK) : null;
  const mqHandler = () => {
    if (current === "system") applyTheme("system");
  };
  mq?.addEventListener("change", mqHandler);

  const onSettingsChanged = (e: Event) => {
    const detail = (e as CustomEvent<Settings>).detail;
    if (!detail) return;
    current = detail.theme;
    applyTheme(current);
  };
  window.addEventListener("flipcards:settings-changed", onSettingsChanged);

  // Cross-tab: localStorage `storage` event fires in *other* tabs when one
  // tab writes. We just re-read and apply.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== "flipcards.settings.v1") return;
    current = readSettings().theme;
    applyTheme(current);
  };
  window.addEventListener("storage", onStorage);

  return () => {
    mq?.removeEventListener("change", mqHandler);
    window.removeEventListener("flipcards:settings-changed", onSettingsChanged);
    window.removeEventListener("storage", onStorage);
  };
}
