// @vitest-environment node
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  buildChatMessages,
  ChatGenerationError,
  extractCitations,
  generateChatAnswer,
  type ChatSource,
} from "@/lib/chat/openrouter";

const SOURCES: ChatSource[] = [
  {
    id: "src-1",
    label: "S-01",
    title: "Erste Quelle",
    content: "Alpha ist der erste Abschnitt.",
  },
  { id: "src-2", label: "S-02", title: "Zweite Quelle", content: "Beta" },
];

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_MODEL = "test/model";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
});

describe("buildChatMessages", () => {
  it("baut einen Quellenprompt mit stabilen Labels", () => {
    const messages = buildChatMessages(
      SOURCES,
      [{ role: "assistant", content: "Vorherige Antwort" }],
      "Frage?"
    );

    expect(messages[1].content).toContain("[S-01] Erste Quelle");
    expect(messages[1].content).toContain("[S-02] Zweite Quelle");
    expect(messages.at(-1)).toEqual({ role: "user", content: "Frage?" });
  });

  it("fügt eine Systemanweisung hinzu, ohne die Quellenregeln zu ersetzen", () => {
    const messages = buildChatMessages(
      SOURCES,
      [],
      "Frage?",
      "Erkläre Fachbegriffe einfach."
    );

    expect(messages[0].content).toContain("Erkläre Fachbegriffe einfach.");
    expect(messages[0].content).toContain("Quellenbindung");
    expect(messages[0].content).toContain("Belegpflicht");
  });
});

describe("generateChatAnswer", () => {
  it("ruft OpenRouter auf und liefert den Antworttext", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Antwort [S-01]" } }],
        }),
        { status: 200 }
      )
    );

    const answer = await generateChatAnswer({
      sources: SOURCES,
      history: [],
      question: "Was steht drin?",
      model: "deepseek/deepseek-v4-flash",
    });

    expect(answer).toBe("Antwort [S-01]");
    expect(fetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer test-key",
        }),
      })
    );
    const body = JSON.parse(
      String(vi.mocked(fetch).mock.calls[0][1]?.body)
    );
    expect(body.model).toBe("deepseek/deepseek-v4-flash");
    expect(body.messages.at(-1)).toEqual({
      role: "user",
      content: "Was steht drin?",
    });
  });

  it("normalisiert OpenRouter-Fehler", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("kaputt", { status: 500 }));

    await expect(
      generateChatAnswer({ sources: SOURCES, history: [], question: "?" })
    ).rejects.toThrow(ChatGenerationError);
  });

  it("fällt bei ungültigem Modell auf OPENROUTER_MODEL zurück", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Antwort" } }],
        }),
        { status: 200 }
      )
    );

    await generateChatAnswer({
      sources: SOURCES,
      history: [],
      question: "?",
      model: "kein-modell",
    });

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(body.model).toBe("test/model");
  });

  it("wirft eine deutsche Meldung ohne API-Key", async () => {
    delete process.env.OPENROUTER_API_KEY;

    await expect(
      generateChatAnswer({ sources: SOURCES, history: [], question: "?" })
    ).rejects.toThrow("OPENROUTER_API_KEY fehlt");
  });
});

describe("extractCitations", () => {
  it("extrahiert eindeutige Quellenchips aus der Antwort", () => {
    expect(extractCitations("A [S-01], B [S-02], nochmal [S-01]", SOURCES)).toEqual([
      {
        sourceId: "src-1",
        label: "S-01",
        title: "Erste Quelle",
        marker: "[S-01]",
        start: 0,
        end: 30,
        citedText: "Alpha ist der erste Abschnitt.",
      },
      {
        sourceId: "src-2",
        label: "S-02",
        title: "Zweite Quelle",
        marker: "[S-02]",
        start: 0,
        end: 4,
        citedText: "Beta",
      },
    ]);
  });

  it("extrahiert Zeichenoffsets aus Quellenchips", () => {
    expect(extractCitations("Aussage [S-01#6-9]", SOURCES)).toEqual([
      {
        sourceId: "src-1",
        label: "S-01",
        title: "Erste Quelle",
        marker: "[S-01#6-9]",
        start: 6,
        end: 9,
        citedText: "ist",
      },
    ]);
  });
});
