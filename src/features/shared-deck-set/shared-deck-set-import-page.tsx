// Shared-Deck-Set-Import page (route: /shared-deck-set/import).
//
// Flow per ADR-0011 (Shared-Deck-Set-Import is *additive*, never
// destructive):
//   1. File picker — user selects a `.json`.
//   2. Parse + validate (`parseSharedDeckSet`). On error, show
//      `describeSharedDeckSetError(...)` inline and let the user pick again.
//   3. Apply immediately. No confirmation dialog — ADR-0011 reserves that
//      surface for Backup-Restore. Each contained deck merges/renames/lands
//      verbatim per the Shared-Deck rules; set wrapper follows the symmetric
//      rules. Nothing destructive happens.
//   4. Success panel summarises set + per-deck counts.

import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { type ImportError, parseSharedDeckSet } from "@/domain/shared-deck";

import { type ApplySetSummary, applySharedDeckSetImport } from "./apply";
import { describeSharedDeckSetError } from "./error-messages";
import { readFileAsText } from "./read-file";

type State =
  | { kind: "idle" }
  | { kind: "parsing"; fileName: string }
  | { kind: "applying"; fileName: string }
  | { kind: "error"; fileName: string; error: ImportError }
  | { kind: "done"; summary: ApplySetSummary };

export function SharedDeckSetImportPage() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  const reset = () => {
    setState({ kind: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  };

  const handlePicked = async (file: File) => {
    setState({ kind: "parsing", fileName: file.name });
    let text: string;
    try {
      text = await readFileAsText(file);
    } catch (e) {
      setState({
        kind: "error",
        fileName: file.name,
        error: {
          kind: "JsonSyntaxError",
          message: e instanceof Error ? e.message : String(e),
        },
      });
      return;
    }
    const parsed = parseSharedDeckSet(text);
    if (!parsed.ok) {
      setState({ kind: "error", fileName: file.name, error: parsed.error });
      return;
    }
    setState({ kind: "applying", fileName: file.name });
    const summary = await applySharedDeckSetImport(parsed.value);
    setState({ kind: "done", summary });
  };

  return (
    <section className="mx-auto max-w-xl space-y-6">
      <header className="space-y-1">
        <h2 className="text-lg font-medium">Shared Deck-Set importieren</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Wähle eine Shared-Deck-Set-Datei. Decks und Cards mit derselben ID wie lokal werden
          übersprungen; Namens-Kollisionen werden mit einem Suffix aufgelöst. Decks, die schon in
          einem anderen lokalen Set liegen, bleiben dort.
        </p>
      </header>

      {state.kind === "idle" || state.kind === "error" ? (
        <div className="space-y-3">
          <label className="block">
            <span className="block text-sm font-medium">Shared-Deck-Set-Datei (.json)</span>
            <input
              ref={inputRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handlePicked(file);
              }}
              className="mt-1 block w-full text-sm"
              data-testid="shared-deck-set-file-input"
            />
          </label>
          {state.kind === "error" ? (
            <div
              role="alert"
              data-testid="shared-deck-set-import-error"
              className="whitespace-pre-line rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
            >
              <p className="font-medium">Import nicht möglich</p>
              <p className="mt-1 text-xs text-red-700 dark:text-red-200">{state.fileName}</p>
              <p className="mt-2">{describeSharedDeckSetError(state.error)}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {state.kind === "parsing" || state.kind === "applying" ? (
        <p className="text-sm text-slate-500">
          {state.kind === "parsing" ? "Datei wird geprüft…" : "Shared Deck-Set wird importiert…"}
        </p>
      ) : null}

      {state.kind === "done" ? (
        <SuccessPanel
          summary={state.summary}
          onContinue={() => {
            void navigate({
              to: "/deck-set/$deckSetId",
              params: { deckSetId: state.summary.setId },
            });
          }}
          onReset={reset}
        />
      ) : null}
    </section>
  );
}

function SuccessPanel({
  summary,
  onContinue,
  onReset,
}: {
  summary: ApplySetSummary;
  onContinue: () => void;
  onReset: () => void;
}) {
  const totalAdded = summary.decks.reduce((s, d) => s + d.cardsAdded, 0);
  const totalSkipped = summary.decks.reduce((s, d) => s + d.cardsSkipped, 0);
  return (
    <output
      data-testid="shared-deck-set-import-success"
      className="block space-y-3 rounded-md border border-green-300 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950"
    >
      <p className="font-medium text-green-900 dark:text-green-100">
        Shared Deck-Set importiert: {summary.setName}
      </p>
      <p className="text-sm text-green-900 dark:text-green-100">
        {setSummaryLine(summary.setMode)} {summary.decks.length}{" "}
        {summary.decks.length === 1 ? "Deck" : "Decks"} verarbeitet · {totalAdded} neue Cards
        hinzugefügt
        {totalSkipped > 0 ? `, ${totalSkipped} übersprungen` : ""}.
      </p>
      <ul className="space-y-1 text-sm text-green-900 dark:text-green-100">
        {summary.decks.map((d) => (
          <li key={d.deckId}>
            <span className="font-medium">{d.deckName}</span> — {deckSummaryLine(d.mode)},{" "}
            {d.cardsAdded} neu
            {d.cardsSkipped > 0 ? `, ${d.cardsSkipped} übersprungen` : ""}
            {d.joinedSet ? "" : " · bleibt in vorhandenem Set"}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onContinue}>
          Zum Deck-Set
        </Button>
        <Button type="button" variant="outline" onClick={onReset}>
          Weiteres Deck-Set importieren
        </Button>
      </div>
    </output>
  );
}

function setSummaryLine(mode: ApplySetSummary["setMode"]): string {
  switch (mode) {
    case "new":
      return "Set neu angelegt.";
    case "renamed":
      return "Set mit Suffix angelegt, weil der Name lokal schon vergeben war.";
    case "merged":
      return "Mit lokalem Set zusammengeführt (lokal gewinnt).";
  }
}

function deckSummaryLine(mode: ApplySetSummary["decks"][number]["mode"]): string {
  switch (mode) {
    case "new":
      return "neu angelegt";
    case "renamed":
      return "mit Suffix angelegt";
    case "merged":
      return "mit lokalem Deck zusammengeführt";
  }
}
