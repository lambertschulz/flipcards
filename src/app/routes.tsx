import { CardCreatePage } from "@/features/card/card-create-page";
import { CardEditPage } from "@/features/card/card-edit-page";
import { DeckCreatePage } from "@/features/deck/deck-create-page";
import { DeckDetailPage } from "@/features/deck/deck-detail-page";
import { DeckListPage } from "@/features/deck/deck-list-page";
import { DeckSettingsPage } from "@/features/deck/deck-settings-page";
import { ReviewSessionPage } from "@/features/review/review-session-page";
import { TagPickerPage } from "@/features/tag-session/tag-picker-page";
import { TagSessionReviewPage } from "@/features/tag-session/tag-session-review-page";
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
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/tag-session" className="underline underline-offset-4 hover:opacity-80">
            Nach Tag lernen
          </Link>
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

const cardCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deck/$deckId/card/new",
  component: function CardCreateRouteComponent() {
    const { deckId } = cardCreateRoute.useParams();
    return <CardCreatePage deckId={deckId} />;
  },
});

const reviewSessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deck/$deckId/review",
  component: function ReviewSessionRouteComponent() {
    const { deckId } = reviewSessionRoute.useParams();
    return <ReviewSessionPage deckId={deckId} />;
  },
});

const cardEditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deck/$deckId/card/$cardId/edit",
  component: function CardEditRouteComponent() {
    const { deckId, cardId } = cardEditRoute.useParams();
    return <CardEditPage deckId={deckId} cardId={cardId} />;
  },
});

const tagSessionPickerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tag-session",
  component: TagPickerPage,
});

// Tag-Session-Review consumes the picker's selection via the `tags` search
// param (comma-joined). We deliberately keep it in the URL — that makes the
// session deep-linkable and survives a hard refresh during review. The
// validator coerces the raw search-value into a clean string.
const tagSessionReviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tag-session/review",
  validateSearch: (search: Record<string, unknown>): { tags: string } => {
    const raw = search.tags;
    return { tags: typeof raw === "string" ? raw : "" };
  },
  component: function TagSessionReviewRouteComponent() {
    const { tags } = tagSessionReviewRoute.useSearch();
    const parsed = tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    return <TagSessionReviewPage tags={parsed} />;
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
  cardCreateRoute,
  cardEditRoute,
  reviewSessionRoute,
  tagSessionPickerRoute,
  tagSessionReviewRoute,
  aboutRoute,
]);
