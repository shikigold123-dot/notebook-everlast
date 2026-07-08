// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../helpers/db";
import type { Db } from "@/db";
import { createNotebook } from "@/db/repo/notebooks";
import { createChatMessage, listChatMessages } from "@/db/repo/chat";

const VISITOR = "aaaaaaaa-0000-4000-8000-000000000001";

let db: Db;
let notebookId: string;

beforeEach(async () => {
  db = (await createTestDb()) as unknown as Db;
  const nb = await createNotebook(db, VISITOR, "Chat");
  notebookId = nb.id;
});

describe("Chat-Repository", () => {
  it("speichert und listet Nachrichten in Reihenfolge", async () => {
    await createChatMessage(db, notebookId, "user", "Was steht drin?");
    await createChatMessage(db, notebookId, "assistant", "Antwort [S-01]", [
      {
        sourceId: "s-1",
        label: "S-01",
        title: "Quelle",
        marker: "[S-01#0-6]",
        start: 0,
        end: 6,
        citedText: "Quelle",
      },
    ]);

    const rows = await listChatMessages(db, notebookId);
    expect(rows.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(rows[1].citations).toEqual([
      {
        sourceId: "s-1",
        label: "S-01",
        title: "Quelle",
        marker: "[S-01#0-6]",
        start: 0,
        end: 6,
        citedText: "Quelle",
      },
    ]);
  });

  it("liefert keine Nachrichten aus anderen Dossiers", async () => {
    const other = await createNotebook(
      db,
      "bbbbbbbb-0000-4000-8000-000000000002",
      "Anderes"
    );
    await createChatMessage(db, notebookId, "user", "A");
    await createChatMessage(db, other.id, "user", "B");

    const rows = await listChatMessages(db, notebookId);
    expect(rows.map((row) => row.content)).toEqual(["A"]);
  });

  it("filtert optional nach Besucherzugriff", async () => {
    await createChatMessage(db, notebookId, "user", "A");

    expect(await listChatMessages(db, notebookId, VISITOR)).toHaveLength(1);
    expect(
      await listChatMessages(
        db,
        notebookId,
        "bbbbbbbb-0000-4000-8000-000000000002"
      )
    ).toEqual([]);
  });
});
