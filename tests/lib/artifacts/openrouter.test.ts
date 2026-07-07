// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ArtifactGenerationError,
  buildArtifactMessages,
  generateArtifactContent,
  parseArtifactJson,
} from "@/lib/artifacts/openrouter";
import type { ChatSource } from "@/lib/chat/openrouter";

const SOURCES: ChatSource[] = [
  { id: "s-1", label: "S-01", title: "Quelle", content: "Inhalt" },
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

describe("buildArtifactMessages", () => {
  it("enthält Typ, Schema und Quellenlabels", () => {
    const messages = buildArtifactMessages("faq", SOURCES);
    expect(messages[1].content).toContain("Artefakt: FAQ");
    expect(messages[1].content).toContain('"items"');
    expect(messages[1].content).toContain("[S-01] Quelle");
  });
});

describe("parseArtifactJson", () => {
  it("parst nacktes JSON und Codefences", () => {
    expect(parseArtifactJson('{"summary":"A"}')).toEqual({ summary: "A" });
    expect(parseArtifactJson('```json\n{"summary":"A"}\n```')).toEqual({
      summary: "A",
    });
  });

  it("wirft eine deutsche Meldung bei ungültigem JSON", () => {
    expect(() => parseArtifactJson("kein json")).toThrow(
      "Artefakt-Antwort war kein gültiges JSON"
    );
  });
});

describe("generateArtifactContent", () => {
  it("ruft OpenRouter auf und parst JSON", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"items":[]}' } }],
        }),
        { status: 200 }
      )
    );

    await expect(
      generateArtifactContent({ type: "faq", sources: SOURCES })
    ).resolves.toEqual({ items: [] });

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(body.model).toBe("test/model");
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("normalisiert API-Fehler", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("kaputt", { status: 500 }));

    await expect(
      generateArtifactContent({ type: "faq", sources: SOURCES })
    ).rejects.toThrow(ArtifactGenerationError);
  });

  it("fordert OPENROUTER_API_KEY", async () => {
    delete process.env.OPENROUTER_API_KEY;

    await expect(
      generateArtifactContent({ type: "faq", sources: SOURCES })
    ).rejects.toThrow("OPENROUTER_API_KEY fehlt");
  });
});
