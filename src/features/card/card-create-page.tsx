import { createCardInDb } from "@/db/cards";
import { CardEditor } from "@/features/card/card-editor";
import { useGlobalTags } from "@/features/card/use-global-tags";
import { Link, useNavigate } from "@tanstack/react-router";

export function CardCreatePage({ deckId }: { deckId: string }) {
  const navigate = useNavigate();
  const suggestions = useGlobalTags();

  const back = () => navigate({ to: "/deck/$deckId", params: { deckId } });

  return (
    <section className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Neue Card</h2>
        <Link
          to="/deck/$deckId"
          params={{ deckId }}
          className="text-sm underline underline-offset-4"
        >
          Zurück zum Deck
        </Link>
      </div>
      <CardEditor
        mode="create"
        initial={{ front: "", back: "", tags: [] }}
        suggestions={suggestions}
        onCancel={back}
        onSave={async (values) => {
          await createCardInDb({ deckId, ...values });
          await back();
        }}
      />
    </section>
  );
}
