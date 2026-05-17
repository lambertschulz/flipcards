// User-level Settings (issue #9). Five typed keys, persisted in localStorage.
//
// Why localStorage and not IndexedDB? The brief explicitly leaves this as an
// implementation detail. localStorage wins here because:
//   - Synchronous read at module-load lets us apply the theme before first
//     paint (no flash-of-wrong-theme).
//   - No Dexie schema migration for five scalar values.
//   - Reset-Data (section 5) wipes IndexedDB; user-prefs in localStorage are
//     orthogonal to that and intentionally survive the reset.
//
// The `storageEstimate` value mentioned in the agent brief is *not* persisted —
// it's read live from `navigator.storage.estimate()` in the page component.

export type Language = "de" | "en";
export type Theme = "light" | "dark" | "system";
export type BackupReminderFrequency = "off" | "weekly" | "monthly";

export interface Settings {
  language: Language;
  theme: Theme;
  backupReminderFrequency: BackupReminderFrequency;
  /**
   * Whether the Streak ("Lernserie") is shown anywhere in the UI. ADR-0012
   * mandates an opt-out toggle to address the "stress-inducing" critique of
   * the feature without sacrificing it for users who *want* the streak.
   * Default = `true` (on). When off, the Stats-Screen's Streak section and
   * any future Streak chips are hidden; the underlying log keeps growing.
   */
  showStreak: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  language: "de",
  theme: "system",
  backupReminderFrequency: "off",
  showStreak: true,
};

// Single key, JSON-encoded blob. One key keeps the localStorage surface tiny
// and lets us evolve the shape without touching call sites — readSettings()
// always normalises to the latest schema (missing keys fall back to defaults).
const STORAGE_KEY = "flipcards.settings.v1";

const LANGUAGES: readonly Language[] = ["de", "en"];
const THEMES: readonly Theme[] = ["light", "dark", "system"];
const FREQUENCIES: readonly BackupReminderFrequency[] = ["off", "weekly", "monthly"];

function isLanguage(v: unknown): v is Language {
  return typeof v === "string" && (LANGUAGES as readonly string[]).includes(v);
}
function isTheme(v: unknown): v is Theme {
  return typeof v === "string" && (THEMES as readonly string[]).includes(v);
}
function isFrequency(v: unknown): v is BackupReminderFrequency {
  return typeof v === "string" && (FREQUENCIES as readonly string[]).includes(v);
}

export function readSettings(): Settings {
  if (typeof localStorage === "undefined") return { ...DEFAULT_SETTINGS };
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (!parsed || typeof parsed !== "object") return { ...DEFAULT_SETTINGS };
  const obj = parsed as Record<string, unknown>;
  return {
    language: isLanguage(obj.language) ? obj.language : DEFAULT_SETTINGS.language,
    theme: isTheme(obj.theme) ? obj.theme : DEFAULT_SETTINGS.theme,
    backupReminderFrequency: isFrequency(obj.backupReminderFrequency)
      ? obj.backupReminderFrequency
      : DEFAULT_SETTINGS.backupReminderFrequency,
    showStreak: typeof obj.showStreak === "boolean" ? obj.showStreak : DEFAULT_SETTINGS.showStreak,
  };
}

export function writeSettings(patch: Partial<Settings>): Settings {
  const current = readSettings();
  const next: Settings = { ...current, ...patch };
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  // Fire a same-document event so subscribers can react without page reload.
  // The browser only fires `storage` events for *other* tabs; we need an
  // intra-tab signal too. A simple CustomEvent on window does the job.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<Settings>("flipcards:settings-changed", { detail: next }));
  }
  return next;
}

export function clearSettings(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<Settings>("flipcards:settings-changed", { detail: { ...DEFAULT_SETTINGS } }),
    );
  }
}
