import "fake-indexeddb/auto";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCardInDb } from "@/db/cards";
import { db } from "@/db/database";
import { createDeckInDb } from "@/db/decks";
import { stringifyBackup } from "@/domain/backup";
import { BackupImportPage } from "@/features/backup/backup-import-page";
import { collectBackup } from "@/features/backup/collect";

async function setupRouter() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const importRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/backup/import",
    component: BackupImportPage,
  });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div>Home</div>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([importRoute, homeRoute]),
    history: createMemoryHistory({ initialEntries: ["/backup/import"] }),
  });
  await router.load();
  return router;
}

function makeFile(name: string, contents: string): File {
  return new File([contents], name, { type: "application/json" });
}

describe("BackupImportPage", () => {
  beforeEach(async () => {
    await db.open();
  });

  afterEach(async () => {
    await db.delete();
  });

  it("renders an error when the picked file is missing `formatVersion`", async () => {
    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    const input = (await screen.findByTestId("backup-file-input")) as HTMLInputElement;
    const bad = makeFile("nope.json", JSON.stringify({ format: "flipcards.backup" }));

    await act(async () => {
      fireEvent.change(input, { target: { files: [bad] } });
    });

    const alert = await screen.findByTestId("backup-import-error");
    expect(alert.textContent).toMatch(/formatVersion/);
  });

  it("renders an error when the JSON is malformed", async () => {
    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    const input = (await screen.findByTestId("backup-file-input")) as HTMLInputElement;
    const bad = makeFile("broken.json", "{ definitely not json");

    await act(async () => {
      fireEvent.change(input, { target: { files: [bad] } });
    });

    const alert = await screen.findByTestId("backup-import-error");
    expect(alert.textContent).toMatch(/JSON/);
  });

  it("shows a destructive confirmation, then applies the backup and surfaces a summary", async () => {
    // Build the backup file from a known DB state (one deck, one card), then
    // wipe the test DB and reseed it with *different* content. The import
    // flow should clean-slate-replace that pre-state with the file's
    // contents — proving ADR-0011's restore semantics.
    const sourceDeck = await createDeckInDb({ name: "Imported deck" });
    await createCardInDb({ deckId: sourceDeck.id, front: "f", back: "b" });
    const snapshot = await collectBackup();
    const json = stringifyBackup(snapshot);

    await db.decks.clear();
    await db.cards.clear();
    await createDeckInDb({ name: "Pre-existing" });

    const router = await setupRouter();
    render(<RouterProvider router={router} />);

    const input = (await screen.findByTestId("backup-file-input")) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile("ok.json", json)] } });
    });

    // Destructive confirmation must appear before any write.
    const dialog = await screen.findByTestId("backup-confirm-dialog");
    expect(dialog.textContent).toMatch(/ersetzt/);

    // Decks survive in the DB until we confirm — the dialog is the gate.
    expect(await db.decks.count()).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Endgültig ersetzen/ }));
    });

    await waitFor(async () => {
      expect(await screen.findByTestId("backup-import-success")).toBeInTheDocument();
    });

    // Post-condition: the live DB matches the imported snapshot — original
    // "Pre-existing" deck must be gone (clean-slate replace, ADR-0011) and
    // only "Imported deck" remains.
    const remainingDecks = await db.decks.toArray();
    expect(remainingDecks.map((d) => d.name)).toEqual(["Imported deck"]);
  });
});
