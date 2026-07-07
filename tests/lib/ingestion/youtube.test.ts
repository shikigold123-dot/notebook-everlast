// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();
vi.mock("youtubei.js", () => ({
  Innertube: { create: (...args: unknown[]) => createMock(...args) },
}));

import { extractYoutube } from "@/lib/ingestion/youtube";
import { IngestionError } from "@/lib/ingestion/errors";

beforeEach(() => {
  createMock.mockReset();
});

describe("extractYoutube", () => {
  it("baut Text und Zeitstempel-Segmente aus dem Transkript", async () => {
    createMock.mockResolvedValue({
      getInfo: vi.fn().mockResolvedValue({
        basic_info: { title: "Ein Video" },
        getTranscript: vi.fn().mockResolvedValue({
          transcript: {
            content: {
              body: {
                initial_segments: [
                  { snippet: { text: "Hallo" }, start_ms: 0, end_ms: 1000 },
                  { snippet: { text: "Welt" }, start_ms: 1000, end_ms: 2000 },
                ],
              },
            },
          },
        }),
      }),
    });

    const result = await extractYoutube(
      "https://www.youtube.com/watch?v=abcdefghijk"
    );

    expect(result.title).toBe("Ein Video");
    expect(result.content).toBe("Hallo Welt");
    expect(result.meta.segments).toEqual([
      { start_s: 0, end_s: 1, text_offset: 0 },
      { start_s: 1, end_s: 2, text_offset: 6 },
    ]);
  });

  it("wirft IngestionError bei ungültiger URL", async () => {
    await expect(
      extractYoutube("https://example.com/nicht-youtube")
    ).rejects.toThrow("Das ist keine gültige YouTube-URL.");
  });

  it("wirft IngestionError ohne Transkript-Segmente", async () => {
    createMock.mockResolvedValue({
      getInfo: vi.fn().mockResolvedValue({
        basic_info: { title: "Ohne Transkript" },
        getTranscript: vi.fn().mockResolvedValue({
          transcript: { content: { body: { initial_segments: [] } } },
        }),
      }),
    });

    await expect(
      extractYoutube("https://www.youtube.com/watch?v=abcdefghijk")
    ).rejects.toThrow("Für dieses Video ist kein Transkript verfügbar.");
  });
});
