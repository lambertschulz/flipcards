// Curated-Detail page (route: `/curated/$slug`).
//
// Flow:
//   1. Load `index.json`, find the entry for `$slug`. Unknown slug → 404-like
//      "Eintrag nicht gefunden".
//   2. Render metadata (title, description, card-count, license, version).
//   3. On "Importieren": fetch the per-entry JSON, route through the
//      existing `parseSharedDeck` / `parseSharedDeckSet` pipelines, then
//      apply via the existing apply helpers — the same conflict-resolution
//      (additive merge, name-suffix) the user-uploaded import flow uses.
//   4. On success: navigate to the resulting deck / deck-set so the user
//      can immediately start a review session.

import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { CuratedManifestEntry } from "@/domain/curated/manifest";
import type { ImportError } from "@/domain/shared-deck";
import { type ApplySetSummary, applySharedDeckSetImport } from "@/features/shared-deck-set/apply";
import { describeSharedDeckSetError } from "@/features/shared-deck-set/error-messages";
import { type ApplySummary, applySharedDeckImport } from "@/features/shared-deck/apply";
import { describeSharedDeckError } from "@/features/shared-deck/error-messages";

import { type LibraryError, loadCuratedManifest, loadCuratedPayload } from "./library";

type State =
  | { kind: "loading-manifest" }
  | { kind: "manifest-error"; error: LibraryError }
  | { kind: "not-found" }
  | { kind: "ready"; entry: CuratedManifestEntry }
  | { kind: "importing"; entry: CuratedManifestEntry }
  | {
      kind: "import-error";
      entry: CuratedManifestEntry;
      // Either a library-level fetch/syntax error or an import-pipeline error
      // bubbled up from `parseSharedDeck`.
      libraryError?: LibraryError;
      importError?: ImportError;
    }
  | {
      kind: "import-done";
      entry: CuratedManifestEntry;
      summary: { kind: "deck"; data: ApplySummary } | { kind: "deck-set"; data: ApplySetSummary };
    };

export function CuratedDetailPage({ slug }: { slug: string }) {
  const [state, setState] = useState<State>({ kind: "loading-manifest" });
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await loadCuratedManifest();
      if (cancelled) return;
      if (!result.ok) {
        setState({ kind: "manifest-error", error: result.error });
        return;
      }
      const found = result.value.entries.find((e) => e.slug === slug);
      if (!found) {
        setState({ kind: "not-found" });
        return;
      }
      setState({ kind: "ready", entry: found });
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const onImport = async () => {
    if (state.kind !== "ready") return;
    const entry = state.entry;
    setState({ kind: "importing", entry });
    const result = await loadCuratedPayload(entry.slug, entry.kind);
    if (!result.ok) {
      if (result.error.kind === "ImportError") {
        setState({ kind: "import-error", entry, importError: result.error.importError });
      } else {
        setState({ kind: "import-error", entry, libraryError: result.error });
      }
      return;
    }
    if (result.value.kind === "deck") {
      // ADR-0010 provenance. The SharedDeck schema already carries optional
      // `curatedSourceId` + `contentVersion` slots; the manifest knows the
      // curator-assigned values for the entry, so we stamp them onto the
      // payload before handing it to the generic apply pipeline. This is the
      // less intrusive of the two threading options (mutate-payload vs add
      // a curated-only param to the apply API) — the schema fields exist
      // precisely so curated imports can ride the same pipeline.
      const payload: typeof result.value.payload = {
        ...result.value.payload,
        deck: {
          ...result.value.payload.deck,
          curatedSourceId: entry.curatedSourceId,
          contentVersion: entry.version,
        },
      };
      const summary = await applySharedDeckImport(payload);
      setState({ kind: "import-done", entry, summary: { kind: "deck", data: summary } });
    } else {
      // For a SharedDeckSet, the manifest's `curatedSourceId` + `version`
      // describe the SET, not individual member decks. Each contained deck
      // entry carries its own optional provenance — leave those alone and
      // only set the set-level provenance on the wrapper's deck entries if
      // they were authored to carry it. v1 doesn't model set-level
      // provenance on the DeckSetRow (no schema field), so we stamp each
      // contained deck entry with the set's curator id + version so the
      // resulting Deck rows in IndexedDB are still distinguishable as
      // curated. Per-entry values from the payload, if present, win.
      const setPayload: typeof result.value.payload = {
        ...result.value.payload,
        decks: result.value.payload.decks.map((d) => ({
          ...d,
          curatedSourceId: d.curatedSourceId ?? entry.curatedSourceId,
          contentVersion: d.contentVersion ?? entry.version,
        })),
      };
      const summary = await applySharedDeckSetImport(setPayload);
      setState({ kind: "import-done", entry, summary: { kind: "deck-set", data: summary } });
    }
  };

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <Link
          to="/curated"
          className="text-xs text-slate-500 underline underline-offset-2 hover:opacity-80"
        >
          ← Curated-Bibliothek
        </Link>
      </header>

      {state.kind === "loading-manifest" ? (
        <p className="text-sm text-slate-500">Lade Bibliothek…</p>
      ) : null}

      {state.kind === "manifest-error" ? (
        <div
          role="alert"
          data-testid="curated-detail-manifest-error"
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
        >
          <p className="font-medium">Bibliothek nicht ladbar</p>
          <p className="mt-1">{describeLibraryError(state.error)}</p>
        </div>
      ) : null}

      {state.kind === "not-found" ? (
        <div
          role="alert"
          data-testid="curated-detail-not-found"
          className="rounded-md border border-slate-300 p-3 text-sm dark:border-slate-700"
        >
          <p className="font-medium">Eintrag nicht gefunden</p>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            Dieser Curated-Eintrag existiert nicht (mehr).
          </p>
        </div>
      ) : null}

      {state.kind === "ready" || state.kind === "importing" || state.kind === "import-error" ? (
        <DetailCard entry={state.entry}>
          <Button
            type="button"
            onClick={() => {
              void onImport();
            }}
            disabled={state.kind === "importing"}
            data-testid="curated-import-button"
          >
            {state.kind === "importing" ? "Wird importiert…" : "Importieren"}
          </Button>

          {state.kind === "import-error" ? (
            <div
              role="alert"
              data-testid="curated-detail-import-error"
              className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
            >
              <p className="font-medium">Import nicht möglich</p>
              <p className="mt-1">
                {state.libraryError !== undefined
                  ? describeLibraryError(state.libraryError)
                  : state.importError !== undefined
                    ? state.entry.kind === "deck"
                      ? describeSharedDeckError(state.importError)
                      : describeSharedDeckSetError(state.importError)
                    : "Unbekannter Fehler."}
              </p>
            </div>
          ) : null}
        </DetailCard>
      ) : null}

      {state.kind === "import-done" ? (
        <DetailCard entry={state.entry}>
          <ImportSuccess
            summary={state.summary}
            onContinue={() => {
              if (state.summary.kind === "deck") {
                void navigate({
                  to: "/deck/$deckId",
                  params: { deckId: state.summary.data.deckId },
                });
              } else {
                void navigate({
                  to: "/deck-set/$deckSetId",
                  params: { deckSetId: state.summary.data.setId },
                });
              }
            }}
          />
        </DetailCard>
      ) : null}
    </section>
  );
}

function DetailCard({
  entry,
  children,
}: {
  entry: CuratedManifestEntry;
  children: React.ReactNode;
}) {
  return (
    <article
      className="space-y-3 rounded-md border border-slate-200 p-4 dark:border-slate-800"
      data-testid="curated-detail"
    >
      <header className="space-y-1">
        <h2 className="text-lg font-medium">{entry.title}</h2>
        <p className="text-xs text-slate-500">
          {entry.kind === "deck" ? "Deck" : "Deck-Set"} ·{" "}
          {entry.cardCount === 1 ? "1 Card" : `${entry.cardCount} Cards`}
          {entry.language ? ` · ${entry.language}` : ""}
          {` · v${entry.version}`}
        </p>
      </header>
      {entry.description ? (
        <p className="text-sm text-slate-700 dark:text-slate-300">{entry.description}</p>
      ) : null}
      {entry.license ? (
        <p data-testid="curated-detail-license" className="text-xs text-slate-500">
          Lizenz: {entry.license}
        </p>
      ) : null}
      <div>{children}</div>
    </article>
  );
}

function ImportSuccess({
  summary,
  onContinue,
}: {
  summary: { kind: "deck"; data: ApplySummary } | { kind: "deck-set"; data: ApplySetSummary };
  onContinue: () => void;
}) {
  return (
    <output
      data-testid="curated-import-success"
      className="block space-y-3 rounded-md border border-green-300 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950"
    >
      {summary.kind === "deck" ? (
        <p className="text-sm text-green-900 dark:text-green-100">
          Importiert: {summary.data.deckName} — {summary.data.cardsAdded}{" "}
          {summary.data.cardsAdded === 1 ? "Card" : "Cards"} hinzugefügt.
        </p>
      ) : (
        <p className="text-sm text-green-900 dark:text-green-100">
          Importiert: {summary.data.setName} — {summary.data.decks.length}{" "}
          {summary.data.decks.length === 1 ? "Deck" : "Decks"} verarbeitet.
        </p>
      )}
      <Button type="button" onClick={onContinue}>
        {summary.kind === "deck" ? "Zum Deck" : "Zum Deck-Set"}
      </Button>
    </output>
  );
}

function describeLibraryError(error: LibraryError): string {
  switch (error.kind) {
    case "FetchError":
      return `Die Datei konnte nicht geladen werden (${error.message}).`;
    case "JsonSyntaxError":
      return `Die Datei ist beschädigt (${error.message}).`;
    case "SchemaError":
      return `Die Datei hat ein unerwartetes Format (${error.message}).`;
  }
}
