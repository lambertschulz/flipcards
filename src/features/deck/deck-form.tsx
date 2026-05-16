import { Button } from "@/components/ui/button";
import { isValidDeckName } from "@/domain/deck";
import type { DeckSet } from "@/domain/deck-set";
import { type FormEvent, useEffect, useRef, useState } from "react";

function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}

export type DeckFormValues = {
  name: string;
  description: string;
  deckSetId: string | null;
};

export type DeckFormProps = {
  initial?: DeckFormValues;
  deckSets: DeckSet[];
  submitLabel: string;
  onSubmit: (values: DeckFormValues) => void | Promise<void>;
  onCancel?: () => void;
  busy?: boolean;
};

const NO_SET = "__none__";

export function DeckForm({
  initial,
  deckSets,
  submitLabel,
  onSubmit,
  onCancel,
  busy,
}: DeckFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [deckSetId, setDeckSetId] = useState<string | null>(initial?.deckSetId ?? null);
  const nameInputRef = useFocusOnMount<HTMLInputElement>();

  const canSubmit = isValidDeckName(name) && !busy;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    void onSubmit({ name, description, deckSetId });
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div className="space-y-1">
        <label htmlFor="deck-name" className="block text-sm font-medium">
          Name <span className="text-red-600">*</span>
        </label>
        <input
          ref={nameInputRef}
          id="deck-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="block w-full min-h-[44px] rounded-md border border-slate-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900"
          required
          aria-required="true"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="deck-description" className="block text-sm font-medium">
          Beschreibung
        </label>
        <textarea
          id="deck-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="block w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="deck-set" className="block text-sm font-medium">
          Deck-Set
        </label>
        <select
          id="deck-set"
          value={deckSetId ?? NO_SET}
          onChange={(e) => setDeckSetId(e.target.value === NO_SET ? null : e.target.value)}
          className="block w-full min-h-[44px] rounded-md border border-slate-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-900"
        >
          <option value={NO_SET}>kein Set</option>
          {deckSets.map((set) => (
            <option key={set.id} value={set.id}>
              {set.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Abbrechen
          </Button>
        ) : null}
        <Button type="submit" disabled={!canSubmit}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
