// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "../helpers/db";
import type { Db } from "@/db";
import { createNotebook } from "@/db/repo/notebooks";
import { createSource } from "@/db/repo/sources";
import { listChatMessages } from "@/db/repo/chat";

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

const generateChatAnswerMock = vi.fn();
vi.mock("@/lib/chat/openrouter", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/chat/openrouter")>();
  return {
    ...actual,
    generateChatAnswer: (...args: unknown[]) =>
      generateChatAnswerMock(...args),
  };
});

import { POST } from "@/app/api/notebooks/[id]/chat/route";
import { ChatGenerationError } from "@/lib/chat/openrouter";

const VISITOR = "aaaaaaaa-0000-4000-8000-000000000001";
let notebookId: string;

beforeEach(async () => {
  testDb = (await createTestDb()) as unknown as Db;
  const nb = await createNotebook(testDb, VISITOR, "Chat");
  notebookId = nb.id;
  cookieValue = VISITOR;
  generateChatAnswerMock.mockReset().mockResolvedValue("Antwort [S-01]");
});

function ctx(id = notebookId) {
  return { params: Promise.resolve({ id }) };
}

function postRequest(body: unknown) {
  return new Request(`http://localhost/api/notebooks/${notebookId}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/notebooks/[id]/chat", () => {
  it("generiert eine Antwort aus ready-Quellen und persistiert beide Nachrichten", async () => {
    const source = await createSource(testDb, notebookId, {
      type: "text",
      title: "Quelle",
      content: "Quellentext",
      tokenCount: 3,
    });

    const res = await POST(postRequest({ question: "Was steht drin?" }), ctx());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.assistantMessage.content).toBe("Antwort [S-01]");
    expect(json.assistantMessage.citations).toEqual([
      { sourceId: source.id, label: "S-01", title: "Quelle" },
    ]);
    expect(generateChatAnswerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [
          {
            id: source.id,
            label: "S-01",
            title: "Quelle",
            content: "Quellentext",
          },
        ],
        question: "Was steht drin?",
      })
    );
    const messages = await listChatMessages(testDb, notebookId);
    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
  });

  it("liefert 400 ohne bereite Quellen", async () => {
    const res = await POST(postRequest({ question: "?" }), ctx());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Füge zuerst eine bereite Quelle hinzu.");
  });

  it("liefert 400 bei leerer Frage", async () => {
    const res = await POST(postRequest({ question: "   " }), ctx());
    expect(res.status).toBe(400);
  });

  it("liefert 401 ohne Besucher-Cookie", async () => {
    cookieValue = undefined;
    const res = await POST(postRequest({ question: "?" }), ctx());
    expect(res.status).toBe(401);
  });

  it("liefert 404 für ein fremdes Dossier", async () => {
    const res = await POST(postRequest({ question: "?" }), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }),
    });
    expect(res.status).toBe(404);
  });

  it("normalisiert OpenRouter-Fehler", async () => {
    await createSource(testDb, notebookId, {
      type: "text",
      title: "Quelle",
      content: "Quellentext",
      tokenCount: 3,
    });
    generateChatAnswerMock.mockRejectedValue(new ChatGenerationError("Kaputt"));

    const res = await POST(postRequest({ question: "?" }), ctx());

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe("Kaputt");
  });
});
