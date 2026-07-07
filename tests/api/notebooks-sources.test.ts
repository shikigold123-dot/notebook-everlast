// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import type { Db } from "@/db";
import { createNotebook } from "@/db/repo/notebooks";

let testDb: Db;
vi.mock("@/db", () => ({
  getDb: () => testDb,
}));

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "everlast_visitor" && cookieValue
        ? { value: cookieValue }
        : undefined,
  }),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn((cb: () => unknown) => cb()) };
});

const countTokensMock = vi.fn();
vi.mock("@/lib/ingestion/tokens", () => ({
  countTokens: (...args: unknown[]) => countTokensMock(...args),
}));

const processSourceMock = vi.fn();
vi.mock("@/lib/ingestion/process", () => ({
  processSource: (...args: unknown[]) => processSourceMock(...args),
}));

import { GET, POST } from "@/app/api/notebooks/[id]/sources/route";

const VISITOR = "aaaaaaaa-0000-4000-8000-000000000001";
let notebookId: string;

beforeEach(async () => {
  testDb = (await createTestDb()) as unknown as Db;
  const nb = await createNotebook(testDb, VISITOR, "Test");
  notebookId = nb.id;
  cookieValue = VISITOR;
  countTokensMock.mockReset().mockResolvedValue(10);
  processSourceMock.mockReset().mockResolvedValue(undefined);
  delete process.env.LIMIT_SOURCES_PER_NOTEBOOK;
});

function ctx() {
  return { params: Promise.resolve({ id: notebookId }) };
}

function postRequest(body: unknown) {
  return new Request(`http://localhost/api/notebooks/${notebookId}/sources`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/notebooks/[id]/sources", () => {
  it("legt eine Text-Quelle sofort als ready an, ohne Hintergrund-Verarbeitung", async () => {
    const res = await POST(
      postRequest({ type: "text", title: "Notiz", content: "Ein Text." }),
      ctx()
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.source.status).toBe("ready");
    expect(json.source.tokenCount).toBe(10);
    expect(processSourceMock).not.toHaveBeenCalled();
  });

  it("liefert 400 bei leerem Text", async () => {
    const res = await POST(
      postRequest({ type: "text", title: "Notiz", content: "   " }),
      ctx()
    );
    expect(res.status).toBe(400);
  });

  it("legt eine URL-Quelle als pending an und stößt die Verarbeitung an", async () => {
    const res = await POST(
      postRequest({ type: "url", originalUrl: "https://example.com/artikel" }),
      ctx()
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.source.status).toBe("pending");
    expect(processSourceMock).toHaveBeenCalledWith(
      testDb,
      notebookId,
      json.source.id
    );
  });

  it("legt eine PDF-Quelle mit blobUrl als pending an", async () => {
    const res = await POST(
      postRequest({
        type: "pdf",
        title: "Doku.pdf",
        blobUrl: "https://blob.example/x.pdf",
      }),
      ctx()
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.source.status).toBe("pending");
    expect(json.source.blobUrl).toBe("https://blob.example/x.pdf");
  });

  it("liefert 400 ohne blobUrl bei pdf", async () => {
    const res = await POST(
      postRequest({ type: "pdf", title: "Doku.pdf" }),
      ctx()
    );
    expect(res.status).toBe(400);
  });

  it("liefert 400 bei unbekanntem Typ", async () => {
    const res = await POST(postRequest({ type: "video" }), ctx());
    expect(res.status).toBe(400);
  });

  it("liefert 401 ohne Besucher-Cookie", async () => {
    cookieValue = undefined;
    const res = await POST(postRequest({ type: "text", content: "x" }), ctx());
    expect(res.status).toBe(401);
  });

  it("liefert 404 für ein fremdes Dossier", async () => {
    const res = await POST(postRequest({ type: "text", content: "x" }), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }),
    });
    expect(res.status).toBe(404);
  });

  it("liefert 429 ab dem Quellen-Limit", async () => {
    process.env.LIMIT_SOURCES_PER_NOTEBOOK = "1";
    await POST(postRequest({ type: "text", content: "Eins" }), ctx());
    const res = await POST(postRequest({ type: "text", content: "Zwei" }), ctx());
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toContain("Maximal 1");
  });
});

describe("GET /api/notebooks/[id]/sources", () => {
  it("listet die Quellen des Dossiers", async () => {
    await POST(postRequest({ type: "text", content: "Eins" }), ctx());
    const res = await GET(new Request("http://localhost"), ctx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sources).toHaveLength(1);
  });

  it("liefert eine leere Liste ohne Cookie", async () => {
    cookieValue = undefined;
    const res = await GET(new Request("http://localhost"), ctx());
    const json = await res.json();
    expect(json.sources).toEqual([]);
  });
});
