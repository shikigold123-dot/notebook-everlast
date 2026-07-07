// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  AudioGenerationError,
  buildAudioMessages,
  generateAudioScript,
  parseAudioScriptJson,
} from "@/lib/audio/openrouter";
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

describe("buildAudioMessages", () => {
  it("enthält Rollen, Schema und Quellenlabels", () => {
    const messages = buildAudioMessages(SOURCES);
    expect(messages[0].content).toContain("Podcast-Dialogskript");
    expect(messages[1].content).toContain('"turns"');
    expect(messages[1].content).toContain("[S-01] Quelle");
  });
});

describe("parseAudioScriptJson", () => {
  it("parst Objekt- und Array-Antworten", () => {
    expect(
      parseAudioScriptJson(
        '{"turns":[{"speaker":"A","text":"Frage"},{"speaker":"B","text":"Antwort"}]}'
      )
    ).toEqual([
      { speaker: "A", text: "Frage" },
      { speaker: "B", text: "Antwort" },
    ]);
    expect(parseAudioScriptJson('[{"speaker":"A","text":"Direkt"}]')).toEqual([
      { speaker: "A", text: "Direkt" },
    ]);
  });

  it("wirft eine deutsche Meldung bei ungültigem JSON", () => {
    expect(() => parseAudioScriptJson("kein json")).toThrow(
      "Audio-Skript war kein gültiges JSON"
    );
  });

  it("wirft bei leerem Skript", () => {
    expect(() => parseAudioScriptJson('{"turns":[]}')).toThrow(
      "keine verwertbaren Dialogzeilen"
    );
  });
});

describe("generateAudioScript", () => {
  it("ruft OpenRouter auf und parst das Skript", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '{"turns":[{"speaker":"A","text":"Frage"},{"speaker":"B","text":"Antwort"}]}',
              },
            },
          ],
        }),
        { status: 200 }
      )
    );

    await expect(generateAudioScript({ sources: SOURCES })).resolves.toEqual([
      { speaker: "A", text: "Frage" },
      { speaker: "B", text: "Antwort" },
    ]);

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(body.model).toBe("test/model");
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("normalisiert API-Fehler", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("kaputt", { status: 500 }));

    await expect(generateAudioScript({ sources: SOURCES })).rejects.toThrow(
      AudioGenerationError
    );
  });

  it("fordert OPENROUTER_API_KEY", async () => {
    delete process.env.OPENROUTER_API_KEY;

    await expect(generateAudioScript({ sources: SOURCES })).rejects.toThrow(
      "OPENROUTER_API_KEY fehlt"
    );
  });
});
