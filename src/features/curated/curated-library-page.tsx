// Curated-Library page (route: `/curated`).
//
// Lists all entries from `public/curated/index.json`. Each row links to the
// per-entry detail view (`/curated/$slug`). Sorted alphabetically by title
// — ADR-0010 / issue #24 reserve filter + search for later if the catalog
// ever outgrows a single scrollable list. v1 keeps it dumb.
//
// Empty manifest → "Aktuell keine Curated Decks verfügbar". This is the
// expected state until the maintainer lands sample content (out-of-scope
// per the issue brief).

import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { CuratedManifestEntry } from "@/domain/curated/manifest";

import { type LibraryError, loadCuratedManifest } from "./library";

type State =
  | { kind: "loading" }
  | { kind: "ready"; entries: CuratedManifestEntry[] }
  | { kind: "error"; error: LibraryError };

export function CuratedLibraryPage() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await loadCuratedManifest();
      if (cancelled) return;
      if (!result.ok) {
        setState({ kind: "error", error: result.error });
        return;
      }
      const sorted = [...result.value.entries].sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
      );
      setState({ kind: "ready", entries: sorted });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <h2 className="text-lg font-medium">Curated Decks</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Vorbereitete Decks und Deck-Sets, die mit der App ausgeliefert werden. Wähle einen
          Eintrag, um Details zu sehen und zu importieren.
        </p>
      </header>

      {state.kind === "loading" ? (
        <p className="text-sm text-slate-500" data-testid="curated-library-loading">
          Lade Bibliothek…
        </p>
      ) : null}

      {state.kind === "error" ? (
        <div
          role="alert"
          data-testid="curated-library-error"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
        >
          <p className="font-medium">Bibliothek nicht ladbar</p>
          <p className="mt-1">{describeLibraryError(state.error)}</p>
        </div>
      ) : null}

      {state.kind === "ready" && state.entries.length === 0 ? (
        <div
          data-testid="curated-library-empty"
          className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400"
        >
          Aktuell keine Curated Decks verfügbar.
        </div>
      ) : null}

      {state.kind === "ready" && state.entries.length > 0 ? (
        <ul
          className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800"
          data-testid="curated-library-list"
        >
          {state.entries.map((entry) => (
            <li key={entry.slug}>
              <Link
                to="/curated/$slug"
                params={{ slug: entry.slug }}
                className="flex min-h-[44px] flex-wrap items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-900"
                data-testid={`curated-entry-${entry.slug}`}
              >
                <span className="flex-1 truncate font-medium">{entry.title}</span>
                <KindBadge kind={entry.kind} />
                <span className="text-xs text-slate-500 whitespace-nowrap">
                  {entry.cardCount === 1 ? "1 Card" : `${entry.cardCount} Cards`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <div>
        <Link to="/">
          <Button variant="outline">Zurück</Button>
        </Link>
      </div>
    </section>
  );
}

function KindBadge({ kind }: { kind: "deck" | "deck-set" }) {
  const label = kind === "deck" ? "Deck" : "Deck-Set";
  return (
    <span className="inline-flex items-center rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200">
      {label}
    </span>
  );
}

function describeLibraryError(error: LibraryError): string {
  switch (error.kind) {
    case "FetchError":
      return `Die Bibliotheks-Datei konnte nicht geladen werden (${error.message}).`;
    case "JsonSyntaxError":
      return `Die Bibliotheks-Datei ist beschädigt (${error.message}).`;
    case "SchemaError":
      return `Die Bibliotheks-Datei hat ein unerwartetes Format (${error.message}).`;
  }
}
