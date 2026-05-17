// Shared-Deck-Import page (route: /shared-deck/import).
//
// Flow per ADR-0011 (Shared-Deck-Import is *additive*, never destructive):
//   1. File picker — user selects a `.json`.
//   2. Parse + validate (`parseSharedDeck`). On error, show
//      `describeSharedDeckError(...)` inline and let the user pick again.
//   3. Apply immediately. No confirmation dialog — ADR-0011 reserves that
//      surface for Backup-Restore. The merge is non-destructive (local
//      wins on ID-match, name suffix on name-only collision), so there is
//      nothing to undo.
//   4. Success panel summarises mode + counts.

import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { type ImportError, parseSharedDeck } from "@/domain/shared-deck";

import { type ApplySummary, applySharedDeckImport } from "./apply";
import { describeSharedDeckError } from "./error-messages";
import { readFileAsText } from "./read-file";

type State =
  | { kind: "idle" }
  | { kind: "parsing"; fileName: string }
  | { kind: "applying"; fileName: string }
  | { kind: "error"; fileName: string; error: ImportError }
  | { kind: "done"; summary: ApplySummary };

export function SharedDeckImportPage() {
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
    const parsed = parseSharedDeck(text);
    if (!parsed.ok) {
      setState({ kind: "error", fileName: file.name, error: parsed.error });
      return;
    }
    setState({ kind: "applying", fileName: file.name });
    const summary = await applySharedDeckImport(parsed.value);
    setState({ kind: "done", summary });
  };

  return (
    <section className="mx-auto max-w-xl space-y-6">
      <header className="space-y-1">
        <h2 className="text-lg font-medium">Shared Deck importieren</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Wähle eine Shared-Deck-Datei. Cards mit derselben ID wie ein lokales Deck werden
          übersprungen; Namens-Kollisionen werden mit einem Suffix aufgelöst.
        </p>
      </header>

      {state.kind === "idle" || state.kind === "error" ? (
        <div className="space-y-3">
          <label className="block">
            <span className="block text-sm font-medium">Shared-Deck-Datei (.json)</span>
            <input
              ref={inputRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handlePicked(file);
              }}
              className="mt-1 block w-full text-sm"
              data-testid="shared-deck-file-input"
            />
          </label>
          {state.kind === "error" ? (
            <div
              role="alert"
              data-testid="shared-deck-import-error"
              className="whitespace-pre-line rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
            >
              <p className="font-medium">Import nicht möglich</p>
              <p className="mt-1 text-xs text-red-700 dark:text-red-200">{state.fileName}</p>
              <p className="mt-2">{describeSharedDeckError(state.error)}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {state.kind === "parsing" || state.kind === "applying" ? (
        <p className="text-sm text-slate-500">
          {state.kind === "parsing" ? "Datei wird geprüft…" : "Shared Deck wird importiert…"}
        </p>
      ) : null}

      {state.kind === "done" ? (
        <SuccessPanel
          summary={state.summary}
          onContinue={() => {
            void navigate({ to: "/deck/$deckId", params: { deckId: state.summary.deckId } });
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
  summary: ApplySummary;
  onContinue: () => void;
  onReset: () => void;
}) {
  return (
    <output
      data-testid="shared-deck-import-success"
      className="block space-y-3 rounded-md border border-green-300 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950"
    >
      <p className="font-medium text-green-900 dark:text-green-100">
        Shared Deck importiert: {summary.deckName}
      </p>
      <p className="text-sm text-green-900 dark:text-green-100">{summaryLine(summary)}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onContinue}>
          Zum Deck
        </Button>
        <Button type="button" variant="outline" onClick={onReset}>
          Weiteres Deck importieren
        </Button>
      </div>
    </output>
  );
}

function summaryLine(s: ApplySummary): string {
  switch (s.mode) {
    case "new":
      return `${s.cardsAdded} Card${s.cardsAdded === 1 ? "" : "s"} importiert. Alle Cards sind sofort fällig.`;
    case "renamed":
      return `Mit Suffix angelegt, weil der Name lokal schon vergeben war. ${s.cardsAdded} Card${s.cardsAdded === 1 ? "" : "s"} importiert.`;
    case "merged": {
      const skippedSuffix =
        s.cardsSkipped > 0
          ? `, ${s.cardsSkipped} mit lokaler ID übersprungen (lokal gewinnt).`
          : ".";
      return `Mit lokalem Deck zusammengeführt. ${s.cardsAdded} neue Card${s.cardsAdded === 1 ? "" : "s"} hinzugefügt${skippedSuffix}`;
    }
  }
}
