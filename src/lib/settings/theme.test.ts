import { writeSettings } from "@/lib/settings/settings";
import { applyTheme, initTheme } from "@/lib/settings/theme";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function setPrefersDark(matches: boolean) {
  // jsdom's matchMedia returns false for everything by default; override it.
  const fn = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" ? matches : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: fn,
  });
}

describe("applyTheme", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    setPrefersDark(false);
  });

  it("adds the dark class for theme=dark", () => {
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("removes the dark class for theme=light", () => {
    document.documentElement.classList.add("dark");
    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("follows prefers-color-scheme when theme=system", () => {
    setPrefersDark(true);
    applyTheme("system");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    setPrefersDark(false);
    applyTheme("system");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

describe("initTheme", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    setPrefersDark(false);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("applies the persisted theme on mount", () => {
    writeSettings({ theme: "dark" });
    cleanup = initTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("re-applies the theme when settings change in the same tab", () => {
    cleanup = initTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    writeSettings({ theme: "dark" });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    writeSettings({ theme: "light" });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
