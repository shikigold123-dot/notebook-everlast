// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../helpers/db";
import type { Db } from "@/db";
import { createNotebook } from "@/db/repo/notebooks";
import { createSource, getSource } from "@/db/repo/sources";
import { notebook, source } from "@/db/schema";

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

const processSourceMock = vi.fn();
vi.mock("@/lib/ingestion/process", () => ({
  processSource: (...args: unknown[]) => processSourceMock(...args),
}));

import { DELETE } from "@/app/api/notebooks/[id]/sources/[sourceId]/route";
import { POST as retryPOST } from "@/app/api/notebooks/[id]/sources/[sourceId]/retry/route";

const VISITOR = "aaaaaaaa-0000-4000-8000-000000000001";
let notebookId: string;
let sourceId: string;

beforeEach(async () => {
  testDb = (await createTestDb()) as unknown as Db;
  const nb = await createNotebook(testDb, VISITOR, "Test");
  notebookId = nb.id;
  const src = await createSource(testDb, notebookId, {
    type: "url",
    title: "Warten …",
    originalUrl: "https://example.com/artikel",
  });
  sourceId = src.id;
  cookieValue = VISITOR;
  processSourceMock.mockReset().mockResolvedValue(undefined);
});

function ctx() {
  return { params: Promise.resolve({ id: notebookId, sourceId }) };
}

describe("DELETE /api/notebooks/[id]/sources/[sourceId]", () => {
  it("löscht die Quelle", async () => {
    const res = await DELETE(
      new Request("http://localhost", { method: "DELETE" }),
      ctx()
    );
    expect(res.status).toBe(200);
    const remaining = await getSource(testDb, notebookId, sourceId);
    expect(remaining).toBeNull();
  });

  it("liefert 401 ohne Besucher-Cookie", async () => {
    cookieValue = undefined;
    const res = await DELETE(
      new Request("http://localhost", { method: "DELETE" }),
      ctx()
    );
    expect(res.status).toBe(401);
  });

  it("blockiert Löschen in Demo-Dossiers", async () => {
    await testDb
      .update(notebook)
      .set({ isDemo: true })
      .where(eq(notebook.id, notebookId));

    const res = await DELETE(
      new Request("http://localhost", { method: "DELETE" }),
      ctx()
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Demo-Dossier ist schreibgeschützt.");
    const remaining = await getSource(testDb, notebookId, sourceId);
    expect(remaining).not.toBeNull();
  });
});

describe("POST /api/notebooks/[id]/sources/[sourceId]/retry", () => {
  it("setzt eine fehlerhafte Quelle zurück auf pending und stößt die Verarbeitung erneut an", async () => {
    await testDb
      .update(source)
      .set({ status: "error", errorMessage: "Kaputt" })
      .where(eq(source.id, sourceId));

    const res = await retryPOST(
      new Request("http://localhost", { method: "POST" }),
      ctx()
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.source.status).toBe("pending");
    expect(json.source.errorMessage).toBeNull();
    expect(processSourceMock).toHaveBeenCalledWith(
      testDb,
      notebookId,
      sourceId
    );
  });

  it("liefert 404 für eine unbekannte Quelle", async () => {
    const res = await retryPOST(
      new Request("http://localhost", { method: "POST" }),
      {
        params: Promise.resolve({
          id: notebookId,
          sourceId: "00000000-0000-4000-8000-000000000000",
        }),
      }
    );
    expect(res.status).toBe(404);
  });

  it("blockiert Retry in Demo-Dossiers", async () => {
    await testDb
      .update(notebook)
      .set({ isDemo: true })
      .where(eq(notebook.id, notebookId));

    const res = await retryPOST(
      new Request("http://localhost", { method: "POST" }),
      ctx()
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Demo-Dossier ist schreibgeschützt.");
    expect(processSourceMock).not.toHaveBeenCalled();
  });
});
