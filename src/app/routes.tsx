import { Button } from "@/components/ui/button";
import { Outlet, createRootRoute, createRoute } from "@tanstack/react-router";

const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-dvh p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Flipcards</h1>
        <nav className="text-sm">
          <a className="underline underline-offset-4 hover:opacity-80" href="#/about">
            About
          </a>
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
  component: () => (
    <section className="space-y-4">
      <p className="text-slate-700 dark:text-slate-300">
        Flipcards — Bootstrap. Das Skelett steht; Features kommen in eigenen Tickets.
      </p>
      <Button>Placeholder action</Button>
    </section>
  ),
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

export const routeTree = rootRoute.addChildren([indexRoute, aboutRoute]);
