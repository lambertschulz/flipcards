import {
  __testEmitUpdateReady,
  __testReset,
  applyUpdate,
  isUpdateReady,
  onUpdateReady,
} from "@/lib/pwa/register";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Targets the small event-bus around `vite-plugin-pwa`'s `registerSW` —
// the actual SW activation is exercised manually in the browser. Here we
// verify the contract React code depends on: subscribers get notified
// when an update is ready, `applyUpdate` calls the wired trigger, and
// unsubscribe stops further notifications.

describe("pwa/register", () => {
  beforeEach(() => {
    __testReset();
  });

  it("starts with no update ready", () => {
    expect(isUpdateReady()).toBe(false);
  });

  it("notifies subscribers when an update becomes ready", () => {
    const fn = vi.fn();
    onUpdateReady(fn);
    __testEmitUpdateReady();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(isUpdateReady()).toBe(true);
  });

  it("stops notifying after unsubscribe", () => {
    const fn = vi.fn();
    const off = onUpdateReady(fn);
    off();
    __testEmitUpdateReady();
    expect(fn).not.toHaveBeenCalled();
  });

  it("applyUpdate forwards to the wired SW trigger", async () => {
    const trigger = vi.fn(async () => {});
    __testEmitUpdateReady(trigger);
    await applyUpdate();
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it("applyUpdate is a no-op when no update is pending", async () => {
    // No throw, no error — just resolves cleanly.
    await expect(applyUpdate()).resolves.toBeUndefined();
  });
});
