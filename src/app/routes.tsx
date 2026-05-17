import { PendingDeleteToasts } from "@/components/pending-delete-toasts";
import { BackupImportPage } from "@/features/backup/backup-import-page";
import { CardCreatePage } from "@/features/card/card-create-page";
import { CardEditPage } from "@/features/card/card-edit-page";
import { DeckSetCreatePage } from "@/features/deck-set/deck-set-create-page";
import { DeckSetDetailPage } from "@/features/deck-set/deck-set-detail-page";
import { DeckSetSettingsPage } from "@/features/deck-set/deck-set-settings-page";
import { DeckCreatePage } from "@/features/deck/deck-create-page";
import { DeckDetailPage } from "@/features/deck/deck-detail-page";
import { DeckSettingsPage } from "@/features/deck/deck-settings-page";
import { HomePage } from "@/features/home/home-page";
import { ReviewSessionPage } from "@/features/review/review-session-page";
import { SettingsPage } from "@/features/settings/settings-page";
import { SharedDeckImportPage } from "@/features/shared-deck/shared-deck-import-page";
import { SharedDeckSetImportPage } from "@/features/shared-deck-set/shared-deck-set-import-page";
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
          <Link to="/settings" className="underline underline-offset-4 hover:opacity-80">
            Einstellungen
          </Link>
          <Link to="/about" className="underline underline-offset-4 hover:opacity-80">
            About
          </Link>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
      <PendingDeleteToasts />
    </div>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
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
    // Key by deckId so navigating between /deck/a → /deck/b remounts the
    // page and discards page-local filter state (issue #10: "re-entering
    // the page resets the bar"). TanStack Router otherwise reuses the
    // component instance across param changes.
    return <DeckDetailPage key={deckId} deckId={deckId} />;
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

const deckSetCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deck-set/new",
  component: DeckSetCreatePage,
});

const deckSetDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deck-set/$deckSetId",
  component: function DeckSetDetailRouteComponent() {
    const { deckSetId } = deckSetDetailRoute.useParams();
    return <DeckSetDetailPage deckSetId={deckSetId} />;
  },
});

const deckSetSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/deck-set/$deckSetId/settings",
  component: function DeckSetSettingsRouteComponent() {
    const { deckSetId } = deckSetSettingsRoute.useParams();
    return <DeckSetSettingsPage deckSetId={deckSetId} />;
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
// param. We deliberately keep it in the URL — that makes the session
// deep-linkable and survives a hard refresh during review. Tags are
// serialised as an array (repeated `tags` query keys) rather than a single
// comma-joined string: `normalizeTag` allows commas inside a tag name
// (e.g. "cardio,renal"), so a comma-joined wire format would mis-split
// such tags on the receiving side and break the AND-filter. The validator
// accepts either an array (the normal case) or a single string (a single
// tag arriving as `?tags=foo`), and trims/dedupes to a clean string[].
const tagSessionReviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tag-session/review",
  validateSearch: (search: Record<string, unknown>): { tags: string[] } => {
    const raw = search.tags;
    const arr = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
    const cleaned: string[] = [];
    const seen = new Set<string>();
    for (const entry of arr) {
      if (typeof entry !== "string") continue;
      const trimmed = entry.trim();
      if (trimmed.length === 0) continue;
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
      cleaned.push(trimmed);
    }
    return { tags: cleaned };
  },
  component: function TagSessionReviewRouteComponent() {
    const { tags } = tagSessionReviewRoute.useSearch();
    return <TagSessionReviewPage tags={tags} />;
  },
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const backupImportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/backup/import",
  component: BackupImportPage,
});

const sharedDeckImportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/shared-deck/import",
  component: SharedDeckImportPage,
});

const sharedDeckSetImportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/shared-deck-set/import",
  component: SharedDeckSetImportPage,
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
  deckSetCreateRoute,
  deckSetDetailRoute,
  deckSetSettingsRoute,
  cardCreateRoute,
  cardEditRoute,
  reviewSessionRoute,
  tagSessionPickerRoute,
  tagSessionReviewRoute,
  settingsRoute,
  backupImportRoute,
  sharedDeckImportRoute,
  sharedDeckSetImportRoute,
  aboutRoute,
]);
