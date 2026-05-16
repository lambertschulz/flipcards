import { Button } from "@/components/ui/button";
import type { TagFrequency } from "@/features/card/use-global-tags";
import { useMemo, useRef, useState } from "react";

export interface TagChipsInputProps {
  tags: string[];
  onChange: (next: string[]) => void;
  suggestions: TagFrequency[];
  id?: string;
}

/**
 * Tag chips + free-text input with frequency-sorted autocomplete.
 *
 * Commit rules per the issue #5 brief:
 *   - Enter or comma commits the current input
 *   - Selecting a dropdown suggestion commits
 *   - Free text is allowed (creates a new tag ad-hoc)
 *   - Whitespace-only input is ignored
 *   - Duplicates are silently absorbed (the domain `normalizeTags` dedupes too,
 *     but we filter at the UI to avoid a flash of a duplicated chip).
 */
export function TagChipsInput({ tags, onChange, suggestions, id }: TagChipsInputProps) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const lower = draft.trim().toLowerCase();
    const existing = new Set(tags);
    return suggestions
      .filter((s) => !existing.has(s.tag))
      .filter((s) => (lower ? s.tag.toLowerCase().includes(lower) : true))
      .slice(0, 8);
  }, [draft, suggestions, tags]);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return;
    if (tags.includes(trimmed)) {
      setDraft("");
      return;
    }
    onChange([...tags, trimmed]);
    setDraft("");
  };

  const removeAt = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
      return;
    }
    if (e.key === "Backspace" && draft.length === 0 && tags.length > 0) {
      removeAt(tags.length - 1);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-300 px-2 py-2 focus-within:ring-2 focus-within:ring-slate-400 dark:border-slate-700">
        {tags.map((tag, index) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-sm dark:bg-slate-800"
          >
            <span>{tag}</span>
            <button
              type="button"
              aria-label={`Tag ${tag} entfernen`}
              onClick={() => removeAt(index)}
              className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Defer so that mousedown on a suggestion can register before close.
            setTimeout(() => setOpen(false), 100);
            commit(draft);
          }}
          placeholder={tags.length === 0 ? "Tags hinzufügen…" : ""}
          className="min-w-[8rem] flex-1 bg-transparent py-1 text-base outline-none"
        />
      </div>
      {open && filtered.length > 0 ? (
        <ul className="rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {filtered.map((s) => (
            <li key={s.tag}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(s.tag);
                  inputRef.current?.focus();
                }}
                className="flex w-full min-h-[44px] items-center justify-between px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span>{s.tag}</span>
                <span className="text-xs text-slate-500">{s.count}×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {/* Visible commit button for users who prefer tapping over keyboard. */}
      {draft.trim().length > 0 ? (
        <Button type="button" variant="outline" size="sm" onClick={() => commit(draft)}>
          „{draft.trim()}" als Tag übernehmen
        </Button>
      ) : null}
    </div>
  );
}
