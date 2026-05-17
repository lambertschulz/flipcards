import "fake-indexeddb/auto";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CuratedLibraryPage } from "./curated-library-page";

async function setupRouter() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const libraryRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/curated",
    component: CuratedLibraryPage,
  });
  const detailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/curated/$slug",
    component: function DetailRouteComponent() {
      const { slug } = detailRoute.useParams();
      return <div data-testid="curated-detail-stub">Detail: {slug}</div>;
    },
  });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div>Home</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([libraryRoute, detailRoute, homeRoute]),
    history: createMemoryHistory({ initialEntries: ["/curated"] }),
  });
  await router.load();
  return router;
}

function makeResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, { status: 200, ...init });
}

describe("CuratedLibraryPage", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders an empty-state when the manifest has zero entries", async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(JSON.stringify({ entries: [] })));
    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByTestId("curated-library-empty")).toBeInTheDocument();
    });
    expect(screen.getByTestId("curated-library-empty").textContent).toMatch(/keine Curated/i);
  });

  it("lists entries sorted alphabetically with title + card-count", async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse(
        JSON.stringify({
          entries: [
            {
              slug: "french",
              kind: "deck",
              title: "Französisch",
              cardCount: 200,
              curatedSourceId: "fr",
              version: 1,
            },
            {
              slug: "ankifix",
              kind: "deck-set",
              title: "Anatomie",
              cardCount: 1500,
              curatedSourceId: "an",
              version: 2,
            },
          ],
        }),
      ),
    );
    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByTestId("curated-library-list")).toBeInTheDocument();
    });

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    // Alphabetical sort: Anatomie before Französisch.
    expect(items[0].textContent).toMatch(/Anatomie/);
    expect(items[1].textContent).toMatch(/Französisch/);
    expect(screen.getByText("200 Cards")).toBeInTheDocument();
    expect(screen.getByText("1500 Cards")).toBeInTheDocument();
  });

  it("renders an error banner when the manifest fetch fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 404, statusText: "Not Found" }));
    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.getByTestId("curated-library-error")).toBeInTheDocument();
    });
  });
});
