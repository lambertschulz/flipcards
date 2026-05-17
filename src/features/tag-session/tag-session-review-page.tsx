import { listAllDueCards } from "@/db/review-states";
import { dueCardsForTagAnd } from "@/domain/tags";
import { ReviewSessionRunner } from "@/features/review/review-session-runner";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

export function TagSessionReviewPage({ tags }: { tags: string[] }) {
  const navigate = useNavigate();
  const backToPicker = useCallback(() => navigate({ to: "/tag-session" }), [navigate]);

  const tagSet = useMemo(() => Array.from(new Set(tags)).filter((t) => t.length > 0), [tags]);

  const loadDueCards = useCallback(async () => {
    if (tagSet.length === 0) return [];
    const due = await listAllDueCards(Date.now());
    return dueCardsForTagAnd(due, tagSet);
  }, [tagSet]);

  if (tagSet.length === 0) {
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-medium">Keine Tags ausgewählt</h2>
        <Link to="/tag-session" className="text-sm underline">
          Zurück zum Tag-Picker
        </Link>
      </section>
    );
  }

  const title = tagSet.join(" · ");

  return (
    <ReviewSessionRunner
      header={
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Lernen — {title}</h2>
          <Link to="/tag-session" className="text-sm underline">
            Zurück zum Tag-Picker
          </Link>
        </div>
      }
      loadDueCards={loadDueCards}
      onBack={backToPicker}
      emptyMessage="Keine Cards fällig für diese Tag-Auswahl."
    />
  );
}
