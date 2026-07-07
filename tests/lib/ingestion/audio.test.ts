// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const createTranscriptionMock = vi.fn();
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(function (this: unknown) {
    return {
      audio: {
        transcriptions: {
          create: (...args: unknown[]) => createTranscriptionMock(...args),
        },
      },
    };
  }),
}));

import { extractAudio } from "@/lib/ingestion/audio";
import { IngestionError } from "@/lib/ingestion/errors";

beforeEach(() => {
  createTranscriptionMock.mockReset();
  process.env.OPENAI_API_KEY = "test-key";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extractAudio", () => {
  it("liefert Text und Dauer aus der Transkription", async () => {
    createTranscriptionMock.mockResolvedValue({
      text: "Hallo Welt.",
      duration: 12.4,
    });

    const result = await extractAudio("https://blob.example/x.mp3");

    expect(result.content).toBe("Hallo Welt.");
    expect(result.meta.duration_s).toBe(12);
  });

  it("erkennt den echten Dateityp aus der Blob-URL statt hart mp3 anzunehmen", async () => {
    createTranscriptionMock.mockResolvedValue({ text: "Hallo.", duration: 5 });

    await extractAudio("https://blob.example/aufnahme-abc123.wav");

    const callArgs = createTranscriptionMock.mock.calls[0][0];
    expect(callArgs.file.name).toBe("audio.wav");
    expect(callArgs.file.type).toBe("audio/wav");
  });

  it("fällt bei unbekannter/fehlender Endung auf mp3 zurück", async () => {
    createTranscriptionMock.mockResolvedValue({ text: "Hallo.", duration: 5 });

    await extractAudio("https://blob.example/aufnahme-ohne-endung");

    const callArgs = createTranscriptionMock.mock.calls[0][0];
    expect(callArgs.file.name).toBe("audio.mp3");
    expect(callArgs.file.type).toBe("audio/mpeg");
  });

  it("wirft IngestionError, wenn der Download fehlschlägt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 })
    );
    await expect(
      extractAudio("https://blob.example/x.mp3")
    ).rejects.toThrow(IngestionError);
  });

  it("wirft IngestionError, wenn Whisper fehlschlägt", async () => {
    createTranscriptionMock.mockRejectedValue(new Error("API down"));
    await expect(
      extractAudio("https://blob.example/x.mp3")
    ).rejects.toThrow("Die Transkription ist fehlgeschlagen");
  });

  it("wirft IngestionError, wenn die Datei länger als 30 Minuten ist", async () => {
    createTranscriptionMock.mockResolvedValue({
      text: "Sehr langer Text.",
      duration: 1801,
    });
    await expect(
      extractAudio("https://blob.example/x.mp3")
    ).rejects.toThrow(
      "Audio-Dateien dürfen höchstens 30 Minuten lang sein."
    );
  });
});
