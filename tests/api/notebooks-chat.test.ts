// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../helpers/db";
import type { Db } from "@/db";
import { createNotebook } from "@/db/repo/notebooks";
import { createSource } from "@/db/repo/sources";
import { listChatMessages } from "@/db/repo/chat";
import { createNote } from "@/db/repo/notes";
import { notebook, source as sourceTable, chatMessage } from "@/db/schema";

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

import { POST, DELETE } from "@/app/api/notebooks/[id]/chat/route";
import { ChatGenerationError } from "@/lib/chat/openrouter";

const VISITOR = "aaaaaaaa-0000-4000-8000-000000000001";
let notebookId: string;

beforeEach(async () => {
  testDb = (await createTestDb()) as unknown as Db;
  const nb = await createNotebook(testDb, VISITOR, "Chat");
  notebookId = nb.id;
  cookieValue = VISITOR;
  generateChatAnswerMock.mockReset().mockResolvedValue("Antwort [S-01]");
  delete process.env.LIMIT_CHAT_PER_VISITOR_DAY;
  delete process.env.DAILY_BUDGET_CENTS;
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

function streamRequest(body: unknown) {
  return new Request(`http://localhost/api/notebooks/${notebookId}/chat`, {
    method: "POST",
    headers: {
      accept: "text/event-stream",
      "content-type": "application/json",
    },
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

    const res = await POST(
      postRequest({
        question: "Was steht drin?",
        model: "deepseek/deepseek-v4-flash",
      }),
      ctx()
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.assistantMessage.content).toBe("Antwort [S-01]");
    expect(json.assistantMessage.citations).toEqual([
      {
        sourceId: source.id,
        label: "S-01",
        title: "Quelle",
        marker: "[S-01]",
        start: 0,
        end: 11,
        citedText: "Quellentext",
      },
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
        model: "deepseek/deepseek-v4-flash",
      })
    );
    const messages = await listChatMessages(testDb, notebookId);
    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
  });

  it("respektiert eine explizit leere Quellenauswahl", async () => {
    await createSource(testDb, notebookId, {
      type: "text",
      title: "Quelle",
      content: "Quellentext",
      tokenCount: 3,
    });

    const res = await POST(
      postRequest({
        question: "Was steht drin?",
        sourceIds: [],
      }),
      ctx()
    );

    expect(res.status).toBe(400);
    expect(generateChatAnswerMock).not.toHaveBeenCalled();
  });

  it("antwortet ausschließlich aus ausgewählten Notizen", async () => {
    const note = await createNote(testDb, notebookId, VISITOR, {
      title: "Eigene These",
      content: "Notizkontext",
    });

    const res = await POST(
      postRequest({ question: "Was ist meine These?", sourceIds: [], noteIds: [note!.id] }),
      ctx()
    );

    expect(res.status).toBe(200);
    expect(generateChatAnswerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [
          {
            id: note!.id,
            label: "N-01",
            title: "Notiz: Eigene These",
            content: "Notizkontext",
          },
        ],
      })
    );
  });

  it("gibt eine Systemanweisung an die Antwortgenerierung weiter", async () => {
    await createSource(testDb, notebookId, {
      type: "text",
      title: "Quelle",
      content: "Quellentext",
      tokenCount: 3,
    });

    const res = await POST(
      postRequest({
        question: "Was steht drin?",
        systemMessage: "Erkläre Begriffe einfach.",
      }),
      ctx()
    );

    expect(res.status).toBe(200);
    expect(generateChatAnswerMock).toHaveBeenCalledWith(
      expect.objectContaining({ systemMessage: "Erkläre Begriffe einfach." })
    );
  });

  it("lehnt zu lange Systemanweisungen ab", async () => {
    const res = await POST(
      postRequest({ question: "Was steht drin?", systemMessage: "x".repeat(4001) }),
      ctx()
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Systemanweisung darf höchstens 4.000 Zeichen haben.",
    });
  });

  it("streamt Chat-Antworten als SSE", async () => {
    await createSource(testDb, notebookId, {
      type: "text",
      title: "Quelle",
      content: "Quellentext",
      tokenCount: 3,
    });

    const res = await POST(
      streamRequest({
        question: "Was steht drin?",
        model: "anthropic/claude-sonnet-5",
      }),
      ctx()
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const body = await res.text();
    expect(body).toContain("event: user_message");
    expect(body).toContain("event: delta");
    expect(body).toContain("Antwort [S-01]");
    expect(body).toContain("event: assistant_message");
    expect(body).toContain("event: done");
    expect(generateChatAnswerMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "anthropic/claude-sonnet-5" })
    );
  });

  it("ignoriert alte YouTube-Metadatenquellen ohne Transkript", async () => {
    const usable = await createSource(testDb, notebookId, {
      type: "text",
      title: "Verwertbar",
      content: "Echter Quellentext",
      tokenCount: 3,
    });
    const metadataOnly = await createSource(testDb, notebookId, {
      type: "youtube",
      title: "Altes Video",
      content:
        "YouTube-Metadaten: Für dieses Video ist kein Transkript verfügbar.",
      tokenCount: 8,
      meta: { transcriptAvailable: false },
    });
    await testDb
      .update(sourceTable)
      .set({ status: "ready" })
      .where(eq(sourceTable.id, metadataOnly.id));

    const res = await POST(postRequest({ question: "Was steht drin?" }), ctx());

    expect(res.status).toBe(200);
    expect(generateChatAnswerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [
          {
            id: usable.id,
            label: "S-01",
            title: "Verwertbar",
            content: "Echter Quellentext",
          },
        ],
      })
    );
  });

  it("liefert 400 ohne bereite Quellen", async () => {
    const res = await POST(postRequest({ question: "?" }), ctx());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Wähle mindestens eine bereite Quelle oder Notiz aus.");
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

  it("liefert 404 für ein fremdes Notebook", async () => {
    const res = await POST(postRequest({ question: "?" }), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }),
    });
    expect(res.status).toBe(404);
  });

  it("blockiert Schreibzugriff auf Demo-Notebooks", async () => {
    await testDb
      .update(notebook)
      .set({ isDemo: true })
      .where(eq(notebook.id, notebookId));

    const res = await POST(postRequest({ question: "?" }), ctx());
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("Demo-Notebook ist schreibgeschützt.");
    expect(generateChatAnswerMock).not.toHaveBeenCalled();
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

  it("liefert 429 ab dem Chat-Tageslimit", async () => {
    process.env.LIMIT_CHAT_PER_VISITOR_DAY = "1";
    await createSource(testDb, notebookId, {
      type: "text",
      title: "Quelle",
      content: "Quellentext",
      tokenCount: 3,
    });

    await POST(postRequest({ question: "Eins?" }), ctx());
    const res = await POST(postRequest({ question: "Zwei?" }), ctx());

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toContain("Tageslimit erreicht");
  });

  describe("DELETE /api/notebooks/[id]/chat", () => {
    it("leert den Chatverlauf des Notebooks", async () => {
      await testDb.insert(chatMessage).values({
        notebookId,
        role: "user",
        content: "Frage?",
      });

      const res = await DELETE(new Request("http://localhost"), ctx());
      expect(res.status).toBe(200);

      const messages = await listChatMessages(testDb, notebookId, VISITOR);
      expect(messages.length).toBe(0);
    });

    it("liefert 401 ohne Besucher-Cookie", async () => {
      cookieValue = undefined;
      const res = await DELETE(new Request("http://localhost"), ctx());
      expect(res.status).toBe(401);
    });

    it("blockiert Löschen in Demo-Notebooks", async () => {
      await testDb
        .update(notebook)
        .set({ isDemo: true })
        .where(eq(notebook.id, notebookId));

      const res = await DELETE(new Request("http://localhost"), ctx());
      expect(res.status).toBe(400);
    });
  });
});
