// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../helpers/db";
import type { Db } from "@/db";
import { createNotebook } from "@/db/repo/notebooks";
import { notebook } from "@/db/schema";

// DB-Modul mocken: Die Route bekommt unsere PGlite-Instanz
let testDb: Db;
vi.mock("@/db", () => ({
  getDb: () => testDb,
}));

// next/headers mocken: cookies() liefert unseren Fake-Store
let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "everlast_visitor" && cookieValue
        ? { value: cookieValue }
        : undefined,
  }),
}));

import { GET, POST } from "@/app/api/notebooks/route";

const VISITOR = "aaaaaaaa-0000-4000-8000-000000000001";

beforeEach(async () => {
  testDb = (await createTestDb()) as unknown as Db;
  cookieValue = VISITOR;
  delete process.env.LIMIT_NOTEBOOKS_PER_VISITOR;
});

function postRequest(body: unknown) {
  return new Request("http://localhost/api/notebooks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/notebooks", () => {
  it("legt ein Notebook an (201)", async () => {
    const res = await POST(postRequest({ title: "Kant" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.notebook.title).toBe("Kant");
  });

  it("nutzt den Default-Titel ohne title", async () => {
    const res = await POST(postRequest({}));
    const json = await res.json();
    expect(json.notebook.title).toBe("Unbenanntes Dossier");
  });

  it("liefert 429 mit deutscher Meldung ab dem Limit", async () => {
    process.env.LIMIT_NOTEBOOKS_PER_VISITOR = "1";
    await POST(postRequest({ title: "Eins" }));
    const res = await POST(postRequest({ title: "Zwei" }));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toContain("Maximal 1");
  });

  it("liefert 401 ohne Besucher-Cookie", async () => {
    cookieValue = undefined;
    const res = await POST(postRequest({ title: "X" }));
    expect(res.status).toBe(401);
  });

  it("liefert 400 bei einem Titel über 200 Zeichen", async () => {
    const res = await POST(postRequest({ title: "a".repeat(201) }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Titel darf höchstens 200 Zeichen lang sein.");
  });

  it("akzeptiert einen Titel mit genau 200 Zeichen", async () => {
    const res = await POST(postRequest({ title: "a".repeat(200) }));
    expect(res.status).toBe(201);
  });
});

describe("GET /api/notebooks", () => {
  it("listet die Notebooks des Besuchers", async () => {
    await POST(postRequest({ title: "Kant" }));
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.notebooks).toHaveLength(1);
  });

  it("listet zusätzlich Demo-Dossiers", async () => {
    await POST(postRequest({ title: "Kant" }));
    const demo = await createNotebook(
      testDb,
      "bbbbbbbb-0000-4000-8000-000000000002",
      "Demo"
    );
    await testDb
      .update(notebook)
      .set({ isDemo: true })
      .where(eq(notebook.id, demo.id));

    const res = await GET();
    const json = await res.json();

    expect(json.notebooks.map((nb: { title: string }) => nb.title)).toEqual([
      "Demo",
      "Kant",
    ]);
  });

  it("liefert eine leere Liste ohne Cookie", async () => {
    cookieValue = undefined;
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.notebooks).toEqual([]);
  });
});
