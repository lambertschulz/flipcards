import { Button } from "@/components/ui/button";
import { useEffect, useRef } from "react";

/**
 * Reusable confirmation modal for destructive actions (Deck / Deck-Set
 * delete). The text is owned by the caller — this component just enforces
 * a consistent dialog shape (title, body, primary destructive action,
 * cancel).
 *
 * Used by:
 *   - Deck delete (modal body: card count cascade — ADR-0014)
 *   - Deck-Set delete (modal body: "decks fall out" message)
 *
 * Card delete deliberately does NOT use this modal (toast-only per ADR-0014).
 */
export function ConfirmDeleteModal({
  open,
  title,
  body,
  confirmLabel = "Endgültig löschen",
  cancelLabel = "Abbrechen",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault();
    onCancel();
  };

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleCancel}
      aria-label={title}
      className="w-full max-w-md rounded-md bg-white p-0 shadow-lg backdrop:bg-black/40 dark:bg-slate-900"
    >
      <div className="flex flex-col">
        <header className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="text-base font-medium">{title}</h2>
        </header>
        <div className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{body}</div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </footer>
      </div>
    </dialog>
  );
}
