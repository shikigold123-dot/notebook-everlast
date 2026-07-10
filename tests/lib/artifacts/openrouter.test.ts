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

  it("ist ohne Customization identisch zum Standard-Prompt", () => {
    const withoutArg = buildArtifactMessages("faq", SOURCES);
    const withEmptyCustomization = buildArtifactMessages("faq", SOURCES, {});
    expect(withEmptyCustomization).toEqual(withoutArg);
  });

  it("hängt Detailgrad und Freitext-Anweisung an", () => {
    const messages = buildArtifactMessages("faq", SOURCES, {
      detailLevel: "detailed",
      customInstructions: "Fokus auf Kapitel 2",
    });
    expect(messages[1].content).toContain("besonders ausführlich");
    expect(messages[1].content).toContain(
      'Zusätzliche Nutzer-Anweisung: "Fokus auf Kapitel 2"'
    );
  });

  it("übernimmt den visuellen Stil nur bei Infografiken", () => {
    const infographic = buildArtifactMessages("infographic", SOURCES, {
      visualStyle: "sketchnote",
    });
    expect(infographic[1].content).toContain("Sketchnote-Stil");

    const faq = buildArtifactMessages("faq", SOURCES, {
      visualStyle: "sketchnote",
    });
    expect(faq[1].content).not.toContain("Sketchnote-Stil");
  });
});

describe("parseArtifactJson", () => {
  it("parst nacktes JSON und Codefences", () => {
    expect(parseArtifactJson('{"summary":"A"}')).toEqual({ summary: "A" });
    expect(parseArtifactJson('```json\n{"summary":"A"}\n```')).toEqual({
      summary: "A",
    });
    expect(parseArtifactJson('Hier ist JSON:\n{"summary":"A"}\nFertig.')).toEqual({
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

  it("nutzt Nano Banana 2 Lite für Infografiken", async () => {
    delete process.env.OPENROUTER_MODEL;
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                images: [
                  {
                    image_url: {
                      url: "data:image/png;base64,abc",
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 }
      )
    );

    await expect(
      generateArtifactContent({ type: "infographic", sources: SOURCES })
    ).resolves.toEqual(
      expect.objectContaining({
        imageUrl: "data:image/png;base64,abc",
        source_refs: ["S-01"],
      })
    );

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(body.model).toBe("google/gemini-3.1-flash-lite-image");
    expect(body.response_format).toBeUndefined();
  });

  it("nutzt DeepSeek V4 Flash für Websites", async () => {
    delete process.env.OPENROUTER_MODEL;
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "Website",
                  html: "<!doctype html><html><body>Hallo</body></html>",
                }),
              },
            },
          ],
        }),
        { status: 200 }
      )
    );

    await expect(
      generateArtifactContent({ type: "website", sources: SOURCES })
    ).resolves.toEqual({
      title: "Website",
      html: "<!doctype html><html><body>Hallo</body></html>",
    });

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(body.model).toBe("deepseek/deepseek-v4-flash");
    expect(body.response_format).toBeUndefined();
  });

  it("akzeptiert rohe HTML-Antworten für Websites", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  "```html\n<!doctype html><html><body>Hallo</body></html>\n```",
              },
            },
          ],
        }),
        { status: 200 }
      )
    );

    await expect(
      generateArtifactContent({ type: "website", sources: SOURCES })
    ).resolves.toEqual({
      title: "Quellen-Website",
      html: "<!doctype html><html><body>Hallo</body></html>",
    });
  });

  it("extrahiert HTML auch aus erklärenden Website-Antworten", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  "Hier ist die Seite:\n<html><head><title>Dossier</title></head><body>Hallo</body></html>",
              },
            },
          ],
        }),
        { status: 200 }
      )
    );

    await expect(
      generateArtifactContent({ type: "website", sources: SOURCES })
    ).resolves.toEqual({
      title: "Dossier",
      html: "<html><head><title>Dossier</title></head><body>Hallo</body></html>",
    });
  });

  it("normalisiert verschachtelte Mind-Map-Antworten", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  root: {
                    title: "Zentrum",
                    branches: [{ name: "Ast" }],
                  },
                }),
              },
            },
          ],
        }),
        { status: 200 }
      )
    );

    await expect(
      generateArtifactContent({ type: "mindmap", sources: SOURCES })
    ).resolves.toEqual({
      label: "Zentrum",
      children: [{ label: "Ast", children: [] }],
    });
  });

  it("liefert eine strukturierte Infografik, wenn kein Bild zurückkommt", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "Infografik",
                  sections: [
                    {
                      label: "S-01",
                      metric: "Quelle",
                      description: "Inhalt",
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200 }
      )
    );

    await expect(
      generateArtifactContent({ type: "infographic", sources: SOURCES })
    ).resolves.toEqual(
      expect.objectContaining({
        title: "Infografik",
        sections: [
          { label: "S-01", metric: "Quelle", description: "Inhalt" },
        ],
      })
    );
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
