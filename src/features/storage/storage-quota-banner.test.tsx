import { StorageQuotaBanner } from "@/features/storage/storage-quota-banner";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Banner-Komponenten-Tests (Issue #27). The pure threshold logic is covered in
 * `quota.test.ts`; here we drive the React shell with a stubbed
 * `navigator.storage.estimate` and assert the rendered surface, the dismiss
 * gesture, the settings deep-link, and the silent failure mode when the
 * Storage API is unavailable.
 */

async function setupRouter() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: StorageQuotaBanner,
  });
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    component: () => <div>Settings</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, settingsRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return router;
}

function stubEstimate(estimate: () => Promise<StorageEstimate>) {
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: { estimate },
  });
}

function removeStorage() {
  // `delete navigator.storage` doesn't work in jsdom — overwrite with undefined.
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: undefined,
  });
}

describe("StorageQuotaBanner", () => {
  const originalStorageDescriptor = Object.getOwnPropertyDescriptor(navigator, "storage");

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalStorageDescriptor) {
      Object.defineProperty(navigator, "storage", originalStorageDescriptor);
    } else {
      // Restore to absent — match the jsdom default.
      Object.defineProperty(navigator, "storage", { configurable: true, value: undefined });
    }
  });

  it("renders nothing while the quota estimate is below 80 %", async () => {
    stubEstimate(() => Promise.resolve({ usage: 50, quota: 100 }));
    const router = await setupRouter();
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders a warning banner (role=status) at ≥ 80 % but < 95 %", async () => {
    stubEstimate(() => Promise.resolve({ usage: 80, quota: 100 }));
    const router = await setupRouter();
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    const banner = await screen.findByRole("status");
    expect(banner.textContent).toMatch(/Speicher fast voll/);
    expect(banner.textContent).toMatch(/80\s*%/);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders a critical banner (role=alert) at ≥ 95 %", async () => {
    stubEstimate(() => Promise.resolve({ usage: 96, quota: 100 }));
    const router = await setupRouter();
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toMatch(/Speicher kritisch/);
    expect(banner.textContent).toMatch(/96\s*%/);
  });

  it("CTA links to the Speicher-section of the Settings page", async () => {
    stubEstimate(() => Promise.resolve({ usage: 96, quota: 100 }));
    const router = await setupRouter();
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    const link = await screen.findByRole("link", { name: /In Einstellungen öffnen/ });
    const href = link.getAttribute("href") ?? "";
    expect(href).toMatch(/\/settings/);
    expect(href).toMatch(/#storage$/);
  });

  it("disappears when the user clicks the dismiss control", async () => {
    stubEstimate(() => Promise.resolve({ usage: 90, quota: 100 }));
    const router = await setupRouter();
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    const dismiss = await screen.findByRole("button", { name: /Banner schließen/ });
    await act(async () => {
      fireEvent.click(dismiss);
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders nothing when navigator.storage is unavailable (silent failure)", async () => {
    removeStorage();
    const router = await setupRouter();
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders nothing when navigator.storage.estimate is missing", async () => {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {},
    });
    const router = await setupRouter();
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("runs the estimate exactly once on mount (no polling)", async () => {
    const estimate = vi.fn(() => Promise.resolve({ usage: 90, quota: 100 }));
    stubEstimate(estimate);
    const router = await setupRouter();
    await act(async () => {
      render(<RouterProvider router={router} />);
    });
    await screen.findByRole("status");

    // Advance the clock past anything that would have been a polling interval.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });

    expect(estimate).toHaveBeenCalledTimes(1);
  });
});
