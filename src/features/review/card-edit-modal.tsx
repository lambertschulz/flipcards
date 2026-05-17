import { Button } from "@/components/ui/button";
import { updateCardInDb } from "@/db/cards";
import type { Card } from "@/domain/card";
import { CardEditor } from "@/features/card/card-editor";
import { useGlobalTags } from "@/features/card/use-global-tags";
import { useEffect, useRef, useState } from "react";

/**
 * Modal wrapper around the shared `CardEditor` component, used during a
 * Review-Session so the user can fix a typo without leaving the session
 * (see issue #6).
 *
 * Contract:
 * - Mounting the modal must NOT touch the session-queue or `Review-State`.
 *   We only read the supplied `card` and write the result via `onCardUpdated`.
 * - `onCardUpdated` lets the parent refresh the in-flight card's rendered
 *   front/back. The parent is responsible for not mutating queue position
 *   or answer history.
 * - Discard reverts to the snapshot taken at modal-open time (mirrors the
 *   stand-alone CardEditPage's behaviour).
 */
export function CardEditModal({
  card,
  onCardUpdated,
  onClose,
}: {
  card: Card;
  onCardUpdated: (next: Card) => void;
  onClose: () => void;
}) {
  const suggestions = useGlobalTags();
  // Snapshot at open-time so Discard can restore (the editor auto-saves,
  // so the live row may have drifted from the originally-loaded card).
  const [snapshot] = useState<Card>(card);
  const [editorKey, setEditorKey] = useState(0);

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (!el.open) el.showModal();
    return () => {
      if (el.open) el.close();
    };
  }, []);

  // Cancel-key (Esc) on a <dialog> fires `cancel`; route it through onClose
  // so the parent can clean up its own state.
  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault();
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleCancel}
      aria-label="Card bearbeiten"
      className="w-full max-w-xl rounded-md bg-white p-0 shadow-lg backdrop:bg-black/40 dark:bg-slate-900 sm:max-h-[90vh] sm:my-8"
    >
      <div className="flex max-h-[90vh] flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="text-base font-medium">Card bearbeiten</h2>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Schließen
          </Button>
        </header>
        <div className="overflow-y-auto p-4">
          <CardEditor
            key={editorKey}
            mode="edit"
            initial={{ front: card.front, back: card.back, tags: card.tags }}
            suggestions={suggestions}
            onCancel={onClose}
            onSave={async (values) => {
              const next = await updateCardInDb(card.id, values);
              onCardUpdated(next);
            }}
            onDiscard={async () => {
              const reverted = await updateCardInDb(card.id, {
                front: snapshot.front,
                back: snapshot.back,
                tags: snapshot.tags,
              });
              onCardUpdated(reverted);
              // Remount the editor so its internal state mirrors the revert.
              setEditorKey((k) => k + 1);
            }}
          />
        </div>
      </div>
    </dialog>
  );
}
