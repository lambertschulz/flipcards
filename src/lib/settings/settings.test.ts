import {
  DEFAULT_SETTINGS,
  clearSettings,
  readSettings,
  writeSettings,
} from "@/lib/settings/settings";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("settings module", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("returns the defaults when nothing has been persisted yet", () => {
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips a full write", () => {
    writeSettings({ language: "en", theme: "dark", backupReminderFrequency: "weekly" });
    expect(readSettings()).toEqual({
      language: "en",
      theme: "dark",
      backupReminderFrequency: "weekly",
    });
  });

  it("merges partial writes onto the existing value", () => {
    writeSettings({ theme: "dark" });
    writeSettings({ language: "en" });
    expect(readSettings()).toEqual({
      language: "en",
      theme: "dark",
      backupReminderFrequency: "off",
    });
  });

  it("falls back to defaults when the stored blob is corrupt JSON", () => {
    localStorage.setItem("flipcards.settings.v1", "{not-json");
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("rejects unknown enum values and falls back to defaults for those keys only", () => {
    localStorage.setItem(
      "flipcards.settings.v1",
      JSON.stringify({ language: "fr", theme: "dark", backupReminderFrequency: "daily" }),
    );
    expect(readSettings()).toEqual({
      language: "de", // fr → fallback
      theme: "dark", // valid
      backupReminderFrequency: "off", // daily → fallback
    });
  });

  it("dispatches a flipcards:settings-changed event on write", () => {
    let received: unknown = null;
    const handler = (e: Event) => {
      received = (e as CustomEvent).detail;
    };
    window.addEventListener("flipcards:settings-changed", handler);
    try {
      writeSettings({ theme: "light" });
      expect(received).toMatchObject({ theme: "light" });
    } finally {
      window.removeEventListener("flipcards:settings-changed", handler);
    }
  });

  it("clearSettings wipes the persisted blob and re-emits defaults", () => {
    writeSettings({ theme: "dark", language: "en" });
    let received: unknown = null;
    const handler = (e: Event) => {
      received = (e as CustomEvent).detail;
    };
    window.addEventListener("flipcards:settings-changed", handler);
    try {
      clearSettings();
      expect(readSettings()).toEqual(DEFAULT_SETTINGS);
      expect(received).toEqual(DEFAULT_SETTINGS);
    } finally {
      window.removeEventListener("flipcards:settings-changed", handler);
    }
  });
});
