import "fake-indexeddb/auto";
import { db } from "@/db/database";
import { putReviewState } from "@/db/review-states";
import { appendReview } from "@/db/reviews";
import { StatsPage } from "@/features/stats/stats-page";
import { writeSettings } from "@/lib/settings/settings";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

async function setupRouter() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const statsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/statistik",
    component: StatsPage,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([statsRoute]),
    history: createMemoryHistory({ initialEntries: ["/statistik"] }),
  });
  await router.load();
  return router;
}

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

function noonDaysAgo(n: number): number {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.getTime();
}

describe("StatsPage", () => {
  beforeEach(async () => {
    localStorage.clear();
    await db.open();
  });

  afterEach(async () => {
    localStorage.clear();
    await db.reviews.clear();
    await db.reviewStates.clear();
    await db.cards.clear();
    await db.decks.clear();
  });

  it("shows the empty state when there are no reviews", async () => {
    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    await screen.findByRole("heading", { name: /Statistik/ });
    await screen.findByText(/Noch keine Reviews/);
  });

  it("renders the four range presets and defaults to Woche", async () => {
    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    const toggle = await screen.findByTestId("stats-range-toggle");
    for (const label of ["Heute", "Woche", "Monat", "All-Time"]) {
      expect(within(toggle).getByLabelText(label)).toBeInTheDocument();
    }
    expect((within(toggle).getByLabelText("Woche") as HTMLInputElement).checked).toBe(true);
  });

  it("shows 'Heute gelernt' count from reviews appended since local midnight", async () => {
    await appendReview({
      cardId: "c1",
      timestamp: Date.now() - HOUR,
      rating: "good",
      intervalAfter: 1,
      easeAfter: 2.5,
    });
    await appendReview({
      cardId: "c2",
      timestamp: Date.now() - 2 * HOUR,
      rating: "easy",
      intervalAfter: 1,
      easeAfter: 2.5,
    });

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      const line = screen.getByTestId("stats-today-line");
      expect(line).toHaveTextContent(/Heute gelernt: 2/);
    });
  });

  it("aggregates the scoped summary across the selected range", async () => {
    // 1 review today, 1 review 3 days ago, 1 review 20 days ago.
    await appendReview({
      cardId: "c1",
      timestamp: noonDaysAgo(0),
      rating: "good",
      intervalAfter: 1,
      easeAfter: 2.5,
    });
    await appendReview({
      cardId: "c2",
      timestamp: noonDaysAgo(3),
      rating: "again",
      intervalAfter: 1,
      easeAfter: 2.3,
    });
    await appendReview({
      cardId: "c3",
      timestamp: noonDaysAgo(20),
      rating: "easy",
      intervalAfter: 1,
      easeAfter: 2.5,
    });

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    // Default = Woche → 2 reviews.
    await waitFor(() => {
      expect(screen.getByTestId("stats-scoped-summary")).toHaveTextContent(
        /2 Antworten in den letzten 7 Tagen/,
      );
    });

    // Switch to Heute → 1 review.
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Heute"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("stats-scoped-summary")).toHaveTextContent(/1 Antwort heute/);
    });

    // Switch to Monat → 3 reviews.
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Monat"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("stats-scoped-summary")).toHaveTextContent(
        /3 Antworten in den letzten 30 Tagen/,
      );
    });
  });

  it("renders the streak section by default and hides it when opted out", async () => {
    await appendReview({
      cardId: "c1",
      timestamp: noonDaysAgo(0),
      rating: "good",
      intervalAfter: 1,
      easeAfter: 2.5,
    });

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByTestId("stats-streak")).toBeInTheDocument();
    });

    await act(async () => {
      writeSettings({ showStreak: false });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("stats-streak")).not.toBeInTheDocument();
    });
  });

  it("renders the due forecast for the next 7 days when there are reviews", async () => {
    await appendReview({
      cardId: "c1",
      timestamp: Date.now() - HOUR,
      rating: "good",
      intervalAfter: 1,
      easeAfter: 2.5,
    });
    await putReviewState("c1", {
      repetitions: 1,
      easeFactor: 2.5,
      intervalDays: 1,
      nextDue: Date.now() + DAY,
    });

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByTestId("stats-forecast")).toBeInTheDocument();
    });
  });

  it("renders an answer-distribution section once reviews exist", async () => {
    await appendReview({
      cardId: "c1",
      timestamp: Date.now() - HOUR,
      rating: "again",
      intervalAfter: 1,
      easeAfter: 2.3,
    });
    await appendReview({
      cardId: "c1",
      timestamp: Date.now() - 2 * HOUR,
      rating: "good",
      intervalAfter: 6,
      easeAfter: 2.5,
    });

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByTestId("stats-distribution")).toBeInTheDocument();
    });
    // Default range = Woche so both reviews count.
    const section = screen.getByTestId("stats-distribution");
    expect(within(section).getByText(/Nochmal/)).toBeInTheDocument();
    expect(within(section).getByText(/Gut/)).toBeInTheDocument();
  });
});
