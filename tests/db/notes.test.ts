// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { createNotebook } from "@/db/repo/notebooks";
import { createNote, deleteNote, listNotes, updateNote } from "@/db/repo/notes";
import { createTestDb } from "../helpers/db";

const OWNER = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER = "bbbbbbbb-0000-4000-8000-000000000002";

describe("Notiz-Repository", () => {
  it("unterstützt CRUD und schützt jeden Zugriff mit dem Besucher-Scope", async () => {
    const db = (await createTestDb()) as unknown as Db;
    const notebook = await createNotebook(db, OWNER, "Notizen");

    const created = await createNote(db, notebook.id, OWNER, {
      title: "These",
      content: "Eine eigene Erkenntnis.",
    });
    expect(created?.title).toBe("These");
    expect(await listNotes(db, notebook.id, OTHER)).toEqual([]);
    expect(await updateNote(db, notebook.id, created!.id, OTHER, {
      title: "Fremd",
      content: "Nein",
    })).toBeNull();

    const updated = await updateNote(db, notebook.id, created!.id, OWNER, {
      title: "Neue These",
      content: "Präzisiert.",
    });
    expect(updated?.content).toBe("Präzisiert.");
    expect(await listNotes(db, notebook.id, OWNER)).toHaveLength(1);

    expect(await deleteNote(db, notebook.id, created!.id, OTHER)).toBeNull();
    expect(await deleteNote(db, notebook.id, created!.id, OWNER)).not.toBeNull();
    expect(await listNotes(db, notebook.id, OWNER)).toEqual([]);
  });
});
