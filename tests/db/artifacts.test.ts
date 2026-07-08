// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../helpers/db";
import type { Db } from "@/db";
import { createNotebook } from "@/db/repo/notebooks";
import { createArtifact, listArtifacts } from "@/db/repo/artifacts";

const VISITOR = "aaaaaaaa-0000-4000-8000-000000000001";

let db: Db;
let notebookId: string;

beforeEach(async () => {
  db = (await createTestDb()) as unknown as Db;
  const nb = await createNotebook(db, VISITOR, "Studio");
  notebookId = nb.id;
});

describe("Artifact-Repository", () => {
  it("speichert und listet Artefakte in Reihenfolge", async () => {
    await createArtifact(db, notebookId, "faq", {
      items: [{ question: "Q", answer: "A" }],
    });
    await createArtifact(db, notebookId, "mindmap", {
      label: "Root",
      children: [],
    });

    const rows = await listArtifacts(db, notebookId);
    expect(rows.map((row) => row.type)).toEqual(["faq", "mindmap"]);
    expect(rows[0].status).toBe("ready");
  });

  it("liefert keine Artefakte aus anderen Dossiers", async () => {
    const other = await createNotebook(
      db,
      "bbbbbbbb-0000-4000-8000-000000000002",
      "Anderes"
    );
    await createArtifact(db, notebookId, "briefing", { summary: "A" });
    await createArtifact(db, other.id, "briefing", { summary: "B" });

    const rows = await listArtifacts(db, notebookId);
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toEqual({ summary: "A" });
  });

  it("filtert optional nach Besucherzugriff", async () => {
    await createArtifact(db, notebookId, "briefing", { summary: "A" });

    expect(await listArtifacts(db, notebookId, VISITOR)).toHaveLength(1);
    expect(
      await listArtifacts(
        db,
        notebookId,
        "bbbbbbbb-0000-4000-8000-000000000002"
      )
    ).toEqual([]);
  });
});
