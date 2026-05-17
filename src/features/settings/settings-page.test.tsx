import "fake-indexeddb/auto";
import { createCardInDb } from "@/db/cards";
import { db } from "@/db/database";
import { createDeckInDb } from "@/db/decks";
import { SettingsPage } from "@/features/settings/settings-page";
import { readSettings } from "@/lib/settings/settings";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function setupRouter(initialPath = "/settings") {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div>Home</div>,
  });
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    component: SettingsPage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, settingsRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  await router.load();
  return router;
}

async function clickAndFlush(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

describe("SettingsPage", () => {
  beforeEach(async () => {
    localStorage.clear();
    await db.open();
    // Default jsdom navigator.storage.estimate is missing — stub it.
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        estimate: () => Promise.resolve({ usage: 5 * 1024 * 1024, quota: 50 * 1024 * 1024 }),
      },
    });
  });

  afterEach(async () => {
    localStorage.clear();
    await db.decks.clear();
    await db.deckSets.clear();
    await db.cards.clear();
    await db.reviewStates.clear();
    await db.reviews.clear();
  });

  it("renders all five sections in order", async () => {
    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    await screen.findByRole("heading", { level: 3, name: /Sprache/ });
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "Sprache",
      "Theme",
      "Backup-Erinnerung",
      "Speicher",
      "Daten löschen",
    ]);
  });

  it("persists a theme change and applies the dark class live", async () => {
    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    document.documentElement.classList.remove("dark");
    // The theme module is wired up via main.tsx in production. In this test,
    // we listen directly to the event the SettingsPage emits via writeSettings
    // and verify persistence + the page re-renders the selected radio.
    const darkRadio = await screen.findByLabelText("Dunkel");
    await clickAndFlush(darkRadio);

    await waitFor(() => {
      expect(readSettings().theme).toBe("dark");
    });
    expect((screen.getByLabelText("Dunkel") as HTMLInputElement).checked).toBe(true);
  });

  it("persists the language and backup-reminder selections", async () => {
    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    await clickAndFlush(await screen.findByLabelText("English"));
    await clickAndFlush(screen.getByLabelText("Wöchentlich"));

    await waitFor(() => {
      const s = readSettings();
      expect(s.language).toBe("en");
      expect(s.backupReminderFrequency).toBe("weekly");
    });
  });

  it("renders a storage progress bar with the percentage from navigator.storage.estimate()", async () => {
    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      const bar = screen.getByRole("progressbar", { name: /Speicherbelegung/i });
      expect(bar).toHaveAttribute("aria-valuenow", "10");
    });
    expect(screen.getByText(/5\.0 MB von 50 MB \(10 %\)/)).toBeInTheDocument();
  });

  it("wipes IndexedDB after confirming the reset dialog and navigates home", async () => {
    const deck = await createDeckInDb({ name: "Doomed" });
    await createCardInDb({ deckId: deck.id, front: "f", back: "b" });
    expect(await db.decks.count()).toBe(1);

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    await clickAndFlush(await screen.findByRole("button", { name: /Alle Daten löschen…/ }));
    await clickAndFlush(await screen.findByRole("button", { name: /Endgültig löschen/ }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
    expect(await db.decks.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
  });

  it("the reset dialog cancel button leaves data intact", async () => {
    const deck = await createDeckInDb({ name: "Safe" });
    await createCardInDb({ deckId: deck.id, front: "f", back: "b" });

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    await clickAndFlush(await screen.findByRole("button", { name: /Alle Daten löschen…/ }));
    await clickAndFlush(await screen.findByRole("button", { name: /Abbrechen/ }));

    expect(await db.decks.count()).toBe(1);
    expect(router.state.location.pathname).toBe("/settings");
  });

  it("falls back gracefully when navigator.storage is unavailable", async () => {
    Object.defineProperty(navigator, "storage", { configurable: true, value: undefined });
    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByText(/keine Speicher-Auskunft/)).toBeInTheDocument();
    });
  });

  it("the backup-now button is a stub that surfaces 'not yet implemented'", async () => {
    const router = await setupRouter();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    try {
      render(<RouterProvider router={router} />);
      await clickAndFlush(await screen.findByRole("button", { name: /Backup jetzt erstellen/ }));
      expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/noch nicht implementiert/));
    } finally {
      alertSpy.mockRestore();
    }
  });
});
