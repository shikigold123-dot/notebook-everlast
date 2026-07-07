// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "../helpers/db";
import type { Db } from "@/db";
import { createNotebook } from "@/db/repo/notebooks";

const handleUploadMock = vi.fn();
vi.mock("@vercel/blob/client", () => ({
  handleUpload: (...args: unknown[]) => handleUploadMock(...args),
}));

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

import {
  POST,
  tokenOptionsForType,
} from "@/app/api/notebooks/[id]/blob-upload-token/route";

const VISITOR = "aaaaaaaa-0000-4000-8000-000000000001";
let notebookId: string;

beforeEach(async () => {
  testDb = (await createTestDb()) as unknown as Db;
  const nb = await createNotebook(testDb, VISITOR, "Test");
  notebookId = nb.id;
  cookieValue = VISITOR;
  handleUploadMock.mockReset();
});

function postRequest(body: unknown) {
  return new Request(
    `http://localhost/api/notebooks/${notebookId}/blob-upload-token`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function ctx() {
  return { params: Promise.resolve({ id: notebookId }) };
}

describe("tokenOptionsForType", () => {
  it("erlaubt PDF mit 15-MB-Limit", () => {
    const result = tokenOptionsForType(JSON.stringify({ type: "pdf" }));
    expect(result.allowedContentTypes).toEqual(["application/pdf"]);
    expect(result.maximumSizeInBytes).toBe(15 * 1024 * 1024);
  });

  it("erlaubt Audio mit 25-MB-Limit", () => {
    const result = tokenOptionsForType(JSON.stringify({ type: "audio" }));
    expect(result.allowedContentTypes).toContain("audio/mpeg");
    expect(result.maximumSizeInBytes).toBe(25 * 1024 * 1024);
  });

  it("fällt ohne Payload auf pdf zurück", () => {
    const result = tokenOptionsForType(null);
    expect(result.maximumSizeInBytes).toBe(15 * 1024 * 1024);
  });
});

describe("POST /api/notebooks/[id]/blob-upload-token", () => {
  it("gibt die Antwort von handleUpload zurück", async () => {
    handleUploadMock.mockResolvedValue({
      type: "blob.generate-client-token",
      clientToken: "abc",
    });
    const res = await POST(
      postRequest({ type: "blob.generate-client-token" }),
      ctx()
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.clientToken).toBe("abc");
  });

  it("liefert 401 ohne Besucher-Cookie", async () => {
    cookieValue = undefined;
    const res = await POST(postRequest({}), ctx());
    expect(res.status).toBe(401);
  });

  it("liefert 404 für ein fremdes Dossier", async () => {
    const res = await POST(postRequest({}), {
      params: Promise.resolve({
        id: "00000000-0000-4000-8000-000000000000",
      }),
    });
    expect(res.status).toBe(404);
  });

  it("liefert 400, wenn handleUpload einen Fehler wirft", async () => {
    handleUploadMock.mockRejectedValue(new Error("Ungültiger Payload"));
    const res = await POST(postRequest({}), ctx());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Ungültiger Payload");
  });
});
