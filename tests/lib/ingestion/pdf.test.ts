// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const extractTextMock = vi.fn();
const getDocumentProxyMock = vi.fn();
vi.mock("unpdf", () => ({
  extractText: (...args: unknown[]) => extractTextMock(...args),
  getDocumentProxy: (...args: unknown[]) => getDocumentProxyMock(...args),
}));

import { extractPdf } from "@/lib/ingestion/pdf";
import { IngestionError } from "@/lib/ingestion/errors";

beforeEach(() => {
  extractTextMock.mockReset();
  getDocumentProxyMock.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extractPdf", () => {
  it("baut Text und Seiten-Offsets aus mehreren Seiten zusammen", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    });
    getDocumentProxyMock.mockResolvedValue({});
    extractTextMock.mockResolvedValue({
      text: ["Seite eins.", "Seite zwei."],
    });

    const result = await extractPdf("https://blob.example/x.pdf");

    expect(result.content).toBe("Seite eins.\n\nSeite zwei.");
    expect(result.meta.pages).toEqual([
      { page: 1, start: 0, end: 11 },
      { page: 2, start: 13, end: 24 },
    ]);
  });

  it("wirft IngestionError, wenn der Download fehlschlägt", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
    });
    await expect(
      extractPdf("https://blob.example/x.pdf")
    ).rejects.toThrow(IngestionError);
  });

  it("wirft IngestionError bei leerem/keinem Text", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    });
    getDocumentProxyMock.mockResolvedValue({});
    extractTextMock.mockResolvedValue({ text: ["   ", ""] });

    await expect(
      extractPdf("https://blob.example/x.pdf")
    ).rejects.toThrow("Diese PDF-Datei enthält keinen lesbaren Text.");
  });
});
