// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  buildResearchMessages,
  extractResearchFoundSources,
  generateResearchReport,
  getResearchModel,
  ResearchGenerationError,
} from "@/lib/research/openrouter";

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "test-key";
  delete process.env.OPENROUTER_RESEARCH_MODEL;
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_RESEARCH_MODEL;
});

describe("buildResearchMessages", () => {
  it("baut einen deutschen Rechercheprompt", () => {
    const messages = buildResearchMessages("NotebookLM Deep Research");

    expect(messages[0].content).toContain("Recherchiere im Web");
    expect(messages[1]).toEqual({
      role: "user",
      content: "Recherchefrage:\nNotebookLM Deep Research",
    });
  });
});

describe("generateResearchReport", () => {
  it("ruft OpenRouter mit Sonar Deep Research und Web-Suche auf", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          citations: ["https://example.com"],
          choices: [
            {
              message: {
                content: "# Berichtstitel\n\nKurzfazit. https://example.com/zwei",
                annotations: [
                  {
                    type: "url_citation",
                    url_citation: {
                      url: "https://example.com/eins#abschnitt",
                      title: "Quelle eins",
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

    const report = await generateResearchReport({
      query: "Was ist neu bei NotebookLM?",
    });

    expect(report.title).toBe("Berichtstitel");
    expect(report.content).toContain("Kurzfazit");
    expect(report.meta).toEqual({
      query: "Was ist neu bei NotebookLM?",
      model: "perplexity/sonar-deep-research",
      citations: [
        "https://example.com/",
        "https://example.com/eins",
        "https://example.com/zwei",
      ],
      foundSources: [
        { url: "https://example.com/" },
        { url: "https://example.com/eins", title: "Quelle eins" },
        { url: "https://example.com/zwei" },
      ],
      annotations: [
        {
          type: "url_citation",
          url_citation: {
            url: "https://example.com/eins#abschnitt",
            title: "Quelle eins",
          },
        },
      ],
    });

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(body.model).toBe("perplexity/sonar-deep-research");
    expect(body.web_search_options).toEqual({ search_context_size: "high" });
  });

  it("nutzt OPENROUTER_RESEARCH_MODEL als Override", () => {
    process.env.OPENROUTER_RESEARCH_MODEL = "perplexity/test";
    expect(getResearchModel()).toBe("perplexity/test");
  });

  it("normalisiert OpenRouter-Fehler", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("kaputt", { status: 500 }));

    await expect(generateResearchReport({ query: "Frage" })).rejects.toThrow(
      ResearchGenerationError
    );
  });

  it("fordert OPENROUTER_API_KEY", async () => {
    delete process.env.OPENROUTER_API_KEY;

    await expect(generateResearchReport({ query: "Frage" })).rejects.toThrow(
      "OPENROUTER_API_KEY fehlt"
    );
  });
});

describe("extractResearchFoundSources", () => {
  it("dedupliziert URLs aus Citations, Annotations und Text", () => {
    const sources = extractResearchFoundSources({
      citations: ["https://example.com/a#top"],
      annotations: [
        {
          url_citation: {
            url: "https://example.com/a",
            title: "Artikel A",
          },
        },
        { url: "https://example.com/b.", title: "Artikel B" },
      ],
      content: "Siehe https://example.com/c und https://example.com/a.",
    });

    expect(sources).toEqual([
      { url: "https://example.com/a", title: "Artikel A" },
      { url: "https://example.com/b", title: "Artikel B" },
      { url: "https://example.com/c" },
    ]);
  });
});
