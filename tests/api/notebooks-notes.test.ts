// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { createNotebook } from "@/db/repo/notebooks";
import { createTestDb } from "../helpers/db";

let db: Db;
let cookieValue: string | undefined;

vi.mock("@/db", () => ({ getDb: () => db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "everlast_visitor" && cookieValue ? { value: cookieValue } : undefined,
  }),
}));

import { GET, POST } from "@/app/api/notebooks/[id]/notes/route";
import { DELETE, PATCH } from "@/app/api/notebooks/[id]/notes/[noteId]/route";

const VISITOR = "aaaaaaaa-0000-4000-8000-000000000001";

describe("Notizen-API", () => {
  it("unterstützt den vollständigen autorisierten CRUD-Ablauf", async () => {
    db = (await createTestDb()) as unknown as Db;
    cookieValue = VISITOR;
    const notebook = await createNotebook(db, VISITOR, "Notizen");
    const context = { params: Promise.resolve({ id: notebook.id }) };

    const createdResponse = await POST(
      new Request("http://localhost/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "These", content: "Erkenntnis" }),
      }),
      context
    );
    expect(createdResponse.status).toBe(201);
    const { note } = await createdResponse.json();

    const updatedResponse = await PATCH(
      new Request("http://localhost/notes/id", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Präzise These", content: "Neue Erkenntnis" }),
      }),
      { params: Promise.resolve({ id: notebook.id, noteId: note.id }) }
    );
    expect((await updatedResponse.json()).note.title).toBe("Präzise These");

    const listResponse = await GET(new Request("http://localhost/notes"), context);
    expect((await listResponse.json()).notes).toHaveLength(1);

    const deleteResponse = await DELETE(new Request("http://localhost/notes/id"), {
      params: Promise.resolve({ id: notebook.id, noteId: note.id }),
    });
    expect(deleteResponse.status).toBe(200);
    expect((await (await GET(new Request("http://localhost/notes"), context)).json()).notes).toEqual([]);
  });
});
