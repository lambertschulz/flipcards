import { Button } from "@/components/ui/button";
import { listAllDueCards } from "@/db/review-states";
import type { Card } from "@/domain/card";
import { dueCardsForTagAnd, listTagsWithDueCounts } from "@/domain/tags";
import { cn } from "@/lib/cn";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

const SEARCH_THRESHOLD = 15;

/**
 * Tag-Session-Picker (issue #7).
 *
 * Loads all Due Cards once on mount, then runs the aggregation client-side:
 * the chip-list, the live AND-filtered counts, and the "start session"
 * affordance are all driven from that single in-memory snapshot. The next
 * deck-übergreifend mutation won't be reflected until the user returns to
 * the picker — which matches expectations for a session-entry screen
 * (you wouldn't want chips reshuffling while you're trying to pick).
 *
 * AND-semantics: counts shown on each non-selected chip equal the number
 * of due cards that carry *that* tag *and* all currently selected tags.
 * A chip whose AND-intersection is 0 is greyed-out and not selectable
 * — that's the implicit affordance for "this combination is empty".
 */
export function TagPickerPage() {
  const navigate = useNavigate();
  const [allDue, setAllDue] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const due = await listAllDueCards(Date.now());
        if (!cancelled) setAllDue(due);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Universe of tag-baseline-counts: how many due cards carry each tag,
  // independent of the current selection. Drives the chip ordering and is
  // also the source-of-truth for "does this tag exist at all?".
  const baseline = useMemo(() => {
    if (allDue === null) return [];
    return listTagsWithDueCounts(allDue);
  }, [allDue]);

  // AND-filtered counts: for each baseline tag, how many cards would the
  // session contain if the user toggled that tag *into* the selection.
  // Tags already in the selection get their current intersection-count
  // (equivalently: AND of the same set with itself).
  const liveCounts = useMemo(() => {
    if (allDue === null) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const { tag } of baseline) {
      const probe = selected.has(tag) ? Array.from(selected) : [...Array.from(selected), tag];
      map.set(tag, dueCardsForTagAnd(allDue, probe).length);
    }
    return map;
  }, [allDue, baseline, selected]);

  const filteredChips = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return baseline;
    return baseline.filter((t) => t.tag.toLowerCase().includes(needle));
  }, [baseline, search]);

  const selectedCount = useMemo(() => {
    if (allDue === null) return 0;
    if (selected.size === 0) return 0;
    return dueCardsForTagAnd(allDue, Array.from(selected)).length;
  }, [allDue, selected]);

  const toggle = (tag: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const startSession = () => {
    if (selected.size === 0 || selectedCount === 0) return;
    navigate({
      to: "/tag-session/review",
      search: { tags: Array.from(selected).join(",") },
    });
  };

  if (error) {
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Nach Tag lernen</h2>
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700"
        >
          {error}
        </p>
      </section>
    );
  }

  if (allDue === null) {
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Nach Tag lernen</h2>
        <p className="text-sm text-slate-500">Lade Tags…</p>
      </section>
    );
  }

  if (baseline.length === 0) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Nach Tag lernen</h2>
          <Link to="/" className="text-sm underline">
            Zurück
          </Link>
        </div>
        <output className="block rounded-md border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
          <p className="mb-3 text-slate-600 dark:text-slate-400">
            Du hast noch keine Tags vergeben. Tags weisen Cards thematisch zu — füge sie im
            Card-Editor hinzu.
          </p>
          <Link to="/" className="text-sm underline">
            Zur Deck-Liste
          </Link>
        </output>
      </section>
    );
  }

  const showSearch = baseline.length > SEARCH_THRESHOLD;
  const startDisabled = selected.size === 0 || selectedCount === 0;

  return (
    // pb-24 leaves room for the sticky footer; the page itself scrolls.
    <section className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Nach Tag lernen</h2>
        <Link to="/" className="text-sm underline">
          Zurück
        </Link>
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-400">
        Wähle einen oder mehrere Tags. Mehrere Tags = nur Cards, die <em>alle</em> Tags tragen.
      </p>

      {showSearch ? (
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tags suchen…"
          aria-label="Tags suchen"
          className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        />
      ) : null}

      <ul className="flex flex-wrap gap-2">
        {filteredChips.map(({ tag }) => {
          const liveCount = liveCounts.get(tag) ?? 0;
          const isSelected = selected.has(tag);
          // A tag is disabled when toggling it on would yield an empty
          // session. Already-selected tags are never disabled — they can
          // always be toggled off again.
          const disabled = !isSelected && liveCount === 0;
          return (
            <li key={tag}>
              <button
                type="button"
                onClick={() => toggle(tag)}
                disabled={disabled}
                aria-pressed={isSelected}
                className={cn(
                  "inline-flex min-h-[44px] items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors",
                  isSelected
                    ? "border-slate-900 bg-slate-900 text-slate-50 dark:border-slate-50 dark:bg-slate-50 dark:text-slate-900"
                    : disabled
                      ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600"
                      : "border-slate-300 bg-white hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-800",
                )}
              >
                <span>{tag}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs",
                    isSelected
                      ? "bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-50"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                  )}
                >
                  {liveCount}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {filteredChips.length === 0 ? (
        <p className="text-sm text-slate-500">Keine Tags entsprechen „{search}".</p>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 p-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex max-w-xl items-center justify-end">
          <Button size="lg" onClick={startSession} disabled={startDisabled}>
            Session starten · {selectedCount} {selectedCount === 1 ? "Karte" : "Karten"}
          </Button>
        </div>
      </div>
    </section>
  );
}
