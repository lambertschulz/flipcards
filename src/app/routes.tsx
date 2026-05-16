import { DeckCreatePage } from "@/features/deck/deck-create-page";
import { DeckDetailPage } from "@/features/deck/deck-detail-page";
import { DeckListPage } from "@/features/deck/deck-list-page";
import { DeckSettingsPage } from "@/features/deck/deck-settings-page";
import { Link, Outlet, createRootRoute, createRoute } from "@tanstack/react-router";

const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-dvh p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          <Link to="/" className="hover:opacity-80">
            Flipcards
          </Link>
        </h1>
        <nav className="text-sm">
          <Link to="/about" className="underline underline-offset-4 hover:opacity-80">
            About
          </Link>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DeckListPage,
});

const deckCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deck/new",
  component: DeckCreatePage,
});

const deckDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deck/$deckId",
  component: function DeckDetailRouteComponent() {
    const { deckId } = deckDetailRoute.useParams();
    return <DeckDetailPage deckId={deckId} />;
  },
});

const deckSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deck/$deckId/settings",
  component: function DeckSettingsRouteComponent() {
    const { deckId } = deckSettingsRoute.useParams();
    return <DeckSettingsPage deckId={deckId} />;
  },
});

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/about",
  component: () => (
    <section className="space-y-2">
      <h2 className="text-lg font-medium">About</h2>
      <p className="text-slate-700 dark:text-slate-300">
        Eine browserbasierte Spaced-Repetition-Lernanwendung. Siehe{" "}
        <a
          className="underline"
          href="https://github.com/lambertschulz/flipcards/blob/main/CONTEXT.md"
        >
          CONTEXT.md
        </a>
        .
      </p>
    </section>
  ),
});

export const routeTree = rootRoute.addChildren([
  indexRoute,
  deckCreateRoute,
  deckDetailRoute,
  deckSettingsRoute,
  aboutRoute,
]);
