import { MarkdownView } from "@/components/markdown-view";
import { Button } from "@/components/ui/button";
import { CardSizeError } from "@/domain/card";
import { TagChipsInput } from "@/features/card/tag-chips-input";
import type { TagFrequency } from "@/features/card/use-global-tags";
import { compressImage } from "@/lib/image/compress";
import {
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

const AUTOSAVE_DEBOUNCE_MS = 5000;
const SAVED_INDICATOR_MS = 2000;
const COMPRESSION_INDICATOR_MS = 5000;

export interface CardEditorValues {
  front: string;
  back: string;
  tags: string[];
}

export interface CardEditorProps {
  mode: "create" | "edit";
  initial: CardEditorValues;
  /** Persist callback. Throws CardSizeError if the payload exceeds 5 MB. */
  onSave: (values: CardEditorValues) => Promise<void>;
  onCancel: () => void;
  /** Edit-mode only: revert to `initial` after user confirms. */
  onDiscard?: () => void;
  suggestions: TagFrequency[];
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function CardEditor({
  mode,
  initial,
  onSave,
  onCancel,
  onDiscard,
  suggestions,
}: CardEditorProps) {
  const [front, setFront] = useState(initial.front);
  const [back, setBack] = useState(initial.back);
  const [tags, setTags] = useState(initial.tags);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [compressionInfo, setCompressionInfo] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const frontRef = useRef<HTMLTextAreaElement | null>(null);
  const backRef = useRef<HTMLTextAreaElement | null>(null);
  const lastFocusedRef = useRef<"front" | "back">("front");
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const compressionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const frontId = useId();
  const backId = useId();
  const tagsId = useId();

  // Track which textarea was most recently focused, so paste/DnD/file-picker
  // know where to insert. Falls back to "front" on mount.
  const focus = (target: "front" | "back") => {
    lastFocusedRef.current = target;
  };

  const dirty = useMemo(
    () => front !== initial.front || back !== initial.back || !sameTags(tags, initial.tags),
    [front, back, tags, initial],
  );

  const canSave = mode === "edit" || front.trim().length > 0;

  const persist = useCallback(
    async (values: CardEditorValues, source: "manual" | "autosave") => {
      setSaveState({ kind: "saving" });
      try {
        await onSave(values);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        setSaveState({ kind: "saved" });
        if (source === "autosave") {
          savedTimerRef.current = setTimeout(
            () => setSaveState({ kind: "idle" }),
            SAVED_INDICATOR_MS,
          );
        }
      } catch (err) {
        const message =
          err instanceof CardSizeError
            ? "Diese Card überschreitet das Limit von 5 MB. Reduziere die Anzahl/Größe der Bilder oder splitte den Inhalt auf mehrere Cards."
            : err instanceof Error
              ? err.message
              : "Speichern fehlgeschlagen";
        setSaveState({ kind: "error", message });
      }
    },
    [onSave],
  );

  // Debounced auto-save (edit mode only).
  useEffect(() => {
    if (mode !== "edit") return;
    if (!dirty) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void persist({ front, back, tags }, "autosave");
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [mode, dirty, front, back, tags, persist]);

  // Blur-triggered auto-save in edit mode.
  const handleFieldBlur = () => {
    if (mode !== "edit") return;
    if (!dirty) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    void persist({ front, back, tags }, "autosave");
  };

  useEffect(() => {
    return () => {
      if (compressionTimerRef.current) clearTimeout(compressionTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  const insertImageAtCursor = async (file: Blob, alt = "Bild") => {
    try {
      const result = await compressImage(file);
      const target = lastFocusedRef.current;
      const ref = target === "front" ? frontRef.current : backRef.current;
      const setter = target === "front" ? setFront : setBack;
      const current = target === "front" ? front : back;
      const insertion = `![${alt}](${result.dataUrl})`;
      const next = spliceAtCursor(ref, current, insertion);
      setter(next);

      if (compressionTimerRef.current) clearTimeout(compressionTimerRef.current);
      setCompressionInfo(
        `Bild komprimiert: ${formatBytes(result.originalSize)} → ${formatBytes(result.compressedSize)}`,
      );
      compressionTimerRef.current = setTimeout(
        () => setCompressionInfo(null),
        COMPRESSION_INDICATOR_MS,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Bild konnte nicht verarbeitet werden";
      setSaveState({ kind: "error", message });
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith("image/"));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    void insertImageAtCursor(file);
  };

  const handleDrop = (e: DragEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    e.preventDefault();
    for (const file of files) void insertImageAtCursor(file, file.name);
  };

  const handleFilePick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) void insertImageAtCursor(file, file.name);
    e.target.value = "";
  };

  const handleTextareaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void manualSave();
    }
  };

  const manualSave = async () => {
    if (!canSave) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    await persist({ front, back, tags }, "manual");
  };

  const handleDiscardClick = () => {
    if (!onDiscard) return;
    if (!dirty) {
      onDiscard();
      return;
    }
    setConfirmDiscard(true);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
        <TabButton active={view === "edit"} onClick={() => setView("edit")}>
          Bearbeiten
        </TabButton>
        <TabButton active={view === "preview"} onClick={() => setView("preview")}>
          Vorschau
        </TabButton>
      </div>

      {view === "edit" ? (
        <div className="space-y-6">
          <FieldBlock
            id={frontId}
            label="Vorderseite"
            value={front}
            onChange={setFront}
            onFocus={() => focus("front")}
            onBlur={handleFieldBlur}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onKeyDown={handleTextareaKeyDown}
            textareaRef={frontRef}
            onPickImage={handleFilePick}
            required={mode === "create"}
          />
          <FieldBlock
            id={backId}
            label="Rückseite"
            value={back}
            onChange={setBack}
            onFocus={() => focus("back")}
            onBlur={handleFieldBlur}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onKeyDown={handleTextareaKeyDown}
            textareaRef={backRef}
            onPickImage={handleFilePick}
          />

          <div className="space-y-1">
            <label htmlFor={tagsId} className="block text-sm font-medium">
              Tags
            </label>
            <TagChipsInput id={tagsId} tags={tags} onChange={setTags} suggestions={suggestions} />
          </div>

          <details
            className="text-sm"
            open={helpOpen}
            onToggle={(e) => setHelpOpen((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer underline underline-offset-4">
              Markdown-Hilfe
            </summary>
            <MarkdownHelpContent />
          </details>
        </div>
      ) : (
        <PreviewPanel front={front} back={back} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="min-h-[1.5rem] text-slate-600 dark:text-slate-400">
          {compressionInfo}
          {!compressionInfo && saveState.kind === "saving" ? "Speichere…" : null}
          {!compressionInfo && saveState.kind === "saved" ? "Gespeichert ✓" : null}
        </div>
      </div>

      {saveState.kind === "error" ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {saveState.message}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {mode === "edit" && onDiscard ? (
          <Button type="button" variant="outline" onClick={handleDiscardClick}>
            Verwerfen
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onCancel}>
          {mode === "create" ? "Abbrechen" : "Zurück"}
        </Button>
        {mode === "create" ? (
          <Button
            type="button"
            disabled={!canSave || saveState.kind === "saving"}
            onClick={manualSave}
          >
            Speichern
          </Button>
        ) : null}
      </div>

      {confirmDiscard && onDiscard ? (
        <ConfirmDialog
          title="Änderungen verwerfen?"
          body="Alle ungespeicherten Änderungen gehen verloren."
          confirmLabel="Verwerfen"
          onConfirm={() => {
            setConfirmDiscard(false);
            onDiscard();
          }}
          onCancel={() => setConfirmDiscard(false)}
        />
      ) : null}
    </section>
  );
}

function sameTags(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function spliceAtCursor(
  textarea: HTMLTextAreaElement | null,
  current: string,
  insertion: string,
): string {
  if (!textarea)
    return current + (current.endsWith("\n") || current.length === 0 ? "" : "\n") + insertion;
  const start = textarea.selectionStart ?? current.length;
  const end = textarea.selectionEnd ?? current.length;
  const before = current.slice(0, start);
  const after = current.slice(end);
  return before + insertion + after;
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[44px] px-4 py-2 text-sm font-medium border-b-2 ${
        active
          ? "border-slate-900 text-slate-900 dark:border-slate-50 dark:text-slate-50"
          : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
      }`}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function FieldBlock({
  id,
  label,
  value,
  onChange,
  onFocus,
  onBlur,
  onPaste,
  onDrop,
  onKeyDown,
  textareaRef,
  onPickImage,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  onDrop: (e: DragEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onPickImage: (e: ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
}) {
  const fileInputId = `${id}-file`;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </label>
      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onKeyDown={onKeyDown}
        rows={6}
        className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900"
        spellCheck
      />
      <div>
        <label
          htmlFor={fileInputId}
          className="inline-flex min-h-[44px] cursor-pointer items-center rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Bild einfügen
        </label>
        <input
          id={fileInputId}
          type="file"
          accept="image/*"
          multiple
          onChange={onPickImage}
          className="sr-only"
        />
      </div>
    </div>
  );
}

function PreviewPanel({ front, back }: { front: string; back: string }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-slate-500">Vorderseite</h3>
        <MarkdownView source={front || "_(leer)_"} />
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-slate-500">Rückseite</h3>
        <MarkdownView source={back || "_(leer)_"} />
      </div>
    </div>
  );
}

function MarkdownHelpContent() {
  return (
    <div className="mt-2 space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs dark:border-slate-800 dark:bg-slate-900">
      <p># Überschrift</p>
      <p>**fett** *kursiv*</p>
      <p>- Listenpunkt</p>
      <p>1. Aufzählung</p>
      <p>[Link](https://example.com)</p>
      <p>![Alt-Text](data:…) oder eingefügtes Bild</p>
      <p>`code` und ```Code-Block```</p>
    </div>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialogShell title={title} onCancel={onCancel}>
      <p className="text-sm text-slate-600 dark:text-slate-300">{body}</p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button type="button" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </ConfirmDialogShell>
  );
}

function ConfirmDialogShell({
  title,
  onCancel,
  children,
}: {
  title: string;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!el.open) el.showModal();
    return () => {
      if (el.open) el.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      className="w-full max-w-sm space-y-3 rounded-md bg-white p-4 shadow-lg backdrop:bg-black/40 dark:bg-slate-900"
    >
      <h2 className="text-base font-medium">{title}</h2>
      {children}
    </dialog>
  );
}
