// Backup-Import page (route: /backup/import).
//
// Three-step flow, matching ADR-0011 (Backup-Restore = Clean-Slate-Replace):
//   1. File picker — user selects a `.json`.
//   2. Parse + validate (`parseBackup`). On error, show
//      `describeBackupError(...)` inline and let the user pick again.
//   3. Destructive confirmation dialog — single button. On confirm,
//      `applyBackup(...)` wipes the DB and writes the snapshot. On
//      success, show a summary and navigate home.
//
// Per ADR-0011 there is **no** skip/replace/duplicate per-entity prompt for
// Backup-Restore — that surface is reserved for Shared-Deck-Import. Backup
// is semantically a target state, not a delta. The ticket text mentions
// skip/replace/duplicate but explicitly invokes ADR-0011 as authoritative;
// the ADR wins. (Per-entity resolution UI remains future work for the
// Shared-Deck-Import ticket.)

import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { type BackupError, type BackupFileV1, parseBackup } from "@/domain/backup";

import { type ApplySummary, applyBackup } from "./apply";
import { describeBackupError } from "./error-messages";
import { readFileAsText } from "./read-file";

type State =
  | { kind: "idle" }
  | { kind: "parsing"; fileName: string }
  | { kind: "error"; fileName: string; error: BackupError }
  | { kind: "confirm"; fileName: string; file: BackupFileV1 }
  | { kind: "applying"; fileName: string }
  | { kind: "done"; summary: ApplySummary };

export function BackupImportPage() {
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
    const result = parseBackup(text);
    if (!result.ok) {
      setState({ kind: "error", fileName: file.name, error: result.error });
      return;
    }
    setState({ kind: "confirm", fileName: file.name, file: result.value });
  };

  const handleConfirm = async () => {
    if (state.kind !== "confirm") return;
    setState({ kind: "applying", fileName: state.fileName });
    const summary = await applyBackup(state.file);
    setState({ kind: "done", summary });
  };

  return (
    <section className="mx-auto max-w-xl space-y-6">
      <header className="space-y-1">
        <h2 className="text-lg font-medium">Backup importieren</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Wähle eine zuvor exportierte Backup-Datei. Beim Import werden alle lokalen Daten ersetzt.
        </p>
      </header>

      {state.kind === "idle" || state.kind === "error" ? (
        <div className="space-y-3">
          <label className="block">
            <span className="block text-sm font-medium">Backup-Datei (.json)</span>
            <input
              ref={inputRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handlePicked(file);
              }}
              className="mt-1 block w-full text-sm"
              data-testid="backup-file-input"
            />
          </label>
          {state.kind === "error" ? (
            <div
              role="alert"
              data-testid="backup-import-error"
              className="whitespace-pre-line rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
            >
              <p className="font-medium">Import nicht möglich</p>
              <p className="mt-1 text-xs text-red-700 dark:text-red-200">{state.fileName}</p>
              <p className="mt-2">{describeBackupError(state.error)}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {state.kind === "parsing" ? (
        <p className="text-sm text-slate-500">Datei wird geprüft…</p>
      ) : null}

      {state.kind === "confirm" ? (
        <ConfirmDialog
          file={state.file}
          fileName={state.fileName}
          onCancel={reset}
          onConfirm={() => void handleConfirm()}
        />
      ) : null}

      {state.kind === "applying" ? (
        <p className="text-sm text-slate-500">Backup wird wiederhergestellt…</p>
      ) : null}

      {state.kind === "done" ? (
        <SuccessPanel
          summary={state.summary}
          onContinue={() => {
            void navigate({ to: "/" });
          }}
        />
      ) : null}
    </section>
  );
}

function ConfirmDialog({
  file,
  fileName,
  onCancel,
  onConfirm,
}: {
  file: BackupFileV1;
  fileName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cardCount = file.decks.reduce((sum, d) => sum + d.cards.length, 0);
  return (
    <div
      role="alertdialog"
      aria-labelledby="backup-confirm-title"
      data-testid="backup-confirm-dialog"
      className="space-y-3 rounded-md border border-amber-400 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950"
    >
      <h3
        id="backup-confirm-title"
        className="text-base font-medium text-amber-900 dark:text-amber-100"
      >
        Alle aktuellen Daten ersetzen?
      </h3>
      <p className="text-sm text-amber-900 dark:text-amber-100">
        Alle aktuellen Decks, Cards und Lernfortschritte werden durch den Backup-Inhalt ersetzt.
        Diese Aktion lässt sich nicht rückgängig machen.
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-amber-900 dark:text-amber-100">
        <dt>Datei</dt>
        <dd className="truncate">{fileName}</dd>
        <dt>Erstellt am</dt>
        <dd>{file.exportedAt}</dd>
        <dt>App-Version (Backup)</dt>
        <dd>{file.appVersion}</dd>
        <dt>Decks / Cards</dt>
        <dd>
          {file.decks.length} / {cardCount}
        </dd>
      </dl>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button type="button" onClick={onConfirm}>
          Endgültig ersetzen
        </Button>
      </div>
    </div>
  );
}

function SuccessPanel({
  summary,
  onContinue,
}: {
  summary: ApplySummary;
  onContinue: () => void;
}) {
  return (
    <output
      data-testid="backup-import-success"
      className="block space-y-3 rounded-md border border-green-300 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950"
    >
      <p className="font-medium text-green-900 dark:text-green-100">Backup wiederhergestellt</p>
      <p className="text-sm text-green-900 dark:text-green-100">
        Imported: {summary.decks} Decks, {summary.cards} Cards
        {summary.deckSets > 0 ? `, ${summary.deckSets} Deck-Sets` : ""}
        {summary.reviewStates > 0 ? `, ${summary.reviewStates} Review-States` : ""}
        {summary.reviews > 0 ? `, ${summary.reviews} Review-Log-Einträge` : ""}.
      </p>
      <Button type="button" onClick={onContinue}>
        Zur Deck-Liste
      </Button>
    </output>
  );
}
