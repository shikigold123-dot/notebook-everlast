// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

import { extractUrl } from "@/lib/ingestion/url";
import { IngestionError } from "@/lib/ingestion/errors";

describe("extractUrl", () => {
  it("extrahiert Titel und Artikeltext aus HTML", async () => {
    const absatz =
      "Ein langer Absatz mit genug Text, damit Readability ihn als Hauptinhalt erkennt. ".repeat(
        8
      );
    const html = `<html><head><title>Test</title></head><body>
      <article><h1>Überschrift</h1><p>${absatz}</p></article>
    </body></html>`;
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: async () => html,
    });

    const result = await extractUrl("https://example.com/artikel");

    expect(result.content).toContain("Ein langer Absatz");
    expect(result.title.length).toBeGreaterThan(0);
  });

  it("wirft IngestionError, wenn die Seite nicht erreichbar ist", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
    });
    await expect(
      extractUrl("https://example.com/x")
    ).rejects.toThrow(IngestionError);
  });

  it("wirft IngestionError bei nicht-Artikel-Inhalt", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      text: async () => "<html><body><div>zu kurz</div></body></html>",
    });
    await expect(
      extractUrl("https://example.com/x")
    ).rejects.toThrow(IngestionError);
  });
});
