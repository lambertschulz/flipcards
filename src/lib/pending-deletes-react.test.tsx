// Regression tests for the visibility-filtered Dexie hooks introduced in
// the round-3 sharpened brief for issue #8 / PR #41.
//
// Each hook gets a dedicated test that (a) seeds Dexie with a row,
// (b) enqueues a pending-delete op via the live coordinator, and
// (c) renders a tiny harness component using the hook and asserts the
// row is hidden during the `pending` window.

import "fake-indexeddb/auto";
import { createCardInDb } from "@/db/cards";
import { db } from "@/db/database";
import { createDeckSetInDb } from "@/db/deck-sets";
import { createDeckInDb } from "@/db/decks";
import { __resetPendingDeletesForTests, getPendingDeletes } from "@/lib/pending-deletes";
import {
  useVisibleCard,
  useVisibleCards,
  useVisibleDeck,
  useVisibleDeckSet,
  useVisibleDeckSets,
  useVisibleDecks,
} from "@/lib/pending-deletes-react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

beforeEach(async () => {
  await db.open();
  __resetPendingDeletesForTests();
});
afterEach(async () => {
  await db.cards.clear();
  await db.decks.clear();
  await db.deckSets.clear();
  __resetPendingDeletesForTests();
});

function DeckHarness({ id }: { id: string }) {
  const deck = useVisibleDeck(id);
  if (deck === null) return <p>loading</p>;
  if (deck === undefined) return <p>not-found</p>;
  return <p>deck:{deck.name}</p>;
}

function DeckSetHarness({ id }: { id: string }) {
  const set = useVisibleDeckSet(id);
  if (set === null) return <p>loading</p>;
  if (set === undefined) return <p>not-found</p>;
  return <p>set:{set.name}</p>;
}

function CardHarness({ id }: { id: string }) {
  const card = useVisibleCard(id);
  if (card === null) return <p>loading</p>;
  if (card === undefined) return <p>not-found</p>;
  return <p>card:{card.front}</p>;
}

function DecksHarness() {
  const decks = useVisibleDecks(() => db.decks.orderBy("name").toArray(), [], []);
  return (
    <ul>
      {decks.map((d) => (
        <li key={d.id}>deck:{d.name}</li>
      ))}
    </ul>
  );
}

function DeckSetsHarness() {
  const sets = useVisibleDeckSets(() => db.deckSets.orderBy("name").toArray(), [], []);
  return (
    <ul>
      {sets.map((s) => (
        <li key={s.id}>set:{s.name}</li>
      ))}
    </ul>
  );
}

function CardsHarness({ deckId }: { deckId: string }) {
  const cards = useVisibleCards(
    () => db.cards.where("deckId").equals(deckId).toArray(),
    [deckId],
    [],
  );
  return (
    <ul>
      {cards.map((c) => (
        <li key={c.id}>card:{c.front}</li>
      ))}
    </ul>
  );
}

describe("useVisibleDeck", () => {
  it("hides the deck row while its pending-delete op is in the undo window", async () => {
    const deck = await createDeckInDb({ name: "Sichtbar" });
    render(<DeckHarness id={deck.id} />);
    await screen.findByText("deck:Sichtbar");

    getPendingDeletes().enqueue({
      key: `deck:${deck.id}`,
      label: "Deck gelöscht",
      commit: async () => {},
      restore: async () => {},
    });

    await waitFor(() => expect(screen.getByText("not-found")).toBeInTheDocument());
  });
});

describe("useVisibleDeckSet", () => {
  it("hides the deck-set row while its pending-delete op is in the undo window", async () => {
    const set = await createDeckSetInDb({ name: "Set-Sichtbar" });
    render(<DeckSetHarness id={set.id} />);
    await screen.findByText("set:Set-Sichtbar");

    getPendingDeletes().enqueue({
      key: `deck-set:${set.id}`,
      label: "Deck-Set gelöscht",
      commit: async () => {},
      restore: async () => {},
    });

    await waitFor(() => expect(screen.getByText("not-found")).toBeInTheDocument());
  });
});

describe("useVisibleCard", () => {
  it("hides the card row when its own card:<id> op is pending", async () => {
    const deck = await createDeckInDb({ name: "D" });
    const card = await createCardInDb({ deckId: deck.id, front: "Front", back: "Back" });
    render(<CardHarness id={card.id} />);
    await screen.findByText("card:Front");

    getPendingDeletes().enqueue({
      key: `card:${card.id}`,
      label: "Card gelöscht",
      commit: async () => {},
      restore: async () => {},
    });

    await waitFor(() => expect(screen.getByText("not-found")).toBeInTheDocument());
  });

  it("hides the card row when its parent deck is pending-deleted (cascade defence-in-depth)", async () => {
    const deck = await createDeckInDb({ name: "D" });
    const card = await createCardInDb({ deckId: deck.id, front: "FrontX", back: "BackX" });
    render(<CardHarness id={card.id} />);
    await screen.findByText("card:FrontX");

    // Deliberately enqueue with NO cascadeKeys — the hook's own
    // deck-pending guard should still hide the child card.
    getPendingDeletes().enqueue({
      key: `deck:${deck.id}`,
      label: "Deck gelöscht",
      commit: async () => {},
      restore: async () => {},
    });

    await waitFor(() => expect(screen.getByText("not-found")).toBeInTheDocument());
  });
});

describe("useVisibleDecks", () => {
  it("filters pending-deleted decks out of the list reactively", async () => {
    const d1 = await createDeckInDb({ name: "Eins" });
    await createDeckInDb({ name: "Zwei" });
    render(<DecksHarness />);
    await screen.findByText("deck:Eins");
    await screen.findByText("deck:Zwei");

    getPendingDeletes().enqueue({
      key: `deck:${d1.id}`,
      label: "Deck gelöscht",
      commit: async () => {},
      restore: async () => {},
    });

    await waitFor(() => {
      expect(screen.queryByText("deck:Eins")).toBeNull();
    });
    expect(screen.getByText("deck:Zwei")).toBeInTheDocument();
  });
});

describe("useVisibleDeckSets", () => {
  it("filters pending-deleted deck-sets out of the list reactively", async () => {
    const s1 = await createDeckSetInDb({ name: "A" });
    await createDeckSetInDb({ name: "B" });
    render(<DeckSetsHarness />);
    await screen.findByText("set:A");
    await screen.findByText("set:B");

    getPendingDeletes().enqueue({
      key: `deck-set:${s1.id}`,
      label: "Deck-Set gelöscht",
      commit: async () => {},
      restore: async () => {},
    });

    await waitFor(() => {
      expect(screen.queryByText("set:A")).toBeNull();
    });
    expect(screen.getByText("set:B")).toBeInTheDocument();
  });
});

describe("useVisibleCards", () => {
  it("filters cards whose card:<id> is pending and cards whose parent deck:<id> is pending", async () => {
    const deck = await createDeckInDb({ name: "D" });
    await createCardInDb({ deckId: deck.id, front: "Visible", back: "B" });
    const doomed = await createCardInDb({ deckId: deck.id, front: "DirectGone", back: "B" });
    render(<CardsHarness deckId={deck.id} />);
    await screen.findByText("card:Visible");
    await screen.findByText("card:DirectGone");

    getPendingDeletes().enqueue({
      key: `card:${doomed.id}`,
      label: "Card gelöscht",
      commit: async () => {},
      restore: async () => {},
    });

    await waitFor(() => {
      expect(screen.queryByText("card:DirectGone")).toBeNull();
    });
    expect(screen.getByText("card:Visible")).toBeInTheDocument();

    // Now enqueue a deck-pending op without cascade keys — the hook's
    // defence-in-depth filters every child by its parent's `deck:<id>`.
    getPendingDeletes().enqueue({
      key: `deck:${deck.id}`,
      label: "Deck gelöscht",
      commit: async () => {},
      restore: async () => {},
    });

    await waitFor(() => {
      expect(screen.queryByText("card:Visible")).toBeNull();
    });
  });
});
